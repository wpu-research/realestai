import { Hono } from "hono";
import { cors } from "hono/cors";
import { createHash, randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ilanAyikla } from "../ai/claude.js";
import type { Kullanici } from "../auth.js";
import { sql } from "../db.js";
import { ADAY_DURUM_ETIKET } from "../lib/bicim.js";
import { radarPuanla } from "../lib/radar.js";
import { zip } from "../lib/zip.js";

// Radar tarayıcı eklentisinin API'si. Oturum çerezi yerine ekip üyesine verilen anahtarla (Bearer) çalışır.
export const eklenti = new Hono<{ Variables: { kullanici: Kullanici; anahtarId: string } }>();

const ozet = (anahtar: string) => createHash("sha256").update(anahtar).digest("hex");

export async function anahtarUret(kullaniciId: string, ad: string): Promise<string> {
  const anahtar = `rea_${randomBytes(24).toString("hex")}`;
  await sql`insert into eklenti_anahtarlari (kullanici_id, ad, ozet) values (${kullaniciId}, ${ad}, ${ozet(anahtar)})`;
  return anahtar;
}

const EKLENTI_DIZIN = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "eklenti");
// Panelden indirilen zip; sunucu adresi ayar.js'e yazılır, anahtar yazılmaz (paket paylaşılsa da güvende kalsın).
export async function eklentiPaketi(sunucu: string): Promise<Buffer> {
  const dosyalar = [];
  for (const ad of (await readdir(EKLENTI_DIZIN)).sort()) {
    let veri = await readFile(join(EKLENTI_DIZIN, ad));
    if (ad === "ayar.js") veri = Buffer.from(`export const VARSAYILAN_SUNUCU = ${JSON.stringify(sunucu)};\n`);
    dosyalar.push({ ad: `realestai-radar/${ad}`, veri });
  }
  return zip(dosyalar);
}

eklenti.use("*", cors({
  origin: (o) => (/^(chrome|moz)-extension:\/\//.test(o) ? o : null),
  allowHeaders: ["Authorization", "Content-Type"],
  allowMethods: ["GET", "POST"],
  maxAge: 86400,
}));

eklenti.use("*", async (c, next) => {
  const anahtar = c.req.header("authorization")?.match(/^Bearer (rea_[0-9a-f]{48})$/)?.[1];
  if (!anahtar) return c.json({ hata: "anahtar gerekli" }, 401);
  const [k] = await sql<(Kullanici & { anahtar_id: string })[]>`
    update eklenti_anahtarlari a set son_kullanim = now() from kullanicilar k
    where a.ozet = ${ozet(anahtar)} and a.iptal_at is null and k.id = a.kullanici_id and k.aktif
    returning k.id, k.eposta, k.ad, k.rol, a.id as anahtar_id`;
  if (!k) return c.json({ hata: "anahtar geçersiz" }, 401);
  c.set("kullanici", k);
  c.set("anahtarId", k.anahtar_id);
  await next();
});

eklenti.get("/ben", async (c) => {
  const mahalleler = await sql`select id, ad, ilce, slug from mahalleler order by ilce, ad`;
  return c.json({ ad: c.get("kullanici").ad, mahalleler });
});

// Aynı ilan iki kez eklenmesin: sitenin ilan numarası yoksa adresten (sorgu ve # olmadan) kimlik üretilir.
function ilanKimligi(b: Record<string, unknown>): string {
  const no = metin(b.kaynak_ilan_no, 60);
  if (no) return no;
  const url = metin(b.kaynak_url, 2000);
  if (url) {
    try {
      const u = new URL(url);
      return `u:${createHash("sha1").update(u.host + u.pathname.replace(/\/+$/, "")).digest("hex").slice(0, 16)}`;
    } catch { /* geçersiz adres: metinden üret */ }
  }
  return `m:${createHash("sha1").update(`${metin(b.baslik, 300)}|${metin(b.aciklama, 6000)}`).digest("hex").slice(0, 16)}`;
}
function metin(x: unknown, uzunluk: number): string | null {
  const s = typeof x === "string" ? x.trim() : "";
  return s ? s.slice(0, uzunluk) : null;
}
function sayi(x: unknown): number | null {
  const s = typeof x === "string" ? x.replace(/\s/g, "").replace(",", ".") : x;
  const n = Number(s);
  return s !== "" && s != null && Number.isFinite(n) && n >= 0 ? n : null;
}
const secenek = <T extends string>(x: unknown, liste: readonly T[]) => (liste.includes(x as T) ? (x as T) : null);
const kaynakAdi = (x: unknown) => (typeof x === "string" && /^[a-z_]{2,30}$/.test(x) ? x : "diger");

eklenti.post("/kontrol", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const [a] = await sql`select id, durum from adaylar where kaynak = ${kaynakAdi(b.kaynak)} and kaynak_ilan_no = ${ilanKimligi(b)}`;
  return c.json(a ? { var: true, durum: a.durum, durum_etiket: ADAY_DURUM_ETIKET[a.durum], yol: `/admin/aday/${a.id}` } : { var: false });
});

eklenti.post("/aday", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const tip = secenek(b.tip, ["satilik", "kiralik", "sezonluk", "gunluk"] as const);
  const baslik = metin(b.baslik, 300);
  if (!tip || !baslik) return c.json({ hata: "başlık ve tip gerekli" }, 400);
  const mahalleId = sayi(b.mahalle_id);
  const kayit = {
    kaynak: kaynakAdi(b.kaynak), kaynak_url: metin(b.kaynak_url, 2000), kaynak_ilan_no: ilanKimligi(b),
    tip, emlak_turu: secenek(b.emlak_turu, ["daire", "villa", "mustakil", "rezidans", "arsa", "diger"] as const), baslik,
    mahalle_id: mahalleId != null && Number.isInteger(mahalleId) ? mahalleId : null,
    net_m2: sayi(b.net_m2), oda: metin(b.oda, 10), yatak_kapasitesi: sayi(b.yatak_kapasitesi), fiyat: sayi(b.fiyat),
    para_birimi: secenek(b.para_birimi, ["TRY", "EUR", "USD", "GBP"] as const) ?? "TRY",
    fiyat_birimi: secenek(b.fiyat_birimi, ["toplam", "aylik", "sezon", "gecelik", "haftalik"] as const),
    yayinda_gun: sayi(b.yayinda_gun), ilan_veren: secenek(b.ilan_veren, ["sahibinden", "emlakci"] as const),
    aciklama: metin(b.aciklama, 6000), sahip_adi: metin(b.sahip_adi, 100), telefon: metin(b.telefon, 30),
    notlar: metin(b.notlar, 2000), ekleyen: c.get("kullanici").id, atanan: c.get("kullanici").id,
  };
  if (kayit.mahalle_id != null) {
    const [m] = await sql`select 1 from mahalleler where id = ${kayit.mahalle_id}`;
    if (!m) kayit.mahalle_id = null;
  }
  // Yeniden eklenen ilan güncellenir; fiyat düştüyse işaretlenir. Atanan ve durum korunur.
  const [a] = await sql`insert into adaylar ${sql(kayit)}
    on conflict (kaynak, kaynak_ilan_no) do update set
      fiyat_dustu = adaylar.fiyat_dustu or coalesce(excluded.fiyat < adaylar.fiyat, false),
      fiyat = coalesce(excluded.fiyat, adaylar.fiyat), para_birimi = excluded.para_birimi,
      baslik = excluded.baslik, net_m2 = coalesce(excluded.net_m2, adaylar.net_m2), oda = coalesce(excluded.oda, adaylar.oda),
      mahalle_id = coalesce(excluded.mahalle_id, adaylar.mahalle_id), yayinda_gun = coalesce(excluded.yayinda_gun, adaylar.yayinda_gun),
      aciklama = coalesce(excluded.aciklama, adaylar.aciklama), ilan_veren = coalesce(excluded.ilan_veren, adaylar.ilan_veren),
      telefon = coalesce(excluded.telefon, adaylar.telefon), sahip_adi = coalesce(excluded.sahip_adi, adaylar.sahip_adi),
      updated_at = now()
    returning id, (xmax = 0) as yeni`;
  await radarPuanla();
  const [p] = await sql`select iskonto, sahip_olasiligi, firsat, oncelik from adaylar where id = ${a.id}`;
  return c.json({
    yeni: a.yeni, yol: `/admin/aday/${a.id}`, firsat: p.firsat,
    iskonto: p.iskonto == null ? null : Number(p.iskonto), sahip_olasiligi: p.sahip_olasiligi == null ? null : Number(p.sahip_olasiligi),
  }, a.yeni ? 201 : 200);
});

// Claude ile alan çıkarma (ücretli): anahtar başına 10 dakikada 40 istek.
const pencere = new Map<string, { n: number; bas: number }>();
eklenti.post("/ayikla", async (c) => {
  if (!process.env.ANTHROPIC_API_KEY) return c.json({ hata: "ANTHROPIC_API_KEY tanımlı değil" }, 503);
  const id = c.get("anahtarId");
  const p = pencere.get(id);
  if (!p || Date.now() - p.bas > 600_000) pencere.set(id, { n: 1, bas: Date.now() });
  else if (++p.n > 40) return c.json({ hata: "çok fazla istek, biraz sonra deneyin" }, 429);
  const b = await c.req.json<Record<string, unknown>>();
  const icerik = metin(b.metin, 8000);
  if (!icerik) return c.json({ hata: "metin gerekli" }, 400);
  try {
    const s = await ilanAyikla(metin(b.baslik, 300) ?? "", icerik, metin(b.url, 2000) ?? "");
    if (!s) return c.json({ hata: "metin yorumlanamadı" }, 422);
    const { mahalle, ...alanlar } = s;
    const [m] = mahalle ? await sql`select id from mahalleler where slug = ${mahalle}` : [];
    return c.json({ alanlar: { ...alanlar, mahalle_id: m?.id ?? null } });
  } catch (e) {
    console.error("eklenti ayikla", e);
    return c.json({ hata: "Claude'a ulaşılamadı" }, 502);
  }
});

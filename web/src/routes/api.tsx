import { Hono } from "hono";
import { asistan, sesliArama, type AsistanMesaj } from "../ai/claude.js";
import { sql } from "../db.js";
import { filtreUrl, ilanAra, type Filtreler, type IlanKart } from "../lib/arama.js";
import { IlanKarti } from "../views/layout.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { t } from "../lib/dil.js";
import { avatarAyar, imzala, imzaDogru, klonSesAcik, SesHatasi, sesUret } from "../lib/avatar.js";

export const api = new Hono();

// Basit IP başına sınır (Claude çağrıları ücretli). Tek süreçli servis için bellek yeterli.
const pencere = new Map<string, { n: number; bas: number }>();
function sinirAsildi(ip: string, limit = 30, ms = 10 * 60_000): boolean {
  const simdi = Date.now();
  const p = pencere.get(ip);
  if (!p || simdi - p.bas > ms) { pencere.set(ip, { n: 1, bas: simdi }); return false; }
  return ++p.n > limit;
}
const ipAl = (h: (k: string) => string | undefined) => h("x-forwarded-for")?.split(",")[0].trim() ?? "yerel";

api.post("/sesli-arama", async (c) => {
  if (sinirAsildi(ipAl(c.req.header.bind(c.req)))) return c.json({ hata: "çok fazla istek, biraz sonra deneyin" }, 429);
  const { metin, dil = "tr", onceki } = await c.req.json<{ metin?: string; dil?: string; onceki?: Filtreler }>();
  if (typeof metin !== "string" || !metin.trim() || metin.length > 1000) return c.json({ hata: "metin gerekli" }, 400);
  try {
    const sonuc = await sesliArama(metin.trim(), dil, onceki);
    sql`insert into sesli_arama_kayitlari (metin, filtreler, dil) values (${metin}, ${sql.json(sonuc.filtreler as any)}, ${dil})`
      .catch((e) => console.error("arama kaydı", e));
    return c.json({ ...sonuc, url: `/ara?${filtreUrl(sonuc.filtreler)}` });
  } catch (e) {
    console.error("sesli-arama", e);
    return c.json({ hata: "arama yorumlanamadı" }, 500);
  }
});

api.post("/asistan", async (c) => {
  if (sinirAsildi(ipAl(c.req.header.bind(c.req)), 60)) return c.json({ hata: "çok fazla istek, biraz sonra deneyin" }, 429);
  const { mesajlar = [], filtreler = {}, dil = "tr", oturum_id } =
    await c.req.json<{ mesajlar?: AsistanMesaj[]; filtreler?: Filtreler; dil?: string; oturum_id?: string }>();
  if (!Array.isArray(mesajlar) || mesajlar.length > 40 || mesajlar.some((m) => typeof m?.metin !== "string" || m.metin.length > 1000)) {
    return c.json({ hata: "geçersiz konuşma" }, 400);
  }
  try {
    const sonuc = await asistan(mesajlar, filtreler, dil);
    let id = oturum_id;
    try {
      if (id) {
        await sql`update asistan_oturumlari set filtreler = ${sql.json(sonuc.filtreler as any)}, tamamlandi = ${sonuc.tamamlandi},
                  adim_sayisi = ${Math.ceil(mesajlar.length / 2) + 1}, updated_at = now() where id = ${id}`;
      } else {
        [{ id }] = await sql<{ id: string }[]>`insert into asistan_oturumlari (kanal, dil, filtreler, tamamlandi, adim_sayisi)
                  values ('avatar', ${dil}, ${sql.json(sonuc.filtreler as any)}, ${sonuc.tamamlandi}, 1) returning id`;
      }
    } catch (e) { console.error("oturum kaydı", e); }
    // İmza: /api/ses yalnız asistanın bu cevabını Didem'in sesiyle okur.
    const imza = klonSesAcik(await avatarAyar()) ? await imzala(sonuc.cevap) : null;
    return c.json({ ...sonuc, imza, oturum_id: id, url: `/ara?${filtreUrl(sonuc.filtreler)}` });
  } catch (e) {
    console.error("asistan", e);
    return c.json({ hata: "asistan şu an yanıt veremiyor" }, 500);
  }
});

// Didem'in klon sesi. Yalnız imzalı (asistanın ürettiği ya da sayfadaki sabit) metinler okunur.
api.post("/ses", async (c) => {
  if (sinirAsildi(`ses:${ipAl(c.req.header.bind(c.req))}`, 80)) return c.json({ hata: "çok fazla istek" }, 429);
  const { metin, imza } = await c.req.json<{ metin?: string; imza?: string }>().catch(() => ({} as { metin?: string; imza?: string }));
  if (typeof metin !== "string" || typeof imza !== "string" || !(await imzaDogru(metin, imza))) {
    return c.json({ hata: "imza geçersiz" }, 403);
  }
  try {
    const ses = await sesUret(metin);
    return c.body(new Uint8Array(ses), 200, { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" });
  } catch (e) {
    if (e instanceof SesHatasi) return c.json({ hata: e.message }, e.durum);
    console.error("ses", e);
    return c.json({ hata: "ses üretilemedi" }, 500);
  }
});

// Sihirbaz son ekranı: kaç ilan çıkıyor.
api.post("/sayim", async (c) => {
  const f = await c.req.json<Filtreler>();
  return c.json({ sayi: await ilanAra(f, { sayim: true }), url: `/ara?${filtreUrl(f)}` });
});

api.post("/sihirbaz-oturum", async (c) => {
  const { filtreler = {}, tamamlandi = false, adim_sayisi = 0, sonuc_sayisi = null } = await c.req.json();
  await sql`insert into asistan_oturumlari (kanal, filtreler, tamamlandi, adim_sayisi, sonuc_sayisi)
            values ('sihirbaz', ${sql.json(filtreler)}, ${!!tamamlandi}, ${Number(adim_sayisi) || 0}, ${sonuc_sayisi})`;
  return c.json({ ok: true });
});

// Favori sayacı (anonim; hangi ilan kaç kez kaydedildi). Kayıtların kendisi tarayıcıda.
api.post("/favori", async (c) => {
  const { no, artis } = await c.req.json<{ no?: number; artis?: number }>();
  if (!Number.isInteger(no) || (artis !== 1 && artis !== -1)) return c.json({ hata: "geçersiz" }, 400);
  await sql`insert into favori_sayaci (ilan_id, adet)
            select id, greatest(${artis}, 0) from ilanlar where ilan_no = ${no!}
            on conflict (ilan_id) do update set adet = greatest(favori_sayaci.adet + ${artis}, 0)`;
  return c.json({ ok: true });
});

// Kaydedilenler sayfası için ilan kartları (HTML), ilan numarası sırasıyla.
api.get("/kartlar", async (c) => {
  const nolar = (c.req.query("no") ?? "").split(",").map(Number).filter((x) => Number.isInteger(x) && x > 0).slice(0, 200);
  if (!nolar.length) return c.html("");
  const kartlar = (await ilanAra({}, { limit: 500 }) as IlanKart[]).filter((i) => nolar.includes(i.ilan_no))
    .sort((a, b) => nolar.indexOf(a.ilan_no) - nolar.indexOf(b.ilan_no));
  return c.html(<>{kartlar.map((i) => <IlanKarti i={i} />)}</>);
});

// Sihirbaz soruları seçili dilde (data/sihirbaz.json Türkçe kaynaktır).
const SIHIRBAZ = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "sihirbaz.json"), "utf8"));
api.get("/sihirbaz", (c) => {
  const cevir = (x: any): any => {
    if (Array.isArray(x)) return x.map(cevir);
    if (x && typeof x === "object") {
      return Object.fromEntries(Object.entries(x).map(([k, v]) =>
        [k, typeof v === "string" && ["soru", "etiket", "yardim"].includes(k) ? t(v)
          : k === "birimEtiketi" ? Object.fromEntries(Object.entries(v as Record<string, string>).map(([a, b]) => [a, t(b)])) : cevir(v)]));
    }
    return x;
  };
  return c.json(cevir(SIHIRBAZ));
});

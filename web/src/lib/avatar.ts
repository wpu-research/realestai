// Didem avatarı: rıza durumu, mod, klon ses üretimi (ElevenLabs) ve maliyet sınırı.
// Ses ve yüz biyometrik veridir: rıza yoksa ya da geri alındıysa sitede yalnız genel görsel + tarayıcı sesi kullanılır.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { UPLOAD_DIZIN } from "../config.js";
import { sql } from "../db.js";

export type AvatarMod = "tarayici" | "klon";
export type AvatarAyar = {
  mod: AvatarMod;
  riza_tarihi: string | null;        // Didem'in yazılı açık rızasının tarihi (YYYY-AA-GG)
  riza_belgesi: string | null;       // UPLOAD_DIZIN altında, yalnız admin indirir
  geri_alindi_at: string | null;
  foto: string | null;               // UPLOAD_DIZIN/avatar altında dosya adı
  gunluk_karakter: number;           // ElevenLabs'e günde en fazla gönderilecek karakter
};
const VARSAYILAN: AvatarAyar = {
  mod: "tarayici", riza_tarihi: null, riza_belgesi: null, geri_alindi_at: null, foto: null, gunluk_karakter: 20_000,
};
export const AVATAR_DIZIN = join(UPLOAD_DIZIN, "avatar");
const SES_DIZIN = join(UPLOAD_DIZIN, "ses");
const MAKS_METIN = 600;

let onbellek: AvatarAyar | null = null;
export async function avatarAyar(): Promise<AvatarAyar> {
  if (!onbellek) {
    const [r] = await sql`select deger from ayarlar where anahtar = 'avatar'`;
    onbellek = { ...VARSAYILAN, ...(r?.deger ?? {}) };
  }
  return onbellek!;
}
export async function avatarAyarKaydet(degisiklik: Partial<AvatarAyar>): Promise<AvatarAyar> {
  const yeni = { ...(await avatarAyar()), ...degisiklik };
  await sql`insert into ayarlar (anahtar, deger) values ('avatar', ${sql.json(yeni as any)})
    on conflict (anahtar) do update set deger = excluded.deger, updated_at = now()`;
  onbellek = yeni;
  return yeni;
}

export const sesAnahtarlariVar = () => !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_SES_ID);
export const rizaGecerli = (a: AvatarAyar) => !!a.riza_tarihi && !a.geri_alindi_at;
// Sitede Didem'in fotoğrafı yalnız geçerli rıza varken gösterilir.
export const fotoGosterilir = (a: AvatarAyar) => rizaGecerli(a) && !!a.foto;
// Klon ses: rıza + mod + anahtarlar. Biri eksikse tarayıcı sesi.
export const klonSesAcik = (a: AvatarAyar) => rizaGecerli(a) && a.mod === "klon" && sesAnahtarlariVar();

// ---- İmza: klon ses yalnız asistanın kendi ürettiği metinleri okur ----
// Aksi halde herkes /api/ses'e istediği cümleyi gönderip Didem'in sesiyle söyletebilirdi.
let imzaAnahtari: Buffer | null = null;
async function anahtar(): Promise<Buffer> {
  if (imzaAnahtari) return imzaAnahtari;
  const [r] = await sql`select deger from ayarlar where anahtar = 'ses_imza'`;
  if (r) return (imzaAnahtari = Buffer.from(r.deger as string, "hex"));
  const yeni = randomBytes(32).toString("hex");
  await sql`insert into ayarlar (anahtar, deger) values ('ses_imza', ${sql.json(yeni)}) on conflict (anahtar) do nothing`;
  imzaAnahtari = null;
  return anahtar();
}
export async function imzala(metin: string): Promise<string> {
  return createHmac("sha256", await anahtar()).update(metin).digest("base64url");
}
export async function imzaDogru(metin: string, imza: string): Promise<boolean> {
  const beklenen = Buffer.from(await imzala(metin));
  const gelen = Buffer.from(String(imza));
  return beklenen.length === gelen.length && timingSafeEqual(beklenen, gelen);
}

// ---- Klon ses ----
export class SesHatasi extends Error {
  constructor(message: string, readonly durum: 400 | 403 | 429 | 502 | 503) { super(message); }
}

const model = () => process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";
const API = () => process.env.ELEVENLABS_URL ?? "https://api.elevenlabs.io";   // testte sahte sunucu

// Aynı cümle (karşılama, sık sorular) bir kez üretilir, diskten verilir; sağlayıcı maliyeti düşer.
export async function sesUret(metin: string): Promise<Buffer> {
  const a = await avatarAyar();
  if (!klonSesAcik(a)) throw new SesHatasi("klon ses kapalı", 503);
  metin = metin.trim();
  if (!metin || metin.length > MAKS_METIN) throw new SesHatasi("metin uzunluğu geçersiz", 400);
  const sesId = process.env.ELEVENLABS_SES_ID!;
  const dosya = join(SES_DIZIN, `${createHash("sha256").update(`${sesId}|${model()}|${metin}`).digest("hex")}.mp3`);
  try {
    const veri = await readFile(dosya);
    await sql`insert into ses_kullanim (gun, onbellek) values (current_date, 1)
      on conflict (gun) do update set onbellek = ses_kullanim.onbellek + 1`;
    return veri;
  } catch { /* önbellekte yok */ }

  // Bütçe: karakter önce ayrılır (eşzamanlı isteklerde sınır aşılmasın), hata olursa geri verilir.
  const [k] = await sql`insert into ses_kullanim (gun, karakter, istek) values (current_date, ${metin.length}, 1)
    on conflict (gun) do update set karakter = ses_kullanim.karakter + excluded.karakter, istek = ses_kullanim.istek + 1
    returning karakter`;
  if (k.karakter > a.gunluk_karakter) {
    await sql`update ses_kullanim set karakter = karakter - ${metin.length} where gun = current_date`;
    throw new SesHatasi("günlük ses bütçesi doldu", 429);
  }
  const r = await fetch(`${API()}/v1/text-to-speech/${encodeURIComponent(sesId)}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: metin, model_id: model(), voice_settings: { stability: 0.5, similarity_boost: 0.8 } }),
    signal: AbortSignal.timeout(20_000),
  }).catch((e) => e as Error);
  if (r instanceof Error || !r.ok) {
    await sql`update ses_kullanim set karakter = karakter - ${metin.length} where gun = current_date`;
    console.error("elevenlabs", r instanceof Error ? r.message : `${r.status} ${await r.text().catch(() => "")}`);
    throw new SesHatasi("ses üretilemedi", 502);
  }
  const veri = Buffer.from(await r.arrayBuffer());
  await mkdir(SES_DIZIN, { recursive: true });
  await writeFile(dosya, veri);
  return veri;
}

// ---- Rızanın geri alınması: her şey tek seferde kapanır ve silinir ----
export async function rizayiGeriAl(): Promise<string[]> {
  const a = await avatarAyar();
  const rapor: string[] = [];
  await avatarAyarKaydet({ mod: "tarayici", geri_alindi_at: new Date().toISOString(), foto: null });
  rapor.push("Sitede klon ses ve fotoğraf kapatıldı; genel görsel ve tarayıcı sesine dönüldü.");
  await rm(AVATAR_DIZIN, { recursive: true, force: true });
  if (a.foto) rapor.push("Didem'in fotoğrafı sunucudan silindi.");
  await rm(SES_DIZIN, { recursive: true, force: true });
  rapor.push("Önbellekteki tüm klon ses kayıtları silindi.");
  if (sesAnahtarlariVar()) {
    const r = await fetch(`${API()}/v1/voices/${encodeURIComponent(process.env.ELEVENLABS_SES_ID!)}`, {
      method: "DELETE", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! }, signal: AbortSignal.timeout(20_000),
    }).catch((e) => e as Error);
    rapor.push(r instanceof Error || !r.ok
      ? `ElevenLabs'teki ses modeli SİLİNEMEDİ (${r instanceof Error ? r.message : r.status}); ElevenLabs panelinden elle silin.`
      : "ElevenLabs'teki ses modeli silindi.");
    rapor.push("Railway'den ELEVENLABS_SES_ID değişkenini kaldırın.");
  } else {
    rapor.push("ElevenLabs anahtarı tanımlı değil; sağlayıcıda ses modeli varsa elle silin.");
  }
  rapor.push("Rıza belgesi kayıt olarak saklanmaya devam eder (geri alma tarihiyle birlikte).");
  return rapor;
}

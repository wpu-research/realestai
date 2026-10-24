import { Hono } from "hono";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { UPLOAD_DIZIN } from "../config.js";

// Küçültülmüş görseller: /kucuk/<genişlik>/img/... ya da /kucuk/<genişlik>/uploads/ilan/...
// İlk istekte WebP üretilir ve diske yazılır; sonrakiler diskten. Yalnız izinli genişlikler ve dizinler.
export const gorsel = new Hono();

export const GENISLIKLER = [240, 480, 640, 960, 1280] as const;
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public");
const ONBELLEK = join(UPLOAD_DIZIN, "kucuk");

// Kaynak dosyanın diskteki yeri; izin verilmeyen ya da dizin dışına çıkan yol için null.
export function kaynakYolu(yol: string): string | null {
  if (!/^\/(img|uploads\/ilan)\/[\w\-./]+\.(jpe?g|png|webp)$/i.test(yol) || yol.includes("..")) return null;
  const tam = yol.startsWith("/img/") ? normalize(join(PUBLIC, yol)) : normalize(join(UPLOAD_DIZIN, yol.replace(/^\/uploads/, "")));
  const kok = yol.startsWith("/img/") ? normalize(PUBLIC) : normalize(UPLOAD_DIZIN);
  return tam.startsWith(kok) ? tam : null;
}

const onbellekAdi = (w: number, yol: string) => join(ONBELLEK, `${createHash("sha1").update(`${w}|${yol}`).digest("hex")}.webp`);
// Kaynak silinince küçük kopyaları da silinir (silinen fotoğraf önbellekten görünmeye devam etmesin).
export const kucukleriSil = (yol: string) => Promise.all(GENISLIKLER.map((w) => rm(onbellekAdi(w, yol), { force: true })));

gorsel.get("/kucuk/:w{[0-9]+}/*", async (c) => {
  const w = Number(c.req.param("w"));
  const yol = c.req.path.slice(`/kucuk/${w}`.length);
  const kaynak = kaynakYolu(yol);
  if (!(GENISLIKLER as readonly number[]).includes(w) || !kaynak) return c.notFound();
  const hedef = onbellekAdi(w, yol);
  let veri: Buffer;
  try {
    veri = await readFile(hedef);
  } catch {
    let ham: Buffer;
    try { ham = await readFile(kaynak); } catch { return c.notFound(); }
    veri = await sharp(ham).rotate().resize(w, null, { withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    await mkdir(ONBELLEK, { recursive: true });
    const gecici = `${hedef}.${process.pid}.tmp`;
    await writeFile(gecici, veri);
    await rename(gecici, hedef);
  }
  return c.body(new Uint8Array(veri), 200, {
    "Content-Type": "image/webp",
    // Yüklenen fotoğrafların adı değişmez (uuid); /img görselleri deploy ile değişebilir.
    "Cache-Control": yol.startsWith("/uploads/") ? "public, max-age=31536000, immutable" : "public, max-age=604800",
  });
});

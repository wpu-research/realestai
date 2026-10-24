// Kaydedilenleri (favori ilanlar, kayıtlı aramalar) başka cihaza taşıma kodu.
// Kişisel veri içermez: yalnız ilan numaraları ve arama adresleri; kod 24 saat sonra silinir.
import { randomInt } from "node:crypto";

export type Aktarim = { ilanlar: number[]; aramalar: { ad: string; url: string; tarih: string }[] };

// Karışan harfler (0/O, 1/I/L) yok; elle yazılırken hata azalır.
const ABECE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const kodUret = () => Array.from({ length: 8 }, () => ABECE[randomInt(ABECE.length)]).join("");
// "abcd-efgh", "ABCD EFGH" → "ABCDEFGH"; O→0 gibi düzeltme yapılmaz, alfabe dışı kod geçersizdir.
export function kodDuzelt(x: string): string | null {
  const k = x.toUpperCase().replace(/[\s-]/g, "");
  return k.length === 8 && [...k].every((h) => ABECE.includes(h)) ? k : null;
}
export const kodGoster = (k: string) => `${k.slice(0, 4)}-${k.slice(4)}`;

// Sitenin kendi sayfası olmayan adresler (javascript:, //başka-site) alınmaz.
const yerelYol = (u: unknown): u is string => typeof u === "string" && /^\/(?![\/\\])/.test(u) && u.length <= 1000;

export function aktarimAyikla(g: any): Aktarim | null {
  const ilanlar = [...new Set(([] as unknown[]).concat(g?.ilanlar ?? []).filter((x): x is number => Number.isInteger(x) && (x as number) > 0))].slice(0, 200);
  const aramalar = ([] as any[]).concat(g?.aramalar ?? [])
    .filter((a) => a && yerelYol(a.url))
    .slice(0, 50)
    .map((a) => ({
      ad: String(a.ad ?? "").trim().slice(0, 80) || "Arama",
      url: a.url as string,
      tarih: Number.isFinite(Date.parse(a.tarih)) ? new Date(a.tarih).toISOString() : new Date().toISOString(),
    }));
  return ilanlar.length || aramalar.length ? { ilanlar, aramalar } : null;
}

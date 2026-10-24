import { AsyncLocalStorage } from "node:async_hooks";
import { CEVIRI } from "./ceviri.js";

// Site dili istek başına AsyncLocalStorage'da tutulur; bileşenler t() ile çevirir.
// Anahtar Türkçe metnin kendisidir; çevirisi olmayan metin Türkçe kalır.
export const DILLER = ["tr", "en", "ru", "de"] as const;
export type Dil = (typeof DILLER)[number];

const depo = new AsyncLocalStorage<{ dil: Dil }>();
export const dilIle = <T>(dil: Dil, fn: () => T) => depo.run({ dil }, fn);
export const dil = (): Dil => depo.getStore()?.dil ?? "tr";

const SIRA: Record<Exclude<Dil, "tr">, 0 | 1 | 2> = { en: 0, ru: 1, de: 2 };

export function t(metin: string, degisken?: Record<string, string | number>): string {
  const d = dil();
  let sonuc = d === "tr" ? metin : CEVIRI[metin]?.[SIRA[d]] ?? metin;
  if (degisken) for (const [k, v] of Object.entries(degisken)) sonuc = sonuc.replaceAll(`{${k}}`, String(v));
  return sonuc;
}

// Tarayıcı betiklerinin kullandığı metinler (sayfaya JSON olarak gömülür).
export function istemciCevirileri(anahtarlar: string[]): Record<string, string> {
  return Object.fromEntries(anahtarlar.map((k) => [k, t(k)]));
}

// Konuşma tanıma / sesli okuma için BCP-47 kodu
export const SES_DILI: Record<Dil, string> = { tr: "tr-TR", en: "en-US", ru: "ru-RU", de: "de-DE" };

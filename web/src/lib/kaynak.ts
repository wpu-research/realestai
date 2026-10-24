// Formla gelen kanal bilgisi (genel.js oturum boyunca tutar, yalnız form gönderilince iletilir).
import { dil } from "./dil.js";

const temiz = (x: unknown) => {
  const s = typeof x === "string" ? x.trim().toLowerCase().slice(0, 60) : "";
  return /^[a-z0-9._-]+$/.test(s) ? s : null;
};
export const formKaynagi = (b: Record<string, unknown>) => ({ dil: dil(), kaynak: temiz(b.kaynak), kampanya: temiz(b.kampanya) });

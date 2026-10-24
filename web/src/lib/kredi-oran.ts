// Konut kredisi banka oranları (Admin → Kredi oranları). Bankalardan otomatik veri alınmaz;
// ekip bankaların sitelerinden bakıp girer, sayfada güncelleme tarihiyle gösterilir.
import { sql } from "../db.js";

export type BankaOrani = {
  banka: string;
  faiz: number;          // aylık %, ör. 2.89
  tahsis: number;        // kredi tahsis ücreti, kredi tutarının %'si (yasal üst sınır binde 5)
  azami_vade: number;    // ay
};
export type KrediOranlari = { oranlar: BankaOrani[]; guncelleme: string | null; kaynak: string };

const BOS: KrediOranlari = { oranlar: [], guncelleme: null, kaynak: "" };
// Bu kadar eski oranlar sitede gösterilmez: yanıltıcı olur.
export const ESKI_GUN = 45;

export async function krediOranlari(): Promise<KrediOranlari> {
  const [r] = await sql`select deger from ayarlar where anahtar = 'kredi'`;
  return { ...BOS, ...(r?.deger ?? {}) };
}
export async function krediOranlariKaydet(k: KrediOranlari) {
  await sql`insert into ayarlar (anahtar, deger) values ('kredi', ${sql.json(k as any)})
    on conflict (anahtar) do update set deger = excluded.deger, updated_at = now()`;
}

export function gunOnce(tarih: string | null, bugun = new Date()): number | null {
  if (!tarih) return null;
  const t = Date.parse(tarih);
  return Number.isFinite(t) ? Math.floor((bugun.getTime() - t) / 86_400_000) : null;
}

// Formdan gelen satırlar: boş satırlar atlanır, hatalı değerler reddedilir.
export function oranlariAyikla(banka: string[], faiz: string[], tahsis: string[], vade: string[]): { oranlar: BankaOrani[]; hatalar: string[] } {
  const oranlar: BankaOrani[] = [];
  const hatalar: string[] = [];
  const sayi = (x: string | undefined) => Number(String(x ?? "").trim().replace(",", "."));
  banka.forEach((ad, i) => {
    ad = ad.trim().slice(0, 60);
    if (!ad) return;
    const f = sayi(faiz[i]);
    const th = String(tahsis[i] ?? "").trim() === "" ? 0.5 : sayi(tahsis[i]);
    const v = String(vade[i] ?? "").trim() === "" ? 120 : sayi(vade[i]);
    if (!(f > 0 && f < 10)) return void hatalar.push(`${ad}: aylık faiz 0 ile 10 arasında olmalı`);
    if (!(th >= 0 && th <= 0.5)) return void hatalar.push(`${ad}: tahsis ücreti %0 ile %0,5 arasında olmalı`);
    if (!(Number.isInteger(v) && v >= 12 && v <= 360)) return void hatalar.push(`${ad}: azami vade 12–360 ay olmalı`);
    oranlar.push({ banka: ad, faiz: f, tahsis: th, azami_vade: v });
  });
  return { oranlar, hatalar };
}

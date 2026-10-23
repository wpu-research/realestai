import { sql } from "../db.js";

// Sesli arama, sihirbaz ve Didem asistanı aynı filtre şeklini üretir; /ara URL'si de bunu taşır.
export type Filtreler = {
  tip?: "satilik" | "kiralik" | "sezonluk" | "gunluk";
  emlak_turu?: string[];
  mahalleler?: string[];
  min_fiyat?: number;
  max_fiyat?: number;
  para_birimi?: "TRY" | "EUR" | "USD" | "GBP";
  oda?: string[];
  min_net_m2?: number;
  min_kapasite?: number;
  havuz?: "ozel" | "ortak" | "herhangi";
  deniz_manzarasi?: boolean;
  max_denize_mesafe_m?: number;
  site_ici?: boolean;
  esyali?: boolean;
  evcil_hayvan?: boolean;
  giris_tarihi?: string;
  cikis_tarihi?: string;
  sadece_firsat?: boolean;
  siralama?: "onerilen" | "fiyat_artan" | "fiyat_azalan" | "en_yeni" | "en_firsat";
  // Harita alanı (Airbnb gibi): [güney, batı, kuzey, doğu]
  sinir?: [number, number, number, number];
};

const DIZI = ["emlak_turu", "mahalleler", "oda"] as const;
const SAYI = ["min_fiyat", "max_fiyat", "min_net_m2", "min_kapasite", "max_denize_mesafe_m"] as const;
const MANTIK = ["deniz_manzarasi", "site_ici", "esyali", "evcil_hayvan", "sadece_firsat"] as const;
const METIN = ["tip", "para_birimi", "havuz", "giris_tarihi", "cikis_tarihi", "siralama"] as const;

// Yaklaşık kurlar (1 birim = X TL). Railway değişkenleriyle güncellenir: KUR_EUR, KUR_USD, KUR_GBP.
export const KUR: Record<string, number> = {
  TRY: 1,
  EUR: Number(process.env.KUR_EUR ?? 48),
  USD: Number(process.env.KUR_USD ?? 42),
  GBP: Number(process.env.KUR_GBP ?? 55),
};

export function filtreOku(q: URLSearchParams): Filtreler {
  const f: Record<string, unknown> = {};
  for (const k of DIZI) {
    const v = q.getAll(k).flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean);
    if (v.length) f[k] = v;
  }
  for (const k of SAYI) {
    const v = Number(q.get(k));
    if (q.get(k) && Number.isFinite(v) && v > 0) f[k] = v;
  }
  for (const k of MANTIK) if (q.get(k) === "1" || q.get(k) === "true") f[k] = true;
  for (const k of METIN) if (q.get(k)) f[k] = q.get(k);
  const sinir = (q.get("sinir") ?? "").split(",").map(Number);
  if (sinir.length === 4 && sinir.every(Number.isFinite) && sinir[0] < sinir[2] && sinir[1] < sinir[3]) f.sinir = sinir;
  return f as Filtreler;
}

export function filtreUrl(f: Filtreler): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v == null || v === false || v === "" || (Array.isArray(v) && !v.length)) continue;
    q.set(k, Array.isArray(v) ? v.map((x) => (typeof x === "number" ? x.toFixed(5) : x)).join(",") : v === true ? "1" : String(v));
  }
  return q.toString();
}

// Bodrum sezon bandı (günlük kirada fiyat bu banda göre seçilir).
export function sezonBandi(tarih?: string): "yuksek" | "omuz" | "dusuk" {
  const ay = tarih ? new Date(tarih).getMonth() + 1 : new Date().getMonth() + 1;
  if (ay === 7 || ay === 8) return "yuksek";
  if (ay >= 5 && ay <= 10) return "omuz";
  return "dusuk";
}

export type IlanKart = {
  id: string; ilan_no: number; tip: string; emlak_turu: string; baslik: string; demo: boolean;
  mahalle: string | null; mahalle_slug: string | null; ilce: string | null; lat: number | null; lng: number | null;
  net_m2: number | null; oda: string | null; yatak_kapasitesi: number | null;
  havuz: string; deniz_manzarasi: boolean; denize_mesafe_m: number | null;
  fiyat: number; para_birimi: string; fiyat_birimi: string; donem_fiyati: number;
  iskonto: number | null; kapak: string | null;
};

export async function ilanAra(f: Filtreler, opt: { limit?: number; sayim?: boolean } = {}) {
  const kur = KUR[f.para_birimi ?? "TRY"] ?? 1;
  const bant = sezonBandi(f.giris_tarihi);
  // Günlük kirada seçilen tarihin sezon fiyatı, yoksa ilan fiyatı; hepsi TL'ye çevrilir.
  const fiyatTl = sql`(coalesce((i.sezon_fiyatlari ->> ${bant})::numeric, i.fiyat) * case i.para_birimi
      when 'EUR' then ${KUR.EUR}::numeric when 'USD' then ${KUR.USD}::numeric
      when 'GBP' then ${KUR.GBP}::numeric else 1 end)`;
  const odaSayisi = sql`nullif(split_part(i.oda, '+', 1), '')::int`;
  const yuksekOda = f.oda?.some((o) => o.startsWith("4"));

  const kosul = sql`
    i.durum = 'yayinda'
    ${f.tip ? sql`and i.tip = ${f.tip}` : sql``}
    ${f.emlak_turu?.length ? sql`and i.emlak_turu in ${sql(f.emlak_turu)}` : sql``}
    ${f.mahalleler?.length ? sql`and m.slug in ${sql(f.mahalleler)}` : sql``}
    ${f.min_fiyat ? sql`and ${fiyatTl} >= ${f.min_fiyat * kur}` : sql``}
    ${f.max_fiyat ? sql`and ${fiyatTl} <= ${f.max_fiyat * kur}` : sql``}
    ${f.oda?.length ? sql`and (i.oda in ${sql(f.oda)} ${yuksekOda ? sql`or ${odaSayisi} >= 4` : sql``})` : sql``}
    ${f.min_net_m2 ? sql`and i.net_m2 >= ${f.min_net_m2}` : sql``}
    ${f.min_kapasite ? sql`and i.yatak_kapasitesi >= ${f.min_kapasite}` : sql``}
    ${f.havuz === "ozel" || f.havuz === "ortak" ? sql`and i.havuz = ${f.havuz}` : f.havuz ? sql`and i.havuz <> 'yok'` : sql``}
    ${f.deniz_manzarasi ? sql`and i.deniz_manzarasi` : sql``}
    ${f.max_denize_mesafe_m ? sql`and i.denize_mesafe_m <= ${f.max_denize_mesafe_m}` : sql``}
    ${f.site_ici ? sql`and i.site_ici` : sql``}
    ${f.esyali ? sql`and i.esyali` : sql``}
    ${f.evcil_hayvan ? sql`and i.evcil_hayvan` : sql``}
    ${f.sadece_firsat ? sql`and i.iskonto >= 0.15` : sql``}
    ${f.sinir ? sql`and coalesce(i.lat, m.lat) between ${f.sinir[0]} and ${f.sinir[2]}
                    and coalesce(i.lng, m.lng) between ${f.sinir[1]} and ${f.sinir[3]}` : sql``}`;

  if (opt.sayim) {
    const [r] = await sql<{ n: number }[]>`
      select count(*)::int as n from ilanlar i left join mahalleler m on m.id = i.mahalle_id where ${kosul}`;
    return r.n;
  }

  const sira = {
    fiyat_artan: sql`${fiyatTl} asc`,
    fiyat_azalan: sql`${fiyatTl} desc`,
    en_yeni: sql`i.yayinlandi_at desc nulls last`,
    en_firsat: sql`i.iskonto desc nulls last`,
    onerilen: sql`coalesce(i.iskonto, 0) desc, i.yayinlandi_at desc nulls last`,
  }[f.siralama ?? "onerilen"] ?? sql`i.yayinlandi_at desc`;

  return sql<IlanKart[]>`
    select i.id, i.ilan_no, i.tip, i.emlak_turu, i.baslik, i.demo,
           m.ad as mahalle, m.slug as mahalle_slug, m.ilce,
           coalesce(i.lat, m.lat) as lat, coalesce(i.lng, m.lng) as lng,
           i.net_m2, i.oda, i.yatak_kapasitesi, i.havuz, i.deniz_manzarasi, i.denize_mesafe_m,
           i.fiyat, i.para_birimi, i.fiyat_birimi,
           coalesce((i.sezon_fiyatlari ->> ${bant})::numeric, i.fiyat) as donem_fiyati,
           i.iskonto,
           (select url from ilan_fotolari p where p.ilan_id = i.id order by sira limit 1) as kapak
    from ilanlar i left join mahalleler m on m.id = i.mahalle_id
    where ${kosul}
    order by ${sira}
    limit ${opt.limit ?? 60}`;
}

// 0 sonuçta hangi kriteri gevşetmeyi önereceğimiz: sırayla kaldırıp sonuç çıkan ilkini döndür.
export async function gevsetmeOnerisi(f: Filtreler): Promise<{ alan: string; sayi: number } | null> {
  const adaylar: [string, (keyof Filtreler)[]][] = [
    ["harita alanı", ["sinir"]],
    ["bütçe", ["max_fiyat", "min_fiyat"]],
    ["bölge", ["mahalleler"]],
    ["oda sayısı", ["oda"]],
    ["olmazsa olmazlar", ["havuz", "deniz_manzarasi", "max_denize_mesafe_m", "site_ici", "esyali", "evcil_hayvan"]],
    ["fırsat filtresi", ["sadece_firsat"]],
  ];
  for (const [alan, anahtarlar] of adaylar) {
    if (!anahtarlar.some((k) => f[k] != null)) continue;
    const yeni = { ...f };
    for (const k of anahtarlar) delete yeni[k];
    const sayi = (await ilanAra(yeni, { sayim: true })) as number;
    if (sayi > 0) return { alan, sayi };
  }
  return null;
}

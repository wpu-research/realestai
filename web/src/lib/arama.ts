import { sql } from "../db.js";
import { BINA_YASI, BULUNDUGU_KAT, KAT_SAYISI } from "./ozellikler.js";

// Sesli arama, sihirbaz, Didem asistanı ve filtre paneli aynı filtre şeklini üretir; /ara URL'si de bunu taşır.
export type Filtreler = {
  kategori?: "konut" | "arsa";
  tip?: "satilik" | "kiralik" | "sezonluk" | "gunluk";
  emlak_turu?: string[];
  kelime?: string;
  il?: string;
  ilce?: string;
  mahalleler?: string[];
  min_fiyat?: number;
  max_fiyat?: number;
  para_birimi?: "TRY" | "EUR" | "USD" | "GBP";
  min_brut_m2?: number;
  max_brut_m2?: number;
  min_net_m2?: number;
  max_net_m2?: number;
  oda?: string[];
  bina_yasi?: string[];
  kat_sayisi?: string[];
  kat?: string[];
  ara_kat?: boolean;
  isitma?: string[];
  banyo?: string[];
  mutfak?: string[];
  balkon?: boolean;
  asansor?: boolean;
  otopark?: boolean;
  esya?: "esyali" | "esyasiz";
  esyali?: boolean;               // eski alan (yapay zekâ / sihirbaz) → esya=esyali
  yapi_durumu?: string[];
  site_ici?: boolean;
  ozel_alan?: boolean;
  tapu?: string[];
  kimden?: string[];
  ilan_tarihi?: number;           // son N gün
  fotolu?: boolean;
  videolu?: boolean;
  haritali?: boolean;
  cephe?: string[];
  ozellik?: string[];             // iç/dış/muhit/ulaşım/manzara/uygunluk — hepsi birden (VE)
  min_kapasite?: number;
  havuz?: "ozel" | "ortak" | "herhangi";
  deniz_manzarasi?: boolean;
  max_denize_mesafe_m?: number;
  evcil_hayvan?: boolean;
  giris_tarihi?: string;
  cikis_tarihi?: string;
  sadece_firsat?: boolean;
  siralama?: "onerilen" | "yeni" | "eski" | "fiyat_artan" | "fiyat_azalan" | "en_firsat" | "yakin" | "en_yeni";
  // Harita alanı (Airbnb gibi): [güney, batı, kuzey, doğu]
  sinir?: [number, number, number, number];
  // Yakınımda ara: [enlem, boylam]
  yakin?: [number, number];
  yaricap_km?: number;
};

const DIZI = ["emlak_turu", "mahalleler", "oda", "bina_yasi", "kat_sayisi", "kat", "isitma", "banyo", "mutfak",
  "yapi_durumu", "tapu", "kimden", "cephe", "ozellik"] as const;
const SAYI = ["min_fiyat", "max_fiyat", "min_brut_m2", "max_brut_m2", "min_net_m2", "max_net_m2", "min_kapasite",
  "max_denize_mesafe_m", "ilan_tarihi", "yaricap_km"] as const;
const MANTIK = ["ara_kat", "balkon", "asansor", "otopark", "site_ici", "ozel_alan", "fotolu", "videolu", "haritali",
  "deniz_manzarasi", "esyali", "evcil_hayvan", "sadece_firsat"] as const;
const METIN = ["kategori", "tip", "kelime", "il", "ilce", "para_birimi", "havuz", "esya", "giris_tarihi", "cikis_tarihi", "siralama"] as const;

// Yaklaşık kurlar (1 birim = X TL). Railway değişkenleriyle güncellenir: KUR_EUR, KUR_USD, KUR_GBP.
export const KUR: Record<string, number> = {
  TRY: 1,
  EUR: Number(process.env.KUR_EUR ?? 48),
  USD: Number(process.env.KUR_USD ?? 42),
  GBP: Number(process.env.KUR_GBP ?? 55),
};

const sayiDizisi = (x: string | null, n: number) => {
  const v = (x ?? "").split(",").map(Number);
  return v.length === n && v.every(Number.isFinite) ? v : null;
};

export function filtreOku(q: URLSearchParams): Filtreler {
  const f: Record<string, unknown> = {};
  for (const k of DIZI) {
    const v = q.getAll(k).flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean);
    if (v.length) f[k] = v.slice(0, 60);
  }
  for (const k of SAYI) {
    const v = Number(q.get(k));
    if (q.get(k) && Number.isFinite(v) && v > 0) f[k] = v;
  }
  for (const k of MANTIK) if (q.get(k) === "1" || q.get(k) === "true") f[k] = true;
  for (const k of METIN) if (q.get(k)?.trim()) f[k] = q.get(k)!.trim().slice(0, 200);
  const sinir = sayiDizisi(q.get("sinir"), 4);
  if (sinir && sinir[0] < sinir[2] && sinir[1] < sinir[3]) f.sinir = sinir;
  const yakin = sayiDizisi(q.get("yakin"), 2);
  if (yakin && Math.abs(yakin[0]) <= 90 && Math.abs(yakin[1]) <= 180) f.yakin = yakin;
  if (f.esyali && !f.esya) f.esya = "esyali";
  delete f.esyali;
  if (f.siralama === "en_yeni") f.siralama = "yeni";
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
  iskonto: number | null; kapak: string | null; yayinlandi_at: Date | null; mesafe_km: number | null;
  ceviriler: Record<string, { baslik?: string; aciklama?: string }>;
};

// Bant listesinden (bina yaşı, kat…) "kolon şu aralıklardan birinde" koşulu.
function bantKosulu(kolon: ReturnType<typeof sql>, secili: string[] | undefined, bantlar: { k: string; a: number; u: number | null }[]) {
  const b = bantlar.filter((x) => secili?.includes(x.k));
  if (!b.length) return sql``;
  const parcalar = b.map((x) => (x.u == null ? sql`${kolon} >= ${x.a}` : sql`${kolon} between ${x.a} and ${x.u}`));
  return sql`and (${parcalar.reduce((t, p) => sql`${t} or ${p}`)})`;
}

export async function ilanAra(f: Filtreler, opt: { limit?: number; sayim?: boolean } = {}) {
  const kur = KUR[f.para_birimi ?? "TRY"] ?? 1;
  const bant = sezonBandi(f.giris_tarihi);
  // Günlük kirada seçilen tarihin sezon fiyatı, yoksa ilan fiyatı; hepsi TL'ye çevrilir.
  const fiyatTl = sql`(coalesce((i.sezon_fiyatlari ->> ${bant})::numeric, i.fiyat) * case i.para_birimi
      when 'EUR' then ${KUR.EUR}::numeric when 'USD' then ${KUR.USD}::numeric
      when 'GBP' then ${KUR.GBP}::numeric else 1 end)`;
  const odaSayisi = sql`nullif(split_part(i.oda, '+', 1), '')::int`;
  const yuksekOda = f.oda?.some((o) => Number(o.split("+")[0]) >= 6);
  // Yakınımda ara: düz dünya yaklaşımı (birkaç km'de yeterince doğru), km cinsinden.
  const mesafe = f.yakin
    ? sql`sqrt(power((coalesce(i.lat, m.lat) - ${f.yakin[0]}) * 111.0, 2)
             + power((coalesce(i.lng, m.lng) - ${f.yakin[1]}) * 111.0 * cos(radians(${f.yakin[0]})), 2))`
    : sql`null::float`;
  const kelime = f.kelime ? `%${f.kelime.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const banyo = (f.banyo ?? []).map(Number).filter(Boolean);

  const kosul = sql`
    i.durum = 'yayinda'
    ${f.kategori === "arsa" ? sql`and i.emlak_turu = 'arsa'` : f.kategori === "konut" ? sql`and i.emlak_turu <> 'arsa'` : sql``}
    ${f.tip ? sql`and i.tip = ${f.tip}` : sql``}
    ${f.emlak_turu?.length ? sql`and i.emlak_turu in ${sql(f.emlak_turu)}` : sql``}
    ${kelime ? sql`and (i.baslik ilike ${kelime} or i.aciklama ilike ${kelime} or m.ad ilike ${kelime} or m.ilce ilike ${kelime})` : sql``}
    ${f.il ? sql`and m.il = ${f.il}` : sql``}
    ${f.ilce ? sql`and m.ilce = ${f.ilce}` : sql``}
    ${f.mahalleler?.length ? sql`and m.slug in ${sql(f.mahalleler)}` : sql``}
    ${f.min_fiyat ? sql`and ${fiyatTl} >= ${f.min_fiyat * kur}` : sql``}
    ${f.max_fiyat ? sql`and ${fiyatTl} <= ${f.max_fiyat * kur}` : sql``}
    ${f.min_brut_m2 ? sql`and i.brut_m2 >= ${f.min_brut_m2}` : sql``}
    ${f.max_brut_m2 ? sql`and i.brut_m2 <= ${f.max_brut_m2}` : sql``}
    ${f.min_net_m2 ? sql`and i.net_m2 >= ${f.min_net_m2}` : sql``}
    ${f.max_net_m2 ? sql`and i.net_m2 <= ${f.max_net_m2}` : sql``}
    ${f.oda?.length ? sql`and (i.oda in ${sql(f.oda)} ${yuksekOda ? sql`or ${odaSayisi} >= 6` : sql``})` : sql``}
    ${bantKosulu(sql`i.bina_yasi`, f.bina_yasi, BINA_YASI)}
    ${bantKosulu(sql`i.kat_sayisi`, f.kat_sayisi, KAT_SAYISI)}
    ${bantKosulu(sql`i.kat`, f.kat, BULUNDUGU_KAT)}
    ${f.ara_kat ? sql`and i.kat > 0 and i.kat < i.kat_sayisi` : sql``}
    ${f.isitma?.length ? sql`and i.isitma in ${sql(f.isitma)}` : sql``}
    ${banyo.length ? sql`and (i.banyo in ${sql(banyo)} ${banyo.includes(3) ? sql`or i.banyo >= 3` : sql``})` : sql``}
    ${f.mutfak?.length ? sql`and i.mutfak in ${sql(f.mutfak)}` : sql``}
    ${f.balkon ? sql`and i.balkon` : sql``}
    ${f.asansor ? sql`and i.asansor` : sql``}
    ${f.otopark ? sql`and i.otopark` : sql``}
    ${f.esya === "esyali" ? sql`and i.esyali` : f.esya === "esyasiz" ? sql`and not i.esyali` : sql``}
    ${f.yapi_durumu?.length ? sql`and i.yapi_durumu in ${sql(f.yapi_durumu)}` : sql``}
    ${f.site_ici ? sql`and i.site_ici` : sql``}
    ${f.ozel_alan ? sql`and i.ozel_alan` : sql``}
    ${f.tapu?.length ? sql`and i.tapu_durumu in ${sql(f.tapu)}` : sql``}
    ${f.kimden?.length ? sql`and i.ilan_veren in ${sql(f.kimden)}` : sql``}
    ${f.ilan_tarihi ? sql`and i.yayinlandi_at >= now() - make_interval(days => ${Math.round(f.ilan_tarihi)})` : sql``}
    ${f.fotolu ? sql`and exists (select 1 from ilan_fotolari p where p.ilan_id = i.id)` : sql``}
    ${f.videolu ? sql`and i.video_url is not null` : sql``}
    ${f.haritali ? sql`and i.kesin_konum` : sql``}
    ${f.cephe?.length ? sql`and i.cephe && ${f.cephe}::text[]` : sql``}
    ${f.ozellik?.length ? sql`and i.ozellikler @> ${f.ozellik}::text[]` : sql``}
    ${f.min_kapasite ? sql`and i.yatak_kapasitesi >= ${f.min_kapasite}` : sql``}
    ${f.havuz === "ozel" || f.havuz === "ortak" ? sql`and i.havuz = ${f.havuz}` : f.havuz ? sql`and i.havuz <> 'yok'` : sql``}
    ${f.deniz_manzarasi ? sql`and (i.deniz_manzarasi or 'deniz_manzarasi' = any(i.ozellikler))` : sql``}
    ${f.max_denize_mesafe_m ? sql`and i.denize_mesafe_m <= ${f.max_denize_mesafe_m}` : sql``}
    ${f.evcil_hayvan ? sql`and (i.evcil_hayvan or 'hayvanli_uygun' = any(i.ozellikler))` : sql``}
    ${f.sadece_firsat ? sql`and i.iskonto >= 0.15` : sql``}
    ${f.sinir ? sql`and coalesce(i.lat, m.lat) between ${f.sinir[0]} and ${f.sinir[2]}
                    and coalesce(i.lng, m.lng) between ${f.sinir[1]} and ${f.sinir[3]}` : sql``}
    ${f.yakin ? sql`and ${mesafe} <= ${f.yaricap_km ?? 5}` : sql``}`;

  if (opt.sayim) {
    const [r] = await sql<{ n: number }[]>`
      select count(*)::int as n from ilanlar i left join mahalleler m on m.id = i.mahalle_id where ${kosul}`;
    return r.n;
  }

  const siralama = f.siralama ?? (f.yakin ? "yakin" : "onerilen");
  const sira = {
    yeni: sql`i.yayinlandi_at desc nulls last`,
    en_yeni: sql`i.yayinlandi_at desc nulls last`,
    eski: sql`i.yayinlandi_at asc nulls last`,
    fiyat_artan: sql`${fiyatTl} asc`,
    fiyat_azalan: sql`${fiyatTl} desc`,
    en_firsat: sql`i.iskonto desc nulls last`,
    yakin: f.yakin ? sql`${mesafe} asc` : sql`i.yayinlandi_at desc nulls last`,
    onerilen: sql`coalesce(i.iskonto, 0) desc, i.yayinlandi_at desc nulls last`,
  }[siralama] ?? sql`i.yayinlandi_at desc`;

  return sql<IlanKart[]>`
    select i.id, i.ilan_no, i.tip, i.emlak_turu, i.baslik, i.demo, i.ceviriler,
           m.ad as mahalle, m.slug as mahalle_slug, m.ilce,
           coalesce(i.lat, m.lat) as lat, coalesce(i.lng, m.lng) as lng,
           i.net_m2, i.oda, i.yatak_kapasitesi, i.havuz, i.deniz_manzarasi, i.denize_mesafe_m,
           i.fiyat, i.para_birimi, i.fiyat_birimi, i.yayinlandi_at,
           coalesce((i.sezon_fiyatlari ->> ${bant})::numeric, i.fiyat) as donem_fiyati,
           i.iskonto, ${mesafe} as mesafe_km,
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
    ["yakınımda araması", ["yakin"]],
    ["arama kelimesi", ["kelime"]],
    ["bütçe", ["max_fiyat", "min_fiyat"]],
    ["bölge", ["mahalleler", "ilce", "il"]],
    ["konut özellikleri", ["ozellik", "cephe", "isitma", "mutfak", "tapu", "bina_yasi", "kat_sayisi", "kat", "ara_kat",
      "balkon", "asansor", "otopark", "esya", "yapi_durumu", "ozel_alan", "banyo"]],
    ["oda sayısı", ["oda"]],
    ["olmazsa olmazlar", ["havuz", "deniz_manzarasi", "max_denize_mesafe_m", "site_ici", "evcil_hayvan"]],
    ["ilan tarihi", ["ilan_tarihi"]],
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

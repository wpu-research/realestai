// Radar puanlaması (saf fonksiyonlar): piyasa altı fiyat ve "gerçekten sahibinden mi" olasılığı.
// src/realestai/{fiyat,sahip_tespiti}.py'nin TypeScript karşılığı; ağırlıklar aynı.

export const MIN_GRUP = 5;
export const FIRSAT_ISKONTO = 0.15;
export const FIRSAT_Z = -1.0;
export const PAZARLIK_GUN = 60;

export type Gozlem = {
  id: string;
  kaynak: "aday" | "ilan";
  tip: string;
  mahalle: string | null;
  emlak_turu: string | null;
  oda: string | null;
  net_m2: number | null;
  yatak_kapasitesi: number | null;
  fiyat: number | null;           // TL'ye çevrilmiş
  fiyat_birimi: string | null;    // toplam | aylik | sezon | gecelik | haftalik
  sezon_ay?: number | null;
};

// Birim fiyat: satılık TL/net m²; kiralık ve sezonluk TL/net m²/ay; günlük TL/kişi/gece.
export function birimFiyat(g: Gozlem): number | null {
  if (!g.fiyat || g.fiyat <= 0) return null;
  if (g.tip === "gunluk") {
    if (!g.yatak_kapasitesi) return null;
    const gecelik = g.fiyat_birimi === "haftalik" ? g.fiyat / 7 : g.fiyat;
    return gecelik / g.yatak_kapasitesi;
  }
  if (!g.net_m2 || g.net_m2 <= 0) return null;
  if (g.tip === "satilik") return g.fiyat / g.net_m2;
  if (g.fiyat_birimi === "sezon") {
    const ay = g.sezon_ay && g.sezon_ay > 0 ? g.sezon_ay : 5;   // süre bilinmiyorsa Bodrum yaz sezonu ~5 ay
    return g.fiyat / ay / g.net_m2;
  }
  return g.fiyat / g.net_m2;
}

const boyut = (g: Gozlem) => {
  if (g.tip === "gunluk") {
    const k = g.yatak_kapasitesi ?? 0;
    return k <= 4 ? "k≤4" : k <= 8 ? "k5-8" : "k9+";
  }
  return g.oda ?? "?";
};

// En dardan en genişe karşılaştırma grupları (anahtar + okunur ad).
export function grupAnahtarlari(g: Gozlem): [string, string][] {
  const tur = g.emlak_turu ?? "?";
  return [
    [`${g.tip}|${g.mahalle}|${tur}|${boyut(g)}`, `${g.mahalle ?? "?"} · ${tur} · ${boyut(g)}`],
    [`${g.tip}|${g.mahalle}|${tur}`, `${g.mahalle ?? "?"} · ${tur}`],
    [`${g.tip}|${g.mahalle}`, `${g.mahalle ?? "?"} · tüm türler`],
    [`${g.tip}|*|${tur}`, `tüm bölge · ${tur}`],
  ];
}

export const medyan = (x: number[]) => {
  const s = [...x].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export type FiyatPuani = {
  birim: number; medyan: number; iskonto: number; z: number; grupBuyuklugu: number; grupAdi: string;
};

// Her gözlem için grup medyanına göre iskonto ve robust z (MAD). Gözlemin kendisi grupta yer alır.
export function fiyatPuanla(gozlemler: Gozlem[]): Map<string, FiyatPuani> {
  const birimler = new Map(gozlemler.map((g) => [g.id, birimFiyat(g)]));
  const gruplar = new Map<string, number[]>();
  for (const g of gozlemler) {
    const b = birimler.get(g.id);
    if (b == null) continue;
    for (const [k] of grupAnahtarlari(g)) gruplar.set(k, [...(gruplar.get(k) ?? []), b]);
  }
  const sonuc = new Map<string, FiyatPuani>();
  for (const g of gozlemler) {
    const b = birimler.get(g.id);
    if (b == null) continue;
    const secilen = grupAnahtarlari(g).find(([k]) => (gruplar.get(k)?.length ?? 0) >= MIN_GRUP);
    if (!secilen) continue;
    const degerler = gruplar.get(secilen[0])!;
    const med = medyan(degerler);
    const mad = medyan(degerler.map((v) => Math.abs(v - med))) * 1.4826;
    sonuc.set(g.id, {
      birim: b, medyan: med, iskonto: 1 - b / med, z: mad ? (b - med) / mad : 0,
      grupBuyuklugu: degerler.length, grupAdi: secilen[1],
    });
  }
  return sonuc;
}

// ---------- Sahip olasılığı ----------
const EMLAKCI_KALIPLARI: [RegExp, string][] = [
  [/portf[öo]y/, "\"portföy\""], [/ofis(imiz|imize)/, "\"ofisimiz\""], [/gayrimenkul/, "\"gayrimenkul\""],
  [/emlak (ofisi|danışman)/, "\"emlak ofisi/danışmanı\""], [/danışman(ımız|ınız)/, "\"danışmanımız\""],
  [/yetkili (satış|kiralama)/, "\"yetkili satış\""], [/komisyon/, "\"komisyon\""],
  [/randevu (alarak|ile) gösterilir/, "\"randevu ile gösterilir\""], [/yatırımlık fırsat/, "\"yatırımlık fırsat\""],
  [/kaçırılmayacak/, "\"kaçırılmayacak\""], [/\bremax\b|\bre\/max\b|coldwell|century 21|turyap|\bera\b/, "emlak markası adı"],
];
const SAHIP_KALIPLARI: [RegExp, string][] = [
  [/aracı(sız)? istemiyorum|emlakçı(lar)? aramasın|emlakçılar rahatsız etmesin/, "\"emlakçılar aramasın\""],
  [/sahibinden/, "\"sahibinden\""], [/kendi evim|evimizi|dairemizi|villamızı/, "\"kendi evim\""],
  [/acil (satılık|kiralık)/, "\"acil satılık\""],
];
const SABIT = 0.4, W_EMLAKCI = -0.9, W_SAHIP = 0.6, W_TEL_COK = -1.2, W_TEL_TEK = 0.5, W_ETIKET_EMLAKCI = -3.0;

const kucukHarf = (s: string) => s.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function sahipOlasiligi(a: { baslik: string; aciklama?: string | null; ilan_veren?: string | null },
  ayniTelefonIlanSayisi: number | null): { olasilik: number; gerekce: string[] } {
  const gerekce: string[] = [];
  if (a.ilan_veren === "emlakci") return { olasilik: sigmoid(SABIT + W_ETIKET_EMLAKCI), gerekce: ["kaynakta emlakçı olarak işaretli"] };
  const metin = kucukHarf(`${a.baslik} ${a.aciklama ?? ""}`);
  let x = SABIT;
  const emlakci = EMLAKCI_KALIPLARI.filter(([r]) => r.test(metin)).map(([, e]) => e);
  const sahip = SAHIP_KALIPLARI.filter(([r]) => r.test(metin)).map(([, e]) => e);
  x += W_EMLAKCI * Math.min(emlakci.length, 3);
  x += W_SAHIP * Math.min(sahip.length, 2);
  if (emlakci.length) gerekce.push(`emlakçı dili: ${emlakci.slice(0, 3).join(", ")}`);
  if (sahip.length) gerekce.push(`sahip dili: ${sahip.slice(0, 2).join(", ")}`);
  if (ayniTelefonIlanSayisi != null) {
    if (ayniTelefonIlanSayisi >= 4) { x += W_TEL_COK; gerekce.push(`aynı numara ${ayniTelefonIlanSayisi} ilanda`); }
    else if (ayniTelefonIlanSayisi === 1) { x += W_TEL_TEK; gerekce.push("numara yalnız bu ilanda"); }
  }
  if (!gerekce.length) gerekce.push("belirgin işaret yok");
  return { olasilik: sigmoid(x), gerekce };
}

// ---------- Öncelik ----------
export function oncelik(p: { sahip: number; iskonto: number | null; yayindaGun: number | null; fiyatDustu: boolean; bayrakSayisi: number }) {
  const iskonto = Math.max(p.iskonto ?? 0, 0);
  const pazarlik = (p.yayindaGun ?? 0) >= PAZARLIK_GUN || p.fiyatDustu ? 1.2 : 1;
  const bayrak = p.bayrakSayisi ? 0.5 : 1;           // kırmızı bayraklı aday yine aranır ama sona yakın
  // İskonto yoksa bile sahip olasılığı yüksek adaylar sıralanabilsin diye küçük taban.
  return p.sahip * (iskonto + 0.02) * pazarlik * bayrak;
}

export const firsatMi = (iskonto: number | null, z: number | null, bayrakSayisi: number) =>
  iskonto != null && z != null && iskonto >= FIRSAT_ISKONTO && z <= FIRSAT_Z && bayrakSayisi === 0;

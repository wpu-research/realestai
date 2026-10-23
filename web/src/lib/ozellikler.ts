// Filtre ve ilan özellik kataloğu (Bodrum/Muğla gereksinim listesi). Site, admin ve yapay zekâ
// aynı anahtarları kullanır; etiket tipi özellikler ilanlar.ozellikler dizisinde tutulur.

export type Secenek = { k: string; e: string };
const s = (k: string, e: string): Secenek => ({ k, e });

export const KONUT_TIPLERI = [
  s("daire", "Daire"), s("villa", "Villa"), s("dubleks", "Dubleks"), s("tripleks", "Tripleks"),
  s("tek_kat_villa", "Tek kat villa"), s("mustakil", "Müstakil ev"), s("rezidans", "Rezidans"),
];

export const OZELLIK_GRUPLARI: { ad: string; baslik: string; secenekler: Secenek[] }[] = [
  {
    ad: "ic", baslik: "İç özellikler", secenekler: [
      s("klima", "Klima"), s("ankastre_mutfak", "Ankastre mutfak"), s("amerikan_mutfak", "Amerikan mutfak"),
      s("somine", "Şömine"), s("giyinme_odasi", "Giyinme odası"), s("ebeveyn_banyosu", "Ebeveyn banyosu"),
      s("dusakabin", "Duşakabin"), s("jakuzi", "Jakuzi"), s("sauna", "Sauna"), s("celik_kapi", "Çelik kapı"),
      s("akilli_ev", "Akıllı ev sistemi"), s("yerden_isitma", "Yerden ısıtma"), s("panjur", "Panjur"), s("alarm", "Alarm"),
    ],
  },
  {
    ad: "dis", baslik: "Dış özellikler", secenekler: [
      s("jakuzili", "Jakuzili"), s("bahce", "Bahçe"), s("teras", "Teras"), s("mangal", "Barbekü / mangal alanı"),
      s("guvenlik", "Güvenlik"), s("kamera", "Kamera sistemi"), s("kapici", "Kapıcı"), s("jenerator", "Jeneratör"),
      s("kapali_otopark", "Kapalı otopark"), s("cocuk_oyun", "Çocuk oyun alanı"), s("spor_salonu", "Spor salonu"),
      s("tenis", "Tenis kortu"), s("ozel_plaj", "Özel plaj"),
    ],
  },
  {
    ad: "muhit", baslik: "Muhit", secenekler: [
      s("market", "Market"), s("okul", "Okul"), s("hastane", "Hastane"), s("cami", "Cami"),
      s("carsi", "Çarşı"), s("restoran", "Restoran"), s("plaj", "Plaj"),
    ],
  },
  {
    ad: "ulasim", baslik: "Ulaşım", secenekler: [
      s("dolmus", "Otobüs / dolmuş durağı"), s("ana_yol", "Ana yola yakın"), s("havalimani", "Havalimanına yakın"), s("marina", "Marinaya yakın"),
    ],
  },
  {
    ad: "manzara", baslik: "Manzara", secenekler: [
      s("deniz_manzarasi", "Deniz manzaralı"), s("doga_manzarasi", "Doğa manzaralı"),
      s("site_manzarasi", "Site manzaralı"), s("site_bahcesi", "Site bahçesi"),
    ],
  },
  {
    ad: "uygunluk", baslik: "Uygunluk", secenekler: [
      s("engelli_yasli_uygun", "Engelli veya yaşlıya uygun"), s("cocuklu_uygun", "Çocuklu müşteriye uygun"),
      s("hayvanli_uygun", "Hayvanlı müşteriye uygun"),
    ],
  },
];
export const TUM_OZELLIKLER = OZELLIK_GRUPLARI.flatMap((g) => g.secenekler);
export const OZELLIK_ANAHTARLARI = TUM_OZELLIKLER.map((o) => o.k);
export const ozellikEtiketi = (k: string) => TUM_OZELLIKLER.find((o) => o.k === k)?.e ?? k;

// Konut özellikleri — tek kolonlu seçimler ve aralık bantları
export const ISITMA = [s("klima", "Klima"), s("kombi", "Kombi (doğalgaz)"), s("merkezi", "Merkezi"), s("yerden", "Yerden ısıtma"),
  s("isi_pompasi", "Isı pompası"), s("soba", "Soba"), s("yok", "Yok")];
export const MUTFAK = [s("kapali", "Kapalı mutfak"), s("acik", "Açık mutfak")];
export const YAPI_DURUMU = [s("sifir", "Yeni (sıfır)"), s("ikinci_el", "Eski (ikinci el)")];
export const TAPU = [s("kat_mulkiyeti", "Kat mülkiyeti"), s("kat_irtifaki", "Kat irtifakı"), s("mustakil_tapu", "Müstakil tapu"),
  s("hisseli", "Hisseli tapu"), s("arsa_tapu", "Arsa tapulu")];
export const KIMDEN = [s("sahibinden", "Sahibinden"), s("emlakci", "Emlakçıdan")];
export const CEPHE = [s("kuzey", "Kuzey"), s("guney", "Güney"), s("dogu", "Doğu"), s("bati", "Batı")];
export const ODA = ["1+0", "1+1", "2+1", "3+1", "4+1", "5+1", "6+1"];
export const BANYO = [s("1", "1"), s("2", "2"), s("3", "3+")];

// Bant anahtarı → [alt, üst] (üst null = sınırsız)
export const BINA_YASI: { k: string; e: string; a: number; u: number | null }[] = [
  { k: "0", e: "Sıfır", a: 0, u: 0 }, { k: "1-5", e: "1–5", a: 1, u: 5 }, { k: "6-10", e: "6–10", a: 6, u: 10 },
  { k: "11-20", e: "11–20", a: 11, u: 20 }, { k: "21+", e: "21 ve üzeri", a: 21, u: null },
];
export const KAT_SAYISI: { k: string; e: string; a: number; u: number | null }[] = [
  { k: "1", e: "1", a: 1, u: 1 }, { k: "2", e: "2", a: 2, u: 2 }, { k: "3", e: "3", a: 3, u: 3 },
  { k: "4-5", e: "4–5", a: 4, u: 5 }, { k: "6+", e: "6+", a: 6, u: null },
];
export const BULUNDUGU_KAT: { k: string; e: string; a: number; u: number | null }[] = [
  { k: "bahce", e: "Bahçe / zemin", a: 0, u: 0 }, { k: "1", e: "1", a: 1, u: 1 }, { k: "2", e: "2", a: 2, u: 2 },
  { k: "3", e: "3", a: 3, u: 3 }, { k: "4+", e: "4+", a: 4, u: null },
];
// İlan tarihi: son N gün
export const ILAN_TARIHI = [s("1", "Son 24 saat"), s("3", "Son 3 gün"), s("7", "Son 1 hafta"), s("21", "Son 3 hafta"), s("30", "Son 1 ay")];

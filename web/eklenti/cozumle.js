// Sayfadan toplanan ham veriyi (topla.js) aday alanlarına çevirir. DOM kullanmaz; sunucu testleri de bunu çalıştırır.

const kucuk = (s) => String(s ?? "").replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
const sade = (s) => kucuk(s).replace(/[^a-zçğıöşü0-9²+]/g, " ").replace(/\s+/g, " ").trim();

// "3.250.000 TL" → 3250000, "4,5 milyon" → 4500000, "1.250,50" → 1250.5
export function sayi(s) {
  if (s == null) return null;
  const m = kucuk(s).match(/(\d[\d.,\s]*)\s*(milyon|bin)?/);
  if (!m) return null;
  let r = m[1].replace(/\s/g, "");
  if (/^\d{1,3}([.,]\d{3})+$/.test(r)) r = r.replace(/[.,]/g, "");      // binlik ayraç
  else r = r.replace(/\./g, "").replace(",", ".");
  let n = Number(r);
  if (!Number.isFinite(n)) return null;
  if (m[2] === "milyon") n *= 1e6;
  if (m[2] === "bin") n *= 1e3;
  return n;
}

const PARA = [[/₺|\btl\b|\btry\b/, "TRY"], [/€|\beur(o)?\b/, "EUR"], [/\$|\busd\b|dolar/, "USD"], [/£|\bgbp\b|sterlin/, "GBP"]];
const paraBul = (s) => PARA.find(([r]) => r.test(kucuk(s)))?.[1] ?? null;

// Metindeki ilk fiyat: rakam + para birimi (ya da "4,5 milyon").
export function fiyatBul(metin) {
  const k = kucuk(metin);
  const r = /(\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?\s*(?:milyon|bin)|\d{4,})\s*(₺|tl\b|try\b|€|eur\b|euro\b|\$|usd\b|dolar|£|gbp\b)?/g;
  for (const m of k.matchAll(r)) {
    const birim = m[2] ? paraBul(m[2]) : null;
    if (!birim && !/milyon|bin/.test(m[1])) continue;     // birimsiz düz sayı fiyat değildir (m², yıl…)
    const n = sayi(m[1]);
    if (n && n >= 100) return { fiyat: n, para_birimi: birim ?? "TRY" };
  }
  return null;
}

const odaBul = (s) => {
  const k = kucuk(s);
  const m = k.match(/\b(\d{1,2})\s*\+\s*(\d)\b/);
  if (m) return `${m[1]}+${m[2]}`;
  return /stüdyo|studio|1\s*\+\s*0/.test(k) ? "1+0" : null;
};
const m2Bul = (s) => {
  const m = kucuk(s).match(/(\d{2,5})\s*(?:m2|m²|metrekare|metre kare)/);
  return m ? Number(m[1]) : null;
};

function tipBul(...metinler) {
  for (const s of metinler) {
    const k = kucuk(s);
    if (!k) continue;
    if (/günlük|gunluk|gecelik|haftalık kiralık|tatil evi|apart otel/.test(k)) return "gunluk";
    if (/sezonluk|sezon boyu|yazlık kiralık/.test(k)) return "sezonluk";
    if (/kiralık|kiralik|kira\b|for rent/.test(k)) return "kiralik";
    if (/satılık|satilik|for sale|satıyorum|satılıktır/.test(k)) return "satilik";
  }
  return null;
}
function turBul(...metinler) {
  for (const s of metinler) {
    const k = kucuk(s);
    if (!k) continue;
    if (/rezidans/.test(k)) return "rezidans";
    if (/villa/.test(k)) return "villa";
    if (/müstakil|mustakil|bağ evi|köy evi|taş ev/.test(k)) return "mustakil";
    if (/\barsa\b|tarla|zeytinlik|bahçe\b|arazi/.test(k)) return "arsa";
    if (/daire|apartman|dubleks|çatı katı|bahçe katı|flat|apartment/.test(k)) return "daire";
  }
  return null;
}

function ilanVerenBul(kimden, metin) {
  const k = kucuk(kimden);
  if (/sahibinden/.test(k)) return "sahibinden";
  if (/emlak|ofis|banka|inşaat|insaat|kurumsal|danışman/.test(k)) return "emlakci";
  return /sahibinden/.test(kucuk(metin)) ? "sahibinden" : null;
}

const AYLAR = ["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"];
export function tarihBul(s) {
  const k = kucuk(s);
  let m = k.match(/(\d{1,2})\s+(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\s+(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], AYLAR.indexOf(m[2]), +m[1]));
  m = k.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return null;
}

const KAYNAK = [[/sahibinden\.com/, "sahibinden"], [/hepsiemlak/, "hepsiemlak"], [/emlakjet/, "emlakjet"],
  [/facebook\.com|fb\.com/, "fb_grup"], [/zingat/, "zingat"], [/airbnb/, "airbnb"], [/booking\.com/, "booking"]];
export const kaynakBul = (url) => KAYNAK.find(([r]) => r.test(String(url ?? "")))?.[1] ?? "diger";

// Sitenin kendi ilan numarası (aynı ilan iki kez eklenmesin diye). Bulunamazsa sunucu adresten üretir.
export function ilanNoBul(url, ciftNo) {
  if (ciftNo) return String(ciftNo).replace(/\s/g, "");
  const u = String(url ?? "");
  const m = u.match(/(\d{8,12})\/detay/) || u.match(/\/(\d{5,}-\d+)(?:[/?#]|$)/) || u.match(/[-/](\d{7,})(?:[/?#]|$)/);
  return m ? m[1] : null;
}

// Etiket → alan. Etiketler sitelerin "bilgi listesi"nden gelir (İlan No, m² (Net), Oda Sayısı, Kimden…).
const ETIKETLER = [
  [/^ilan no|^ilan numarası|^ilan id/, "ilan_no"], [/^ilan tarihi|^ilan güncelleme|^son güncelleme/, "tarih"],
  [/^emlak tipi|^kategori|^ilan tipi|^konut tipi/, "emlak_tipi"], [/net/, "net"], [/brüt|brut/, "brut"],
  [/^oda sayısı|^oda \+ salon|^oda/, "oda"], [/^kimden|^ilan sahibi|^ilan veren/, "kimden"], [/^fiyat/, "fiyat"],
  [/yatak|kişi kapasitesi|misafir|kapasite/, "kapasite"],
];

export function cozumle(ham, bugun = new Date()) {
  const c = {};
  for (const [etiket, deger] of ham.ciftler ?? []) {
    const e = sade(etiket);
    const hit = ETIKETLER.find(([r]) => r.test(e) && (!/net|brüt|brut/.test(r.source) || /m²|m2|metrekare|alan/.test(e)));
    if (hit && c[hit[1]] == null) c[hit[1]] = String(deger).trim();
  }
  const ld = (ham.jsonld ?? []).flatMap((x) => (Array.isArray(x) ? x : x?.["@graph"] ?? [x]));
  const ldTeklif = ld.map((x) => x?.offers).find(Boolean);
  const teklif = Array.isArray(ldTeklif) ? ldTeklif[0] : ldTeklif;

  const metin = String(ham.secili && ham.secili.length > 40 ? ham.secili : ham.metin ?? "");
  const baslik = String(ham.baslik ?? "").trim() || metin.split("\n").find((x) => x.trim())?.trim().slice(0, 120) || "";
  const hepsi = `${baslik}\n${metin}`;

  let fiyat = null, para_birimi = null;
  if (c.fiyat) { fiyat = sayi(c.fiyat); para_birimi = paraBul(c.fiyat) ?? "TRY"; }
  if (!fiyat && teklif?.price) { fiyat = sayi(teklif.price); para_birimi = teklif.priceCurrency ?? "TRY"; }
  if (!fiyat && ham.fiyatMetni) { const f = fiyatBul(ham.fiyatMetni); if (f) ({ fiyat, para_birimi } = f); }
  if (!fiyat) { const f = fiyatBul(hepsi); if (f) ({ fiyat, para_birimi } = f); }

  const tip = tipBul(c.emlak_tipi, baslik, ham.konum, ham.url, metin);
  const k = kucuk(hepsi);
  const fiyat_birimi = tip === "satilik" ? "toplam" : tip === "sezonluk" ? "sezon"
    : tip === "gunluk" ? (/haftalık/.test(k) && !/gecelik/.test(k) ? "haftalik" : "gecelik") : tip ? "aylik" : null;
  const tarih = tarihBul(c.tarih);
  const kapasite = c.kapasite ? sayi(c.kapasite) : Number(k.match(/(\d{1,2})\s*kişilik/)?.[1]) || null;

  return {
    kaynak: kaynakBul(ham.url),
    kaynak_url: ham.url ?? null,
    kaynak_ilan_no: ilanNoBul(ham.url, c.ilan_no),
    baslik,
    tip,
    emlak_turu: turBul(c.emlak_tipi, baslik, metin),
    net_m2: (c.net && sayi(c.net)) || m2Bul(hepsi) || (c.brut && sayi(c.brut)) || null,
    oda: odaBul(c.oda ?? "") ?? odaBul(hepsi),
    yatak_kapasitesi: kapasite,
    fiyat, para_birimi, fiyat_birimi,
    yayinda_gun: tarih ? Math.max(0, Math.round((bugun - tarih) / 86400000)) : null,
    ilan_veren: ilanVerenBul(c.kimden, hepsi),
    aciklama: metin.trim().slice(0, 6000) || null,
    konum: ham.konum ?? null,
  };
}

// Sunucudaki mahalle listesinden sayfada geçeni bulur; önce konum satırına, sonra başlık ve metne bakar.
export function mahalleBul(metinler, mahalleler) {
  const sirali = [...mahalleler].sort((a, b) => b.ad.length - a.ad.length);
  for (const s of metinler) {
    const k = ` ${sade(s)} `;
    if (k.trim() === "") continue;
    for (const m of sirali) {
      const ad = sade(m.ad);
      // "Merkez" tek başına çok yaygın; yalnız "<ilçe> merkez" ya da "merkez mah" biçiminde kabul edilir.
      const desen = ad === "merkez" ? [`${sade(m.ilce)} merkez`, "merkez mah"] : [ad];
      if (desen.some((d) => k.includes(` ${d} `) || k.includes(` ${d} mah`))) return m.id;
    }
  }
  return null;
}

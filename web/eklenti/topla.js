// İlan sayfasında çalışır (popup tıklanınca chrome.scripting ile, yalnız o sekmede, tek sefer).
// Kendi kendine yeter olmalı: dışarıdaki hiçbir şeye başvurmaz. Fotoğraf toplamaz.
function topla() {
  const yazi = (el) => (el ? (el.innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim() : "");
  const ilk = (...seciciler) => {
    for (const s of seciciler) {
      const el = document.querySelector(s);
      if (yazi(el)) return yazi(el);
    }
    return "";
  };
  const meta = (ad) => document.querySelector(`meta[property="${ad}"], meta[name="${ad}"]`)?.content?.trim() ?? "";

  // Etiket–değer çiftleri: <li><strong>Oda Sayısı</strong><span>3+1</span></li>, tablo satırları, dt/dd.
  const ciftler = [];
  const ekle = (a, b) => {
    const e = yazi(a), d = yazi(b);
    if (e && d && e.length < 40 && d.length < 120 && e !== d) ciftler.push([e, d]);
  };
  for (const li of document.querySelectorAll("li")) {
    const cocuk = [...li.children].filter((x) => yazi(x));
    if (cocuk.length === 2) ekle(cocuk[0], cocuk[1]);
    if (ciftler.length > 300) break;
  }
  for (const tr of document.querySelectorAll("tr")) {
    const h = tr.querySelectorAll("th, td");
    if (h.length === 2) ekle(h[0], h[1]);
  }
  for (const dt of document.querySelectorAll("dt")) ekle(dt, dt.nextElementSibling);

  const jsonld = [];
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { jsonld.push(JSON.parse(s.textContent)); } catch { /* bozuk JSON-LD yok sayılır */ }
  }

  const aciklama = ilk("#classifiedDescription", "[class*=description-content]", "[class*=ilan-aciklama]",
    "[class*=description]", "[itemprop=description]") || meta("og:description");

  return {
    url: location.href,
    baslik: ilk(".classifiedDetailTitle h1", "h1") || meta("og:title") || document.title,
    secili: String(getSelection?.() ?? "").trim().slice(0, 8000),
    ciftler,
    jsonld,
    fiyatMetni: ilk(".classifiedInfo h3", "[class*=price]", "[class*=fiyat]"),
    konum: ilk(".classifiedInfo h2", "[class*=breadcrumb]", "[class*=location]", "[class*=adres]", "[class*=konum]"),
    metin: (aciklama || yazi(document.querySelector("main")) || yazi(document.body)).slice(0, 8000),
  };
}

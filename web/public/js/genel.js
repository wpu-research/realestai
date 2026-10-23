// Tüm sayfalar: çerez bandı ve üst bardaki para birimi seçimi.

const sakla = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const oku = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

// ---------- Çerez bandı ----------
const bant = document.querySelector("[data-cerez]");
if (bant && !oku("cerezOnay")) bant.hidden = false;
bant?.querySelector("[data-cerez-tamam]")?.addEventListener("click", () => { sakla("cerezOnay", "1"); bant.hidden = true; });

// ---------- Para birimi ----------
// Fiyatlar ilanın kendi para biriminde basılır; seçilen birim farklıysa yaklaşık karşılığı gösterilir.
const KUR = JSON.parse(document.getElementById("kurlar")?.textContent || '{"TRY":1}');
const SEMBOL = { TRY: "₺", EUR: "€", USD: "$", GBP: "£" };
const secim = document.querySelector("[data-para-birimi]");

function bicim(tutar, pb) {
  const s = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.round(tutar));
  return pb === "TRY" ? `${s} ₺` : `${SEMBOL[pb] ?? pb}${s}`;
}

export function fiyatlariCevir(kok = document) {
  const hedef = oku("paraBirimi") || "TRY";
  kok.querySelectorAll("[data-tutar]").forEach((el) => {
    const tutar = Number(el.dataset.tutar), pb = el.dataset.pb, ek = el.dataset.ek || "";
    if (!el.dataset.ozgun) el.dataset.ozgun = el.textContent;
    if (pb === hedef || !KUR[pb] || !KUR[hedef]) { el.textContent = el.dataset.ozgun; el.removeAttribute("title"); return; }
    el.textContent = `≈ ${bicim((tutar * KUR[pb]) / KUR[hedef], hedef)}${ek}`;
    el.title = `İlan fiyatı: ${el.dataset.ozgun}`;
  });
}

if (secim) {
  secim.value = oku("paraBirimi") || "TRY";
  secim.addEventListener("change", () => { sakla("paraBirimi", secim.value); fiyatlariCevir(); });
}
fiyatlariCevir();
document.addEventListener("kartlar-yenilendi", () => fiyatlariCevir());

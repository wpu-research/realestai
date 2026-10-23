// Arama sayfası: Airbnb gibi harita — kaydırınca/yakınlaştırınca liste görünen alana göre yenilenir.
import { escape } from "./ortak.js";

const BODRUM = [[36.95, 27.2], [37.16, 27.5]];
const sonucAlani = document.querySelector("[data-sonuc-alani]");
const sayiEl = document.querySelector("[data-sonuc-sayi]");
const panel = document.querySelector("[data-filtre-panel]");
const sinirGizli = panel.querySelector("[data-sinir-gizli]");

// ---------- Filtre paneli ----------
document.querySelector("[data-filtre-ac]")?.addEventListener("click", () => panel.classList.add("acik"));
document.querySelector("[data-filtre-kapat]")?.addEventListener("click", () => panel.classList.remove("acik"));
function gonder() {
  for (const el of panel.querySelectorAll("input, select")) if (!el.value) el.disabled = true;
  panel.submit();
}
panel.addEventListener("submit", (e) => { e.preventDefault(); gonder(); });
const masaustu = () => window.matchMedia("(min-width: 1024px)").matches;
panel.querySelectorAll(".filtre-cip input, .kutu input").forEach((el) =>
  el.addEventListener("change", () => { if (masaustu()) gonder(); }));
document.querySelector("[data-siralama]")?.addEventListener("change", (e) => {
  panel.querySelector("[data-siralama-gizli]").value = e.target.value;
  gonder();
});

// ---------- Harita ----------
const kap = [...document.querySelectorAll(".harita-kart")].find((el) => el.offsetParent !== null);
const el = kap?.querySelector("[data-harita]");
if (el && window.L) {
  const harita = L.map(el, { scrollWheelZoom: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(harita);
  const katman = L.layerGroup().addTo(harita);
  const isaretler = new Map();
  const kaydirincaAra = kap.querySelector("[data-kaydirinca-ara]");
  const buAlanda = kap.querySelector("[data-bu-alanda-ara]");

  const noktalariOku = () => JSON.parse(sonucAlani.querySelector("[data-noktalar]")?.textContent || "[]");

  function isaretle(noktalar) {
    katman.clearLayers();
    isaretler.clear();
    // İlanlar çoğunlukla mahalle merkezini kullanıyor; aynı noktadakileri çember üzerinde hafifçe ayır.
    const ayni = new Map();
    for (const n of noktalar) {
      const anahtar = `${n.lat},${n.lng}`;
      const k = ayni.get(anahtar) ?? 0;
      ayni.set(anahtar, k + 1);
      const aci = k * 2.4, yaricap = k ? 0.003 * Math.sqrt(k) : 0;
      const m = L.marker([n.lat + yaricap * Math.sin(aci), n.lng + yaricap * Math.cos(aci) * 1.25], {
        icon: L.divIcon({ className: "fiyat-isaret", html: `<span>${escape(n.kisa)}</span>`, iconSize: null }),
      }).bindPopup(`<a href="/ilan/${n.no}"><strong>${escape(n.baslik)}</strong></a><br>${escape(n.fiyat)}`);
      m.addTo(katman);
      isaretler.set(String(n.no), m);
    }
    kartVurgusu();
  }

  // Kartın üzerine gelince haritadaki fiyat etiketi öne çıkar.
  function kartVurgusu() {
    sonucAlani.querySelectorAll("a.kart").forEach((k) => {
      const no = k.getAttribute("href").split("/").pop();
      k.addEventListener("mouseenter", () => isaretler.get(no)?.getElement()?.classList.add("vurgulu"));
      k.addEventListener("mouseleave", () => isaretler.get(no)?.getElement()?.classList.remove("vurgulu"));
    });
  }

  // İlk görünüm: URL'de harita alanı varsa o, yoksa sonuçlara sığdır.
  let sistemHareketi = true;
  const ilk = noktalariOku();
  const sinir = new URL(location.href).searchParams.get("sinir")?.split(",").map(Number);
  if (sinir?.length === 4) harita.fitBounds([[sinir[0], sinir[1]], [sinir[2], sinir[3]]]);
  else if (ilk.length) harita.fitBounds(ilk.map((n) => [n.lat, n.lng]), { padding: [40, 40], maxZoom: 13 });
  else harita.fitBounds(BODRUM);
  isaretle(ilk);
  setTimeout(() => (sistemHareketi = false), 600);

  let zamanlayici;
  let istek = 0;
  async function alaniAra() {
    const b = harita.getBounds();
    const deger = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((x) => x.toFixed(5)).join(",");
    const url = new URL(location.href);
    url.searchParams.set("sinir", deger);
    const benim = ++istek;
    sonucAlani.classList.add("yukleniyor");
    try {
      const html = await (await fetch(url)).text();
      if (benim !== istek) return; // daha yeni bir istek geldi
      const yeni = new DOMParser().parseFromString(html, "text/html");
      sonucAlani.innerHTML = yeni.querySelector("[data-sonuc-alani]").innerHTML;
      sayiEl.textContent = yeni.querySelector("[data-sonuc-sayi]").textContent;
      sinirGizli.value = deger;
      history.replaceState(null, "", url);
      isaretle(noktalariOku());
      buAlanda.hidden = true;
    } finally {
      if (benim === istek) sonucAlani.classList.remove("yukleniyor");
    }
  }

  harita.on("moveend", () => {
    if (sistemHareketi) return;
    if (kaydirincaAra.checked) {
      clearTimeout(zamanlayici);
      zamanlayici = setTimeout(alaniAra, 350);
    } else buAlanda.hidden = false;
  });
  buAlanda.addEventListener("click", alaniAra);
  kaydirincaAra.addEventListener("change", () => { if (kaydirincaAra.checked) alaniAra(); });
}

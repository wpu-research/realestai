// Arama sayfası: filtre paneli, fiyat kaydırıcısı, adres zinciri, yakınımda ara ve
// Airbnb gibi harita (kaydırınca/yakınlaştırınca liste görünen alana göre yenilenir).
import { escape } from "./ortak.js";

const BODRUM = [[36.95, 27.2], [37.16, 27.5]];
const panel = document.querySelector("[data-filtre-panel]");
const sinirGizli = panel.querySelector("[data-sinir-gizli]");
const masaustu = () => window.matchMedia("(min-width: 1024px)").matches;

// ---------- Filtre paneli ----------
document.querySelector("[data-filtre-ac]")?.addEventListener("click", () => panel.classList.add("acik"));
document.querySelector("[data-filtre-kapat]")?.addEventListener("click", () => panel.classList.remove("acik"));

function gonder() {
  // Boş alanları ve kaydırıcıları URL'ye taşıma.
  for (const el of panel.querySelectorAll("input, select")) if (!el.value || el.type === "range") el.disabled = true;
  const kelime = document.querySelector("input[name=kelime]");
  if (kelime && !kelime.value) kelime.disabled = true;
  panel.submit();
}
panel.addEventListener("submit", (e) => { e.preventDefault(); gonder(); });

// Masaüstünde dokunmalı seçimler anında uygulanır; telefonda "Sonuçları göster" ile.
panel.querySelectorAll(".filtre-cip input, select").forEach((el) =>
  el.addEventListener("change", () => { if (masaustu()) gonder(); }));

// ---------- Fiyat: çift kaydırıcı + Min/Max kutuları ----------
const kayd = panel.querySelector("[data-kaydirici]");
if (kayd) {
  const ust = Number(kayd.dataset.ust);
  const aMin = kayd.querySelector("[data-aralik-min]");
  const aMax = kayd.querySelector("[data-aralik-max]");
  const kMin = panel.querySelector("[data-fiyat-min]");
  const kMax = panel.querySelector("[data-fiyat-max]");
  const dolu = kayd.querySelector("[data-dolu]");
  const eMin = panel.querySelector("[data-etiket-min]");
  const eMax = panel.querySelector("[data-etiket-max]");
  const bicim = (x) => new Intl.NumberFormat("tr-TR", { notation: x >= 1e6 ? "compact" : "standard", maximumFractionDigits: 1 }).format(x);

  const ciz = () => {
    const a = Number(aMin.value), b = Number(aMax.value);
    dolu.style.left = `${(a / ust) * 100}%`;
    dolu.style.right = `${100 - (b / ust) * 100}%`;
    eMin.textContent = bicim(a);
    eMax.textContent = b >= ust ? `${bicim(ust)}+` : bicim(b);
  };
  const kaydiricidan = () => {
    if (Number(aMin.value) > Number(aMax.value)) [aMin.value, aMax.value] = [aMax.value, aMin.value];
    kMin.value = Number(aMin.value) > 0 ? aMin.value : "";
    kMax.value = Number(aMax.value) < ust ? aMax.value : "";
    ciz();
  };
  const kutudan = () => {
    aMin.value = Math.min(Number(kMin.value) || 0, ust);
    aMax.value = kMax.value ? Math.min(Number(kMax.value), ust) : ust;
    ciz();
  };
  aMin.addEventListener("input", kaydiricidan);
  aMax.addEventListener("input", kaydiricidan);
  aMin.addEventListener("change", () => masaustu() && gonder());
  aMax.addEventListener("change", () => masaustu() && gonder());
  kMin.addEventListener("input", kutudan);
  kMax.addEventListener("input", kutudan);
  ciz();
}

// ---------- Adres: il → ilçe → mahalle çipleri ----------
const ilSec = panel.querySelector("[data-il]");
const ilceSec = panel.querySelector("[data-ilce]");
function mahalleSuz() {
  const il = ilSec.value, ilce = ilceSec.value;
  panel.querySelectorAll("[data-mahalle-cipler] .filtre-cip").forEach((c) => {
    const uygun = (!il || c.dataset.ilAdi === il) && (!ilce || c.dataset.ilceAdi === ilce);
    c.hidden = !uygun;
    if (!uygun) c.querySelector("input").checked = false;
  });
}
ilSec?.addEventListener("change", () => { ilceSec.value = ""; mahalleSuz(); });
ilceSec?.addEventListener("change", mahalleSuz);
mahalleSuz();

// ---------- Yakınımda ara ----------
const yakinDurum = panel.querySelector("[data-yakin-durum]");
panel.querySelector("[data-yakinimda]")?.addEventListener("click", () => {
  const gizli = panel.querySelector("[data-yakin-gizli]");
  if (gizli.value) { gizli.value = ""; gonder(); return; }   // açıksa kapat
  if (!navigator.geolocation) { yakinDurum.textContent = "Tarayıcınız konum paylaşımını desteklemiyor."; return; }
  yakinDurum.textContent = "Konum izni bekleniyor…";
  navigator.geolocation.getCurrentPosition(
    (p) => {
      gizli.value = `${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}`;
      panel.querySelector("input[name=siralama]").value = "yakin";
      gonder();
    },
    (h) => {
      yakinDurum.textContent = h.code === 1
        ? "Konum izni verilmedi. Tarayıcı ayarlarından izin verebilir ya da adres seçebilirsiniz."
        : "Konumunuz alınamadı, lütfen tekrar deneyin.";
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
  );
});

// ---------- Sonuçları sayfa yenilemeden yükle (harita alanı, sıralama) ----------
const sonucAlani = document.querySelector("[data-sonuc-alani]");
const sayiEl = document.querySelector("[data-sonuc-sayi]");
let istekNo = 0;
let haritaYenile = () => {};

async function sonuclariYukle(url, { gecmis = "replace" } = {}) {
  const benim = ++istekNo;
  sonucAlani.classList.add("yukleniyor");
  try {
    const html = await (await fetch(url)).text();
    if (benim !== istekNo) return false;   // daha yeni bir istek geldi
    const yeni = new DOMParser().parseFromString(html, "text/html");
    sonucAlani.innerHTML = yeni.querySelector("[data-sonuc-alani]").innerHTML;
    sayiEl.textContent = yeni.querySelector("[data-sonuc-sayi]").textContent;
    const sirala = document.querySelector("[data-sirala]");
    const yeniSirala = yeni.querySelector("[data-sirala]");
    if (sirala && yeniSirala) sirala.innerHTML = yeniSirala.innerHTML;
    const u = new URL(url, location.href);
    panel.querySelector("input[name=siralama]").value = u.searchParams.get("siralama") ?? "";
    const tarih = panel.querySelectorAll("input[name=ilan_tarihi]");
    tarih.forEach((r) => (r.checked = r.value === (u.searchParams.get("ilan_tarihi") ?? "")));
    history[gecmis === "push" ? "pushState" : "replaceState"](null, "", u);
    haritaYenile(JSON.parse(sonucAlani.querySelector("[data-noktalar]")?.textContent || "[]"));
    return true;
  } finally {
    if (benim === istekNo) sonucAlani.classList.remove("yukleniyor");
  }
}

// Sırala: aynı ekranda, sayfa yenilenmeden
document.addEventListener("click", (e) => {
  const a = e.target.closest(".sirala-menu a");
  if (!a) return;
  e.preventDefault();
  document.querySelector("[data-sirala]").open = false;
  sonuclariYukle(a.href, { gecmis: "push" });
});
window.addEventListener("popstate", () => sonuclariYukle(location.href));

// ---------- Harita ----------
const mobilHarita = document.querySelector("[data-mobil-harita]");

panel.querySelector("[data-haritada-ara]")?.addEventListener("click", () => {
  panel.classList.remove("acik");
  const hedef = masaustu() ? document.querySelector(".ara-harita .harita-kart") : mobilHarita;
  if (!masaustu()) mobilHarita.classList.add("tam-ekran");
  hedef.scrollIntoView({ behavior: "smooth", block: "center" });
  hedef.classList.add("parla");
  setTimeout(() => hedef.classList.remove("parla"), 1500);
  window.dispatchEvent(new Event("resize"));
});

const kap = [...document.querySelectorAll(".harita-kart")].find((el) => el.offsetParent !== null);
const el = kap?.querySelector("[data-harita]");
if (el && window.L) {
  const harita = L.map(el, { scrollWheelZoom: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(harita);
  const katman = L.layerGroup().addTo(harita);
  const isaretler = new Map();
  const kaydirincaAra = kap.querySelector("[data-kaydirinca-ara]");
  const buAlanda = kap.querySelector("[data-bu-alanda-ara]");
  window.addEventListener("resize", () => setTimeout(() => harita.invalidateSize(), 300));

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
    sonucAlani.querySelectorAll("a.kart").forEach((k) => {
      const no = k.getAttribute("href").split("/").pop();
      k.addEventListener("mouseenter", () => isaretler.get(no)?.getElement()?.classList.add("vurgulu"));
      k.addEventListener("mouseleave", () => isaretler.get(no)?.getElement()?.classList.remove("vurgulu"));
    });
    document.dispatchEvent(new Event("kartlar-yenilendi"));
  }

  // İlk görünüm: URL'de harita alanı varsa o, yoksa sonuçlara sığdır.
  let sistemHareketi = true;
  const ilk = noktalariOku();
  const sinir = new URL(location.href).searchParams.get("sinir")?.split(",").map(Number);
  if (sinir?.length === 4) harita.fitBounds([[sinir[0], sinir[1]], [sinir[2], sinir[3]]]);
  else if (ilk.length) harita.fitBounds(ilk.map((n) => [n.lat, n.lng]), { padding: [40, 40], maxZoom: 13 });
  else harita.fitBounds(BODRUM);
  isaretle(ilk);
  // Yakınımda aramasında kullanıcının konumunu göster.
  const yakin = new URL(location.href).searchParams.get("yakin")?.split(",").map(Number);
  if (yakin?.length === 2) L.circleMarker(yakin, { radius: 8, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).addTo(harita).bindTooltip("Konumunuz");
  setTimeout(() => (sistemHareketi = false), 600);

  let zamanlayici;
  haritaYenile = isaretle;
  async function alaniAra() {
    const b = harita.getBounds();
    const deger = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((x) => x.toFixed(5)).join(",");
    const url = new URL(location.href);
    url.searchParams.set("sinir", deger);
    if (await sonuclariYukle(url)) { sinirGizli.value = deger; buAlanda.hidden = true; }
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

// Sırala menüsü dışına tıklanınca kapansın.
document.addEventListener("click", (e) => {
  const s = document.querySelector("[data-sirala]");
  if (s?.open && !s.contains(e.target)) s.open = false;
});

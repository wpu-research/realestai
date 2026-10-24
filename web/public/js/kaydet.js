// Kaydetme: favori ilanlar ve kayıtlı aramalar bu cihazın tarayıcısında tutulur (üyelik yok).
import { t } from "./ortak.js";

const ILAN = "kaydedilenIlanlar";
const ARAMA = "kaydedilenAramalar";

const oku = (k) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const yaz = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} rozet(); };

export const favoriler = () => oku(ILAN);
export const aramalar = () => oku(ARAMA);

function rozet() {
  const n = oku(ILAN).length + oku(ARAMA).length;
  document.querySelectorAll("[data-kayit-sayi]").forEach((el) => { el.textContent = n ? String(n) : ""; el.hidden = !n; });
}

export function ilanKaydet(no, kaydet) {
  const liste = oku(ILAN).filter((x) => x !== no);
  if (kaydet) liste.unshift(no);
  yaz(ILAN, liste.slice(0, 200));
  fetch("/api/favori", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ no, artis: kaydet ? 1 : -1 }) }).catch(() => {});
}

// Taşıma kodundan gelen kayıtlar mevcutlarla birleştirilir (hiçbiri silinmez). Eklenen sayıları döner.
export function birlestir(veri) {
  const ilanlar = oku(ILAN);
  const yeniIlan = (veri.ilanlar ?? []).filter((no) => Number.isInteger(no) && !ilanlar.includes(no));
  const aramaListe = oku(ARAMA);
  const yeniArama = (veri.aramalar ?? []).filter((a) => typeof a?.url === "string" && /^\/(?![\/\\])/.test(a.url) && !aramaListe.some((x) => x.url === a.url));
  yaz(ILAN, [...ilanlar, ...yeniIlan].slice(0, 200));
  yaz(ARAMA, [...aramaListe, ...yeniArama].slice(0, 50));
  kalpleriCiz();
  return { ilan: yeniIlan.length, arama: yeniArama.length };
}

export function aramaSil(url) {
  yaz(ARAMA, oku(ARAMA).filter((a) => a.url !== url));
}

function kalpleriCiz() {
  const secili = new Set(oku(ILAN));
  document.querySelectorAll("[data-kaydet-ilan]").forEach((b) => {
    const no = Number(b.dataset.kaydetIlan);
    const kayitli = secili.has(no);
    b.classList.toggle("kayitli", kayitli);
    b.setAttribute("aria-pressed", String(kayitli));
    b.setAttribute("aria-label", kayitli ? t("Kaydedilenlerden çıkar") : t("Kaydet"));
    const yazi = b.querySelector("[data-yazi]");
    if (yazi) yazi.textContent = kayitli ? t("Kaydedildi") : t("Kaydet");
  });
}

document.addEventListener("click", (e) => {
  const kalp = e.target.closest("[data-kaydet-ilan]");
  if (kalp) {
    e.preventDefault();   // kart bağlantısına gitmesin
    e.stopPropagation();
    const no = Number(kalp.dataset.kaydetIlan);
    ilanKaydet(no, !oku(ILAN).includes(no));
    kalpleriCiz();
    return;
  }
  const arama = e.target.closest("[data-arama-kaydet]");
  if (arama) {
    const url = new URL(location.href);
    url.searchParams.delete("sinir");   // harita alanı geçici; kayıtlı aramada tutma
    const yol = url.pathname + url.search;
    const ad = prompt(t("Bu aramaya bir ad verin:"), t("Bodrum araması"));
    if (ad === null) return;
    const liste = oku(ARAMA).filter((a) => a.url !== yol);
    liste.unshift({ ad: ad.trim() || t("Aramam"), url: yol, tarih: new Date().toISOString() });
    yaz(ARAMA, liste.slice(0, 50));
    arama.textContent = "✓ " + t("Arama kaydedildi");
  }
});

document.addEventListener("kartlar-yenilendi", kalpleriCiz);
kalpleriCiz();
rozet();

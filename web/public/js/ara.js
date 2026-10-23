import { haritaKur } from "./ortak.js";

const noktalar = JSON.parse(document.getElementById("noktalar")?.textContent || "[]");
// Masaüstünde sağdaki, telefonda listenin üstündeki harita görünür; yalnız görünen kurulur.
const gorunen = [...document.querySelectorAll("[data-harita]")].find((el) => el.offsetParent !== null);
haritaKur(gorunen, noktalar);

const panel = document.querySelector("[data-filtre-panel]");
document.querySelector("[data-filtre-ac]")?.addEventListener("click", () => panel.classList.add("acik"));
document.querySelector("[data-filtre-kapat]")?.addEventListener("click", () => panel.classList.remove("acik"));

function gonder() {
  // Boş alanları URL'ye taşıma.
  for (const el of panel.querySelectorAll("input, select")) if (!el.value) el.disabled = true;
  panel.submit();
}
panel?.addEventListener("submit", (e) => { e.preventDefault(); gonder(); });

// Masaüstünde çip ve kutular anında uygulanır; telefonda "Uygula" ile.
const masaustu = () => window.matchMedia("(min-width: 1024px)").matches;
panel?.querySelectorAll(".filtre-cip input, .kutu input").forEach((el) =>
  el.addEventListener("change", () => { if (masaustu()) gonder(); }));

document.querySelector("[data-siralama]")?.addEventListener("change", (e) => {
  panel.querySelector("[data-siralama-gizli]").value = e.target.value;
  gonder();
});

import { haritaKur } from "./ortak.js";

const harita = document.getElementById("harita");
if (harita) haritaKur(harita, JSON.parse(harita.dataset.noktalar || "[]"));

const panel = document.querySelector("[data-filtre-panel]");
document.querySelector("[data-filtre-ac]")?.addEventListener("click", () => panel.classList.add("acik"));
document.querySelector("[data-filtre-kapat]")?.addEventListener("click", () => panel.classList.remove("acik"));

// Boş alanları URL'ye taşımamak için gönderimden önce kaldır.
panel?.addEventListener("submit", () => {
  for (const el of panel.querySelectorAll("input, select")) if (!el.value) el.disabled = true;
});

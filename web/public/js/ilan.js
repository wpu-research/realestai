import { haritaKur } from "./ortak.js";

const harita = document.getElementById("harita");
if (harita) haritaKur(harita, JSON.parse(harita.dataset.noktalar || "[]"), { yakin: true });

// Galeri: oda sekmeleri
const galeri = document.querySelector("[data-galeri]");
galeri?.querySelectorAll("[data-oda]").forEach((b) =>
  b.addEventListener("click", () => {
    galeri.querySelectorAll("[data-oda]").forEach((x) => x.classList.toggle("aktif", x === b));
    galeri.querySelectorAll("[data-oda-etiket]").forEach((a) => {
      a.hidden = !!b.dataset.oda && a.dataset.odaEtiket !== b.dataset.oda;
    });
  }));

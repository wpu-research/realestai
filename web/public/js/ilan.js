import { haritaKur } from "./ortak.js";

haritaKur(document.querySelector("[data-harita]"), JSON.parse(document.getElementById("noktalar")?.textContent || "[]"), { yakin: true });

// Galeri: küçük resme tıklayınca büyük görsel değişir.
const ana = document.querySelector("[data-ana]");
document.querySelectorAll("[data-foto]").forEach((b) =>
  b.addEventListener("click", () => {
    ana.src = b.dataset.foto;
    document.querySelectorAll("[data-foto]").forEach((x) => x.classList.toggle("aktif", x === b));
  }));

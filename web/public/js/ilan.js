import { haritaKur } from "./ortak.js";

haritaKur(document.querySelector("[data-harita]"), JSON.parse(document.getElementById("noktalar")?.textContent || "[]"), { yakin: true });

// Galeri: küçük resme tıklayınca büyük görsel değişir.
const ana = document.querySelector("[data-ana]");
document.querySelectorAll("[data-foto]").forEach((b) =>
  b.addEventListener("click", () => {
    ana.src = b.dataset.foto;
    document.querySelectorAll("[data-foto]").forEach((x) => x.classList.toggle("aktif", x === b));
  }));

// Temsili 3D: derinlikli fotoğraf görüntüleyici (uyarı ve filigran kapatılamaz).
const pencere = document.querySelector("[data-3d-pencere]");
if (pencere) {
  const veri = JSON.parse(pencere.querySelector("[data-3d-veri]").textContent);
  const tuval = pencere.querySelector("[data-3d-tuval]");
  let kapat = null;
  const goster = async (k) => {
    kapat?.();
    pencere.querySelectorAll("[data-3d-sec]").forEach((b) => b.classList.toggle("aktif", Number(b.dataset["3dSec"]) === k));
    const { derinlikGoster } = await import("./derinlik3d.js");
    kapat = await derinlikGoster(tuval, veri[k].foto, veri[k].derinlik).catch(() => null);
  };
  document.querySelector("[data-3d-ac]").addEventListener("click", () => {
    pencere.showModal();
    const k = Math.max(0, veri.findIndex((v) => v.foto === ana.getAttribute("src")));
    goster(k);
  });
  pencere.querySelectorAll("[data-3d-sec]").forEach((b) => b.addEventListener("click", () => goster(Number(b.getAttribute("data-3d-sec")))));
  pencere.querySelector("[data-3d-kapat]").addEventListener("click", () => pencere.close());
  pencere.addEventListener("close", () => { kapat?.(); kapat = null; });
}

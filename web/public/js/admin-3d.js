// İlan editörü: fotoğraflardan derinlik haritası üretir (tarayıcıda, Depth Anything V2 Small — Apache-2.0)
// ve sunucuya yükler. Sunucuda GPU gerekmez. Önizleme aynı görüntüleyiciyle yapılır.
import { derinlikGoster } from "/js/derinlik3d.js";

const MODEL = "onnx-community/depth-anything-v2-small";
const kok = document.querySelector("[data-3d]");

let tahminci = null;
async function model(durum) {
  if (tahminci) return tahminci;
  durum("Model yükleniyor (ilk seferde ~30 MB)…");
  const { pipeline } = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6");
  // WebGPU varsa onu (kart destekliyorsa fp16), olmazsa işlemcide (WASM, 8-bit) çalışır.
  const adaptor = await navigator.gpu?.requestAdapter().catch(() => null);
  if (adaptor) {
    try {
      tahminci = await pipeline("depth-estimation", MODEL, { device: "webgpu", dtype: adaptor.features.has("shader-f16") ? "fp16" : "fp32" });
      return tahminci;
    } catch { /* aşağıda WASM */ }
  }
  durum("Model işlemcide çalışacak (daha yavaş)…");
  tahminci = await pipeline("depth-estimation", MODEL, { device: "wasm", dtype: "q8" });
  return tahminci;
}

async function derinlikPng(url) {
  const { depth } = await tahminci(url);
  const tuval = depth.toCanvas();
  // toCanvas() ortama göre OffscreenCanvas da döndürebilir.
  if (tuval.convertToBlob) return tuval.convertToBlob({ type: "image/png" });
  return new Promise((ok) => tuval.toBlob(ok, "image/png"));
}

if (kok) {
  const durumEl = kok.querySelector("[data-3d-durum]");
  const durum = (m) => (durumEl.textContent = m);
  kok.querySelector("[data-3d-uret]")?.addEventListener("click", async (e) => {
    const d = e.currentTarget;
    const eksik = [...kok.querySelectorAll("[data-3d-foto]")].filter((x) => !x.dataset.var);
    if (!eksik.length) return durum("Tüm fotoğrafların derinliği var.");
    d.disabled = true;
    try {
      await model(durum);
      for (const [n, x] of eksik.entries()) {
        durum(`Derinlik hesaplanıyor ${n + 1}/${eksik.length}…`);
        const png = await derinlikPng(x.dataset.url);
        const form = new FormData();
        form.append("foto_id", x.getAttribute("data-3d-foto"));
        form.append("derinlik", png, "derinlik.png");
        form.append("model", MODEL);
        const r = await fetch(kok.getAttribute("data-3d"), { method: "POST", body: form });
        if (!r.ok) throw new Error(`yükleme ${r.status}`);
      }
      durum("Bitti, sayfa yenileniyor…");
      location.reload();
    } catch (err) {
      durum(`Hata: ${err.message}`);
      d.disabled = false;
    }
  });
  // Önizlemeler
  for (const t of kok.querySelectorAll("canvas[data-onizle]")) {
    derinlikGoster(t, t.dataset.foto, t.dataset.onizle).catch(() => (t.replaceWith("önizleme açılamadı")));
  }
}

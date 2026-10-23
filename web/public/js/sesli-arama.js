// Arama kutusu: yazınca kelimeyle arar (normal form gönderimi); mikrofon ve örnek cümleler
// "detaylı sesli arama"dır — konuşulan cümle yapay zekâyla filtrelere çevrilir.
import { dinle, KonusmaTanima, postJson } from "./ortak.js";

const kutu = document.querySelector("[data-sesli-arama]");
if (kutu) {
  const girdi = kutu.querySelector("input");
  const mikrofon = kutu.querySelector("[data-mikrofon]");
  const durum = kutu.querySelector("[data-durum]");
  const onceki = (() => {
    try { return JSON.parse(document.getElementById("filtreler")?.textContent || "null"); } catch { return null; }
  })();

  async function detayliAra(metin) {
    if (!metin.trim()) return;
    durum.textContent = "Anlıyorum…";
    kutu.classList.add("bekliyor");
    try {
      const temiz = onceki && Object.keys(onceki).length ? { ...onceki, kelime: undefined, sinir: undefined } : undefined;
      const j = await postJson("/api/sesli-arama", { metin, dil: "tr", onceki: temiz });
      if (j.anlasilmadi) { durum.textContent = j.ozet; return; }
      try { sessionStorage.setItem("aramaOzeti", j.ozet); } catch {}
      location.href = j.url;
    } catch {
      // Yapay zekâ kullanılamıyorsa kelimeyle aramaya düş.
      if (kutu.tagName === "FORM") { kutu.dataset.dogrudan = "1"; kutu.submit(); return; }
      durum.textContent = "Detaylı arama şu an kullanılamıyor; kelimeyle aramayı deneyin.";
    } finally {
      kutu.classList.remove("bekliyor");
    }
  }

  // Ana sayfa: 3+ kelimelik cümle detaylı aramaya gider; kısa yazım kelime aramasıdır.
  if (kutu.hasAttribute("data-akilli")) {
    kutu.addEventListener("submit", (e) => {
      if (kutu.dataset.dogrudan) return;
      const metin = girdi.value.trim();
      if (metin.split(/\s+/).length >= 3) { e.preventDefault(); detayliAra(metin); }
    });
  }

  if (KonusmaTanima) {
    mikrofon.hidden = false;
    mikrofon.addEventListener("click", () => {
      if (kutu.classList.contains("dinliyor")) return;
      kutu.classList.add("dinliyor");
      durum.textContent = "Dinliyorum… aradığınız evi anlatın.";
      dinle({
        araSonuc: (m) => (girdi.value = m),
        bitti: (m) => { kutu.classList.remove("dinliyor"); durum.textContent = ""; if (m) detayliAra(m); },
        hata: () => { kutu.classList.remove("dinliyor"); durum.textContent = "Mikrofona erişilemedi, yazarak arayabilirsiniz."; },
      });
    });
  }

  document.querySelectorAll("[data-ornek]").forEach((b) =>
    b.addEventListener("click", () => { girdi.value = b.dataset.ornek; detayliAra(b.dataset.ornek); }));
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-detayli-dene]");
    if (b) detayliAra(b.dataset.detayliDene);
  });

  // /ara: yönlendirmeden önce saklanan özet balonu.
  const ozetEl = document.querySelector("[data-ozet]");
  try {
    const ozet = sessionStorage.getItem("aramaOzeti");
    if (ozet && ozetEl) { ozetEl.textContent = ozet; ozetEl.hidden = false; sessionStorage.removeItem("aramaOzeti"); }
  } catch {}
}

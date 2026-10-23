// Ana sayfa ve /ara: tek cümleyle (sesli ya da yazılı) arama → filtreler → /ara.
import { dinle, KonusmaTanima, postJson } from "./ortak.js";

const form = document.querySelector("[data-sesli-arama]");
if (form) {
  const girdi = form.querySelector("input[name=q]");
  const mikrofon = form.querySelector("[data-mikrofon]");
  const durum = form.querySelector("[data-durum]");
  const onceki = (() => {
    try { return JSON.parse(document.getElementById("filtreler")?.textContent || "null"); } catch { return null; }
  })();

  async function ara(metin) {
    if (!metin.trim()) return;
    durum.textContent = "Anlıyorum…";
    form.classList.add("bekliyor");
    try {
      const j = await postJson("/api/sesli-arama", {
        metin, dil: "tr", onceki: onceki && Object.keys(onceki).length ? onceki : undefined,
      });
      if (j.anlasilmadi) {
        durum.textContent = j.ozet;
        form.classList.remove("bekliyor");
        return;
      }
      try { sessionStorage.setItem("aramaOzeti", j.ozet); } catch {}
      location.href = j.url + (j.url.includes("?") ? "&" : "?") + "q=" + encodeURIComponent(metin);
    } catch {
      durum.textContent = "Aramanızı anlayamadık, filtrelerden seçebilirsiniz.";
      form.classList.remove("bekliyor");
      document.querySelector("[data-filtre-panel]")?.classList.add("acik");
    }
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); ara(girdi.value); });

  if (KonusmaTanima) {
    mikrofon.hidden = false;
    mikrofon.addEventListener("click", () => {
      if (form.classList.contains("dinliyor")) return;
      form.classList.add("dinliyor");
      durum.textContent = "Dinliyorum…";
      dinle({
        araSonuc: (m) => (girdi.value = m),
        bitti: (m) => { form.classList.remove("dinliyor"); durum.textContent = ""; if (m) ara(m); },
        hata: () => { form.classList.remove("dinliyor"); durum.textContent = "Mikrofona erişilemedi, yazarak arayabilirsiniz."; },
      });
    });
  }

  document.querySelectorAll("[data-ornek]").forEach((b) =>
    b.addEventListener("click", () => { girdi.value = b.dataset.ornek; ara(b.dataset.ornek); }));

  // /ara: yönlendirmeden önce saklanan özet balonu.
  const ozetEl = document.querySelector("[data-ozet]");
  try {
    const ozet = sessionStorage.getItem("aramaOzeti");
    if (ozet && ozetEl) { ozetEl.textContent = ozet; ozetEl.hidden = false; sessionStorage.removeItem("aramaOzeti"); }
  } catch {}
}

import { aramalar, aramaSil, favoriler } from "./kaydet.js";
import { escape } from "./ortak.js";

const aramaEl = document.querySelector("[data-aramalar]");
const ilanEl = document.querySelector("[data-ilanlar]");
const bos = document.querySelector("[data-bos]");

function aramalariCiz() {
  const liste = aramalar();
  aramaEl.innerHTML = liste.length
    ? liste.map((a) => `<div class="kayitli-arama"><a href="${escape(a.url)}"><strong>${escape(a.ad)}</strong>
        <span class="kucuk">${new Date(a.tarih).toLocaleDateString("tr-TR")}</span></a>
        <button type="button" class="metin-dugme" data-sil="${escape(a.url)}">Sil</button></div>`).join("")
    : `<p class="kucuk">Kayıtlı aramanız yok. Arama sonuçlarında "♡ Aramayı kaydet" ile kaydedebilirsiniz.</p>`;
  aramaEl.querySelectorAll("[data-sil]").forEach((b) => b.addEventListener("click", () => { aramaSil(b.dataset.sil); aramalariCiz(); }));
}

async function ilanlariCiz() {
  const nolar = favoriler();
  if (!nolar.length) { ilanEl.innerHTML = ""; bos.hidden = false; return; }
  ilanEl.innerHTML = await (await fetch(`/api/kartlar?no=${nolar.join(",")}`)).text();
  bos.hidden = ilanEl.children.length > 0;
  document.dispatchEvent(new Event("kartlar-yenilendi"));
}

aramalariCiz();
ilanlariCiz();
// Bu sayfada kalp kaldırılınca kart listeden çıksın.
document.addEventListener("click", (e) => { if (e.target.closest("[data-kaydet-ilan]")) setTimeout(ilanlariCiz, 50); });

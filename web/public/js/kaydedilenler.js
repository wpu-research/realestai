import { aramalar, aramaSil, birlestir, favoriler } from "./kaydet.js";
import { escape, t, YEREL } from "./ortak.js";

const aramaEl = document.querySelector("[data-aramalar]");
const ilanEl = document.querySelector("[data-ilanlar]");
const bos = document.querySelector("[data-bos]");

function aramalariCiz() {
  const liste = aramalar();
  aramaEl.innerHTML = liste.length
    ? liste.map((a) => `<div class="kayitli-arama"><a href="${escape(a.url)}"><strong>${escape(a.ad)}</strong>
        <span class="kucuk">${new Date(a.tarih).toLocaleDateString(YEREL)}</span></a>
        <button type="button" class="metin-dugme" data-sil="${escape(a.url)}">${t("Sil")}</button></div>`).join("")
    : `<p class="kucuk">${t("Kayıtlı aramanız yok. Arama sonuçlarında \"♡ Aramayı kaydet\" ile kaydedebilirsiniz.")}</p>`;
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

// ---- Başka cihaza taşı ----
const durum = document.querySelector("[data-aktarim-durum]");
const sonucEl = document.querySelector("[data-kod-sonuc]");
let baglanti = "";

document.querySelector("[data-kod-olustur]").addEventListener("click", async (e) => {
  const dugme = e.currentTarget;   // await sonrası currentTarget boşalır
  durum.textContent = "";
  if (!favoriler().length && !aramalar().length) { durum.textContent = t("Taşınacak kayıt yok."); return; }
  dugme.disabled = true;
  try {
    const r = await fetch("/api/aktarim", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ilanlar: favoriler(), aramalar: aramalar() }) });
    const v = await r.json();
    if (!r.ok) throw new Error(v.hata);
    baglanti = `${location.origin}/kaydedilenler?aktar=${v.kod}`;
    sonucEl.querySelector("[data-kod]").textContent = v.kod;
    sonucEl.querySelector("[data-paylas]").hidden = !navigator.share;
    sonucEl.hidden = false;
  } catch (err) {
    durum.textContent = err.message || t("Kod oluşturulamadı.");
  } finally {
    dugme.disabled = false;
  }
});
sonucEl.querySelector("[data-kopyala]").addEventListener("click", async (e) => {
  const dugme = e.currentTarget;
  try { await navigator.clipboard.writeText(baglanti); dugme.textContent = "✓ " + t("Kopyalandı"); }
  catch { prompt(t("Bağlantıyı kopyala"), baglanti); }
});
sonucEl.querySelector("[data-paylas]").addEventListener("click", () => {
  navigator.share({ title: t("Kaydedilenler"), url: baglanti }).catch(() => {});
});

async function kodGetir(kod) {
  durum.textContent = t("Yükleniyor…");
  try {
    const r = await fetch(`/api/aktarim/${encodeURIComponent(kod.trim())}`);
    const v = await r.json();
    if (!r.ok) throw new Error(v.hata);
    const n = birlestir(v);
    durum.textContent = n.ilan || n.arama
      ? t("{ilan} ilan ve {arama} arama bu cihaza eklendi.", n)
      : t("Bu kayıtların hepsi bu cihazda zaten var.");
    aramalariCiz();
    ilanlariCiz();
  } catch (err) {
    durum.textContent = err.message || t("Kod bulunamadı ya da süresi doldu.");
  }
}
const girForm = document.querySelector("[data-kod-gir]");
girForm.addEventListener("submit", (e) => { e.preventDefault(); kodGetir(girForm.kod.value); });

// Bağlantıyla gelindiyse kod kendiliğinden alınır; adres çubuğundan da silinir (yeniden yüklemede tekrar eklemesin).
const gelen = new URLSearchParams(location.search).get("aktar");
if (gelen) {
  girForm.kod.value = gelen;
  history.replaceState(null, "", location.pathname + "#tasi");
  document.getElementById("tasi").scrollIntoView();
  kodGetir(gelen);
}

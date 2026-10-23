// İlan düzenleme: "Yapay zekâ ile doldur" — önce fotoğraf etiketleri (partiler halinde), sonra çeviri.
const dugme = document.querySelector("[data-zeka]");
const durum = document.querySelector("[data-zeka-durum]");

async function cagir(is) {
  const r = await fetch(`/admin/api/ilan/${dugme.dataset.zeka}/zeka`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.hata || `HTTP ${r.status}`);
  return j;
}

dugme?.addEventListener("click", async () => {
  dugme.disabled = true;
  const mesajlar = [];
  try {
    let toplam = 0;
    for (;;) {
      durum.textContent = `Fotoğraflar etiketleniyor… (${toplam} bitti)`;
      const j = await cagir("foto");
      toplam += j.etiketlenen;
      if (j.kalan <= 0) break;
      if (j.etiketlenen === 0) { mesajlar.push(`${j.kalan} fotoğraf etiketlenemedi`); break; }
    }
    mesajlar.push(`${toplam} fotoğraf etiketlendi`);
  } catch (e) {
    mesajlar.push(`Fotoğraf etiketleme hatası: ${e.message}`);
  }
  try {
    durum.textContent = "Çeviriler hazırlanıyor…";
    const j = await cagir("ceviri");
    mesajlar.push(`Çeviriler hazır${j.kirmizi_bayraklar.length ? `, ${j.kirmizi_bayraklar.length} kırmızı bayrak` : ""}`);
  } catch (e) {
    mesajlar.push(`Çeviri hatası: ${e.message}`);
  }
  durum.textContent = mesajlar.join(" · ");
  setTimeout(() => location.reload(), 2500);
});

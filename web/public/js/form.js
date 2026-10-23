// KVKK kutusu işaretlenmeden "Gönder" pasif (Lovable tasarımındaki gibi).
document.querySelectorAll("[data-kvkk-form]").forEach((f) => {
  const kutu = f.querySelector("[name=kvkk_onay]");
  const dugme = f.querySelector("button");
  const guncelle = () => (dugme.disabled = !kutu.checked);
  kutu.addEventListener("change", guncelle);
  guncelle();
});

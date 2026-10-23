// Konut kredisi: eşit taksitli (anüite) hesap.
const form = document.querySelector("[data-kredi]");
const sonuc = document.querySelector("[data-sonuc]");
const tl = (x) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.round(x)) + " ₺";
const yaz = (k, v) => (sonuc.querySelector(`[data-k=${k}]`).textContent = v);

function hesapla() {
  const fiyat = Number(form.fiyat.value) || 0;
  const pesinat = Math.min(Number(form.pesinat.value) || 0, fiyat);
  const n = Number(form.vade.value);
  const r = (Number(form.faiz.value) || 0) / 100;
  const tutar = fiyat - pesinat;
  if (!tutar || !n || form.faiz.value === "") {
    ["tutar", "taksit", "toplam", "faiz", "oran"].forEach((k) => yaz(k, "—"));
    sonuc.querySelector("[data-plan]").innerHTML = "";
    return;
  }
  const taksit = r === 0 ? tutar / n : (tutar * r * (1 + r) ** n) / ((1 + r) ** n - 1);
  yaz("tutar", tl(tutar));
  yaz("taksit", tl(taksit));
  yaz("toplam", tl(taksit * n));
  yaz("faiz", tl(taksit * n - tutar));
  yaz("oran", fiyat ? `%${((pesinat / fiyat) * 100).toFixed(0)}` : "—");
  let kalan = tutar;
  const satirlar = [];
  for (let ay = 1; ay <= Math.min(12, n); ay++) {
    const faiz = kalan * r;
    const anapara = taksit - faiz;
    kalan -= anapara;
    satirlar.push(`<tr><td>${ay}</td><td>${tl(taksit)}</td><td>${tl(anapara)}</td><td>${tl(faiz)}</td><td>${tl(Math.max(kalan, 0))}</td></tr>`);
  }
  sonuc.querySelector("[data-plan]").innerHTML =
    `<table class="plan"><thead><tr><th>Ay</th><th>Taksit</th><th>Anapara</th><th>Faiz</th><th>Kalan</th></tr></thead><tbody>${satirlar.join("")}</tbody></table>`;
}
form.addEventListener("input", hesapla);
form.addEventListener("submit", (e) => e.preventDefault());
hesapla();

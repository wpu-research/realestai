// Konut kredisi: eşit taksitli (anüite) hesap.
import { t, YEREL } from "./ortak.js";
const form = document.querySelector("[data-kredi]");
const sonuc = document.querySelector("[data-sonuc]");
const tl = (x) => new Intl.NumberFormat(YEREL, { maximumFractionDigits: 0 }).format(Math.round(x)) + " ₺";
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
    `<table class="plan"><thead><tr><th>${t("Ay")}</th><th>${t("Taksit")}</th><th>${t("Anapara")}</th><th>${t("Faiz")}</th><th>${t("Kalan")}</th></tr></thead><tbody>${satirlar.join("")}</tbody></table>`;
}

// Banka oranları (admin girer): girilen tutar ve vadeyle her banka için taksit ve toplam maliyet.
const bankalar = (() => { try { return JSON.parse(document.getElementById("kredi-oranlar")?.textContent || "[]"); } catch { return []; } })();
const tablo = document.querySelector("[data-bankalar] tbody");
const yuzde = (x) => `%${new Intl.NumberFormat(YEREL, { maximumFractionDigits: 2 }).format(x)}`;
const kacir = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const taksitHesapla = (tutar, r, n) => (r === 0 ? tutar / n : (tutar * r * (1 + r) ** n) / ((1 + r) ** n - 1));

function bankalariCiz() {
  if (!tablo) return;
  const fiyat = Number(form.fiyat.value) || 0;
  const tutar = fiyat - Math.min(Number(form.pesinat.value) || 0, fiyat);
  const n = Number(form.vade.value);
  const satirlar = bankalar
    .map((b) => {
      const uygun = n <= b.azami_vade;
      const taksit = tutar && uygun ? taksitHesapla(tutar, b.faiz / 100, n) : null;
      return { ...b, uygun, taksit, maliyet: taksit == null ? null : taksit * n + (tutar * b.tahsis) / 100 };
    })
    .sort((a, b) => (a.maliyet ?? Infinity) - (b.maliyet ?? Infinity) || a.faiz - b.faiz);
  const secili = Number(form.faiz.value);
  tablo.innerHTML = satirlar.map((b) => `<tr data-faiz="${b.faiz}" class="${b.uygun ? "" : "pasif"} ${form.faiz.value !== "" && b.faiz === secili ? "secili" : ""}">
    <td>${kacir(b.banka)}</td><td>${yuzde(b.faiz)}</td>
    <td>${b.uygun ? (b.taksit == null ? "—" : tl(b.taksit)) : t("En fazla {n} ay", { n: b.azami_vade })}</td>
    <td>${b.maliyet == null ? "—" : tl(b.maliyet)}</td>
    <td><button type="button" class="metin-dugme">${t("Kullan")}</button></td></tr>`).join("");
}
tablo?.addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-faiz]");
  if (!tr) return;
  form.faiz.value = tr.dataset.faiz;
  hesapla();
  bankalariCiz();
  document.querySelector("[data-sonuc]").scrollIntoView({ behavior: "smooth", block: "nearest" });
});

form.addEventListener("input", () => { hesapla(); bankalariCiz(); });
form.addEventListener("submit", (e) => e.preventDefault());
hesapla();
bankalariCiz();

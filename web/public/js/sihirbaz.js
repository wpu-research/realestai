// Arama sihirbazı: data/sihirbaz.json'daki soruları tek tek sorar, filtreleri üretir.
import { escape, postJson, t, YEREL } from "./ortak.js";

const kok = document.querySelector("[data-sihirbaz]");
const govde = kok.querySelector("[data-govde]");
const ilerleme = kok.querySelector("[data-ilerleme]");
const geriB = kok.querySelector("[data-geri]");
const atlaB = kok.querySelector("[data-atla]");
const MAHALLELER = JSON.parse(document.getElementById("mahalleler").textContent);

const { adimlar } = await (await fetch("/api/sihirbaz")).json();
const cevap = {};          // adim.id → seçilen değer(ler)
const yol = [];            // gösterilen adım indeksleri (geri için)
let aktif = 0;

const kosulTutar = (k) => !k || Object.entries(k).every(([alan, izin]) => izin.includes(cevap[alan] ?? cevap.tip));
const gorunur = (i) => kosulTutar(adimlar[i].gosterIf);

function filtreler() {
  const f = {};
  for (const a of adimlar) {
    const v = cevap[a.id];
    if (v == null || !kosulTutar(a.gosterIf)) continue;
    if (a.id === "tip") f.tip = v;
    else if (a.id === "tarihler") { if (v.giris) f.giris_tarihi = v.giris; if (v.cikis) f.cikis_tarihi = v.cikis; }
    else if (a.id === "kisi") f.min_kapasite = v;
    else if (a.id === "amac") { if (v === "yatirim") f.siralama = "en_firsat"; }
    else if (a.id === "oda" && v.length) f.oda = v;
    else if (a.id === "butce") { if (v.min) f.min_fiyat = v.min; if (v.max) f.max_fiyat = v.max; f.para_birimi = v.para ?? "TRY"; }
    else if (a.id === "bolge") {
      const m = new Set();
      for (const sec of v.gruplar ?? []) a.secenekler.find((s) => s.deger === sec)?.mahalleler?.forEach((x) => m.add(x));
      (v.secili ?? []).forEach((x) => m.add(x));
      if (m.size) f.mahalleler = [...m];
    } else if (a.tur === "coklu_secim" && a.secenekler.some((s) => s.filtre)) {
      // Seçeneğin taşıdığı filtreler birleşir; özellik listeleri toplanır.
      for (const sec of v) {
        const filtre = a.secenekler.find((s) => s.deger === sec)?.filtre ?? {};
        for (const [k, x] of Object.entries(filtre)) {
          if (k === "ozellik") f.ozellik = [...new Set([...(f.ozellik ?? []), ...x])];
          else f[k] = x;
        }
      }
    } else if (a.tur === "coklu_secim" && a.alan && v.length) f[a.alan] = v;
    else if (a.id === "firsat" && v) f.sadece_firsat = true;
  }
  return f;
}

function sonrakiIndeks(i) {
  for (let j = i + 1; j < adimlar.length; j++) if (gorunur(j)) return j;
  return adimlar.length;
}

function ileri() {
  yol.push(aktif);
  aktif = sonrakiIndeks(aktif);
  ciz();
}

function ciz() {
  const toplam = adimlar.filter((_, i) => gorunur(i)).length;
  const sira = adimlar.slice(0, aktif).filter((_, i) => gorunur(i)).length + 1;
  ilerleme.style.width = `${Math.min(100, ((sira - 1) / toplam) * 100)}%`;
  geriB.hidden = yol.length === 0;
  if (aktif >= adimlar.length) return ozetCiz();
  const a = adimlar[aktif];
  atlaB.hidden = !!a.zorunlu;
  govde.innerHTML = `<div class="adim-sayac">${sira} / ${toplam}</div><h2>${escape(a.soru)}</h2>${a.yardim ? `<p class="kucuk">${escape(a.yardim)}</p>` : ""}<div class="adim-icerik"></div>`;
  const ic = govde.querySelector(".adim-icerik");
  ({ tek_secim: tekSecim, coklu_secim: cokluSecim, tarih_araligi: tarihAraligi, sayac, butce, evet_hayir: evetHayir })[a.tur](a, ic);
  govde.classList.remove("kayar"); void govde.offsetWidth; govde.classList.add("kayar");
}

function kartlar(a, ic, coklu) {
  const secili = new Set(coklu ? (a.id === "bolge" ? cevap.bolge?.gruplar : cevap[a.id]) ?? [] : [cevap[a.id]]);
  const secenekler = a.secenekler.filter((s) => kosulTutar(s.gosterIf));
  ic.innerHTML = `<div class="secim-kartlari">${secenekler.map((s) =>
    `<button type="button" class="secim-karti ${secili.has(s.deger) ? "secili" : ""}" data-deger="${escape(s.deger)}">${escape(s.etiket)}</button>`).join("")}</div>`;
  return ic.querySelectorAll(".secim-karti");
}

function tekSecim(a, ic) {
  kartlar(a, ic, false).forEach((b) => b.addEventListener("click", () => { cevap[a.id] = b.dataset.deger; ileri(); }));
}

function cokluSecim(a, ic) {
  const dugmeler = kartlar(a, ic, true);
  const secili = new Set(a.id === "bolge" ? cevap.bolge?.gruplar ?? [] : cevap[a.id] ?? []);
  let haritaSecili = new Set(cevap.bolge?.secili ?? []);
  const kaydet = () => {
    if (a.id === "bolge") cevap.bolge = { gruplar: [...secili].filter((x) => x !== "@harita"), secili: [...haritaSecili] };
    else cevap[a.id] = [...secili];
  };
  const liste = document.createElement("div");
  liste.className = "mahalle-sec";
  const listeCiz = () => {
    liste.hidden = !secili.has("@harita");
    liste.innerHTML = MAHALLELER.map((m) =>
      `<label class="kutu"><input type="checkbox" value="${m.slug}" ${haritaSecili.has(m.slug) ? "checked" : ""}>${escape(m.ad)}</label>`).join("");
    liste.querySelectorAll("input").forEach((i) => i.addEventListener("change", () => {
      i.checked ? haritaSecili.add(i.value) : haritaSecili.delete(i.value); kaydet();
    }));
  };
  if (a.id === "bolge") { ic.append(liste); listeCiz(); }
  dugmeler.forEach((b) => b.addEventListener("click", () => {
    const d = b.dataset.deger;
    secili.has(d) ? secili.delete(d) : secili.add(d);
    b.classList.toggle("secili");
    kaydet();
    if (a.id === "bolge") listeCiz();
  }));
  devamDugmesi(ic, () => { kaydet(); ileri(); });
}

function tarihAraligi(a, ic) {
  const v = cevap[a.id] ?? {};
  ic.innerHTML = `<div class="iki"><label>${t("Giriş")}<input type="date" name="giris" value="${v.giris ?? ""}"></label>
    <label>${t("Çıkış")}<input type="date" name="cikis" value="${v.cikis ?? ""}"></label></div>`;
  devamDugmesi(ic, () => {
    const giris = ic.querySelector("[name=giris]").value, cikis = ic.querySelector("[name=cikis]").value;
    if (!giris) return alert(t("Lütfen giriş tarihini seçin."));
    cevap[a.id] = { giris, cikis }; ileri();
  });
}

function sayac(a, ic) {
  let v = cevap[a.id] ?? a.varsayilan ?? 1;
  ic.innerHTML = `<div class="sayac"><button type="button" data-d="-1">−</button><output>${v}</output><button type="button" data-d="1">+</button></div>`;
  const out = ic.querySelector("output");
  ic.querySelectorAll("[data-d]").forEach((b) => b.addEventListener("click", () => {
    v = Math.max(a.min ?? 1, Math.min(a.max ?? 20, v + Number(b.dataset.d))); out.textContent = v;
  }));
  devamDugmesi(ic, () => { cevap[a.id] = v; ileri(); });
}

function butce(a, ic) {
  const tip = cevap.tip ?? "satilik";
  const v = cevap[a.id] ?? { para: "TRY" };
  const fmt = (x) => (x >= 1e6 ? `${(x / 1e6).toLocaleString(YEREL)} milyon` : `${(x / 1e3).toLocaleString(YEREL)} bin`);
  const araliklar = a.hazirAraliklar[tip] ?? [];
  ic.innerHTML = `<p class="kucuk">${escape(t("Fiyat {birim} olarak (TL)", { birim: a.birimEtiketi[tip] }))}</p>
    <div class="secim-kartlari">${araliklar.map(([min, max], k) =>
      `<button type="button" class="secim-karti" data-k="${k}">${!min ? `${fmt(max)} altı` : !max ? `${fmt(min)} üstü` : `${fmt(min)} – ${fmt(max)}`}</button>`).join("")}</div>
    <details class="elle"><summary>Kendim yazayım</summary>
      <div class="uc"><label>En az<input type="number" name="min" value="${v.min ?? ""}"></label>
      <label>En çok<input type="number" name="max" value="${v.max ?? ""}"></label>
      <label>Para birimi<select name="para">${["TRY", "EUR", "USD", "GBP"].map((p) => `<option ${v.para === p ? "selected" : ""}>${p}</option>`).join("")}</select></label></div>
    </details>`;
  ic.querySelectorAll("[data-k]").forEach((b) => b.addEventListener("click", () => {
    const [min, max] = araliklar[Number(b.dataset.k)];
    cevap[a.id] = { min: min || undefined, max: max || undefined, para: "TRY" }; ileri();
  }));
  devamDugmesi(ic, () => {
    const min = Number(ic.querySelector("[name=min]").value) || undefined;
    const max = Number(ic.querySelector("[name=max]").value) || undefined;
    if (!min && !max) return alert(t("Bir aralık seçin ya da tutar yazın."));
    cevap[a.id] = { min, max, para: ic.querySelector("[name=para]").value }; ileri();
  });
}

function evetHayir(a, ic) {
  ic.innerHTML = `<div class="secim-kartlari"><button type="button" class="secim-karti" data-v="1">${t("Evet")}</button><button type="button" class="secim-karti" data-v="0">${t("Hayır, hepsini göster")}</button></div>`;
  ic.querySelectorAll("[data-v]").forEach((b) => b.addEventListener("click", () => { cevap[a.id] = b.dataset.v === "1"; ileri(); }));
}

function devamDugmesi(ic, fn) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "dugme tam devam"; b.textContent = t("Devam");
  b.addEventListener("click", fn);
  ic.append(b);
}

async function ozetCiz() {
  atlaB.hidden = true;
  ilerleme.style.width = "100%";
  const f = filtreler();
  const satirlar = adimlar.map((a, i) => [a, i]).filter(([a, i]) => gorunur(i) && cevap[a.id] != null)
    .map(([a, i]) => `<li><button type="button" data-git="${i}"><span>${escape(a.soru)}</span><strong>${escape(ozetMetni(a))}</strong></button></li>`).join("");
  govde.innerHTML = `<h2>${t("Harika, aradığınız ev şöyle:")}</h2><ul class="ozet-liste">${satirlar}</ul><div class="sonuc-sayi">${t("Sayılıyor…")}</div>`;
  govde.querySelectorAll("[data-git]").forEach((b) => b.addEventListener("click", () => { yol.push(aktif); aktif = Number(b.dataset.git); ciz(); }));
  try {
    const { sayi, url } = await postJson("/api/sayim", f);
    postJson("/api/sihirbaz-oturum", { filtreler: f, tamamlandi: true, adim_sayisi: yol.length, sonuc_sayisi: sayi }).catch(() => {});
    const el = govde.querySelector(".sonuc-sayi");
    el.innerHTML = sayi > 0
      ? `<a class="dugme tam buyuk" href="${escape(url)}">${t("{n} ilanı göster", { n: sayi })}</a>`
      : `<p>${t("Bu kriterlerle şu an ilan yok. Bütçeyi ya da bölgeyi değiştirmeyi deneyin.")}</p><a class="dugme ikincil" href="${escape(url)}">${t("Yine de sonuçlara git")}</a>`;
  } catch {
    govde.querySelector(".sonuc-sayi").innerHTML = `<a class="dugme tam" href="/ara">${t("Sonuçlara git")}</a>`;
  }
}

function ozetMetni(a) {
  const v = cevap[a.id];
  const etiket = (d) => a.secenekler?.find((s) => s.deger === d)?.etiket ?? d;
  if (a.tur === "tek_secim") return etiket(v);
  if (a.tur === "coklu_secim") {
    const liste = a.id === "bolge" ? [...(v.gruplar ?? []).map(etiket), ...(v.secili ?? []).map((s) => MAHALLELER.find((m) => m.slug === s)?.ad ?? s)] : v.map(etiket);
    return liste.join(", ") || t("Fark etmez");
  }
  if (a.tur === "tarih_araligi") return `${v.giris ?? "?"} → ${v.cikis ?? "?"}`;
  if (a.tur === "butce") return `${v.min ? v.min.toLocaleString(YEREL) : "0"} – ${v.max ? v.max.toLocaleString(YEREL) : "∞"} ${v.para}`;
  if (a.tur === "evet_hayir") return v ? t("Evet") : t("Hayır");
  return String(v);
}

geriB.addEventListener("click", () => { if (yol.length) { aktif = yol.pop(); ciz(); } });
atlaB.addEventListener("click", () => { delete cevap[adimlar[aktif]?.id]; ileri(); });
postJson("/api/sihirbaz-oturum", { tamamlandi: false }).catch(() => {});
ciz();

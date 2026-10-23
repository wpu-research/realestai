// "Didem'le konuşarak ara": asistan konuşur (sesli okuma), kullanıcı konuşur/yazar/çipe dokunur.
// Avatar katmanı ayrı: şimdilik fotoğraf + tarayıcı sesi; gerçek video avatar aynı arayüzle takılacak.
import { dinle, escape, KonusmaTanima, postJson, soyle, sustur } from "./ortak.js";

const kok = document.querySelector("[data-asistan]");
const avatarEl = kok.querySelector("[data-avatar]");
const altyazi = kok.querySelector("[data-altyazi]");
const secenekEl = kok.querySelector("[data-secenekler]");
const anlasilanEl = kok.querySelector("[data-anlasilan]");
const sohbetEl = kok.querySelector("[data-sohbet]");
const giris = kok.querySelector("[data-giris]");
const girdi = giris.querySelector("input");
const mikrofon = giris.querySelector("[data-mikrofon]");
const basla = kok.querySelector("[data-basla]");

const MAX_TUR = 20;
const KAYIT = "didemOturum";
let durum = { mesajlar: [], filtreler: {}, oturum_id: null, url: null };
try { Object.assign(durum, JSON.parse(sessionStorage.getItem(KAYIT) || "{}")); } catch {}
const kaydet = () => { try { sessionStorage.setItem(KAYIT, JSON.stringify(durum)); } catch {} };

// ---- Avatar arayüzü (FotoAvatar). VideoAvatar aynı iki fonksiyonu sağlayacak. ----
const avatar = {
  konus(metin, bitti) {
    avatarEl.classList.add("konusuyor");
    altyazi.textContent = metin;
    soyle(metin, { bitti: () => { avatarEl.classList.remove("konusuyor"); bitti?.(); } });
  },
  sus() { sustur(); avatarEl.classList.remove("konusuyor"); },
};

let tanima = null;
let sessizlikZamani = null;
function dinlemeyiBaslat() {
  if (!KonusmaTanima || tanima || durum.mesajlar.length >= MAX_TUR * 2) return;
  mikrofon.classList.add("dinliyor");
  clearTimeout(sessizlikZamani);
  sessizlikZamani = setTimeout(() => { tanima?.stop(); altyazi.textContent = "Devam etmek için mikrofona dokunun ya da yazın."; }, 30_000);
  tanima = dinle({
    araSonuc: (m) => (girdi.value = m),
    bitti: (m) => {
      tanima = null; mikrofon.classList.remove("dinliyor"); clearTimeout(sessizlikZamani);
      if (m) gonder(m);
    },
    hata: () => { tanima = null; mikrofon.classList.remove("dinliyor"); },
  });
}

function ciz(yanit) {
  sohbetEl.innerHTML = durum.mesajlar.map((m) => `<div class="balon ${m.rol}">${escape(m.metin)}</div>`).join("");
  sohbetEl.scrollTop = sohbetEl.scrollHeight;
  const etiketler = anlasilanEtiketleri(durum.filtreler);
  anlasilanEl.innerHTML = etiketler.map(([k, e]) => `<button type="button" class="cip anlasilan-cip" data-sil="${k}">${escape(e)} ✕</button>`).join("");
  anlasilanEl.querySelectorAll("[data-sil]").forEach((b) => b.addEventListener("click", () => {
    delete durum.filtreler[b.dataset.sil]; kaydet(); ciz();
  }));
  if (yanit) {
    secenekEl.innerHTML = (yanit.secenekler ?? []).map((s) => `<button type="button" class="cip">${escape(s)}</button>`).join("")
      + (yanit.tamamlandi ? `<a class="dugme" href="${yanit.url}">İlanları göster</a>` : "");
    secenekEl.querySelectorAll("button.cip").forEach((b) => b.addEventListener("click", () => gonder(b.textContent)));
  }
}

function anlasilanEtiketleri(f) {
  const TIP = { satilik: "Satılık", kiralik: "Kiralık", sezonluk: "Sezonluk", gunluk: "Tatil" };
  const e = [];
  if (f.tip) e.push(["tip", TIP[f.tip]]);
  if (f.min_kapasite) e.push(["min_kapasite", `${f.min_kapasite}+ kişi`]);
  if (f.giris_tarihi) e.push(["giris_tarihi", `Giriş ${f.giris_tarihi}`]);
  if (f.max_fiyat) e.push(["max_fiyat", `≤ ${Number(f.max_fiyat).toLocaleString("tr-TR")} ${f.para_birimi ?? "TRY"}`]);
  if (f.min_fiyat) e.push(["min_fiyat", `≥ ${Number(f.min_fiyat).toLocaleString("tr-TR")} ${f.para_birimi ?? "TRY"}`]);
  if (f.mahalleler?.length) e.push(["mahalleler", f.mahalleler.join(", ")]);
  if (f.oda?.length) e.push(["oda", f.oda.join(", ")]);
  if (f.havuz) e.push(["havuz", f.havuz === "ozel" ? "Özel havuz" : "Havuz"]);
  if (f.deniz_manzarasi) e.push(["deniz_manzarasi", "Deniz manzarası"]);
  if (f.max_denize_mesafe_m) e.push(["max_denize_mesafe_m", `Denize ≤ ${f.max_denize_mesafe_m} m`]);
  if (f.sadece_firsat) e.push(["sadece_firsat", "Fırsatlar"]);
  return e;
}

let bekliyor = false;
async function gonder(metin) {
  if (bekliyor) return;
  avatar.sus();
  tanima?.stop();
  if (metin != null) {
    metin = metin.trim();
    if (!metin) return;
    durum.mesajlar.push({ rol: "kullanici", metin });
  }
  girdi.value = "";
  bekliyor = true;
  kok.classList.add("bekliyor");
  ciz();
  try {
    const y = await postJson("/api/asistan", {
      mesajlar: durum.mesajlar, filtreler: durum.filtreler, dil: "tr", oturum_id: durum.oturum_id,
    });
    durum.mesajlar.push({ rol: "asistan", metin: y.cevap });
    durum.filtreler = y.filtreler ?? durum.filtreler;
    durum.oturum_id = y.oturum_id ?? durum.oturum_id;
    durum.url = y.url;
    kaydet();
    ciz(y);
    avatar.konus(y.cevap, () => {
      if (y.tamamlandi) location.href = y.url;
      else dinlemeyiBaslat();
    });
  } catch {
    altyazi.textContent = "Şu an bağlantı kuramıyorum, sihirbazla devam edebilirsiniz.";
    secenekEl.innerHTML = `<a class="dugme" href="/sihirbaz">Sihirbaza geç</a>`;
  } finally {
    bekliyor = false;
    kok.classList.remove("bekliyor");
  }
}

giris.addEventListener("submit", (e) => { e.preventDefault(); gonder(girdi.value); });
mikrofon.hidden = !KonusmaTanima;
mikrofon.addEventListener("click", () => { avatar.sus(); tanima ? tanima.stop() : dinlemeyiBaslat(); });

// Avatar kendiliğinden başlamaz (tarayıcılar da kullanıcı etkileşimi olmadan sesi engeller).
if (durum.mesajlar.length) {
  basla.textContent = "Konuşmaya devam et";
  ciz();
}
basla.addEventListener("click", () => {
  basla.hidden = true;
  giris.hidden = false;
  if (durum.mesajlar.length) {
    const son = durum.mesajlar.at(-1);
    if (son.rol === "asistan") avatar.konus("Kaldığımız yerden devam edelim. " + son.metin, dinlemeyiBaslat);
    else gonder(null);
  } else gonder(null);
});
giris.hidden = true;

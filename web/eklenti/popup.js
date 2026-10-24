import { VARSAYILAN_SUNUCU } from "./ayar.js";
import { cozumle, mahalleBul } from "./cozumle.js";

const $ = (s) => document.querySelector(s);
const form = $("#form");
let ayar = {};
let ham = null;

async function api(yol, govde) {
  const r = await fetch(`${ayar.sunucu}/eklenti-api${yol}`, {
    method: govde ? "POST" : "GET",
    headers: { Authorization: `Bearer ${ayar.anahtar}`, ...(govde ? { "Content-Type": "application/json" } : {}) },
    body: govde ? JSON.stringify(govde) : undefined,
  });
  const veri = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(veri.hata ?? `sunucu ${r.status}`), { durum: r.status });
  return veri;
}

function kurulumGoster(hata = "") {
  $("#ana").hidden = true;
  $("#kurulum").hidden = false;
  $("#sunucu").value = ayar.sunucu || VARSAYILAN_SUNUCU;
  $("#anahtar").value = ayar.anahtar ?? "";
  $("#kurulum-hata").textContent = hata;
}

$("#kaydet-ayar").addEventListener("click", async () => {
  ayar = { sunucu: $("#sunucu").value.trim().replace(/\/+$/, ""), anahtar: $("#anahtar").value.trim() };
  await chrome.storage.local.set(ayar);
  basla();
});
$("#ayar-ac").addEventListener("click", (e) => { e.preventDefault(); kurulumGoster(); });

function doldur(alanlar, yalnizBos = false) {
  for (const [ad, deger] of Object.entries(alanlar)) {
    const el = form.elements[ad];
    if (!el || deger == null || deger === "") continue;
    if (yalnizBos && el.value) continue;
    el.value = String(deger);
  }
}

async function sayfayiOku() {
  const [sekme] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: sekme.id }, func: topla });
    return result;
  } catch {
    // chrome:// sayfaları, PDF görüntüleyici vb. — form elle doldurulur.
    return { url: sekme?.url ?? "", baslik: sekme?.title ?? "", ciftler: [], jsonld: [], metin: "" };
  }
}

async function basla() {
  ayar = await chrome.storage.local.get(["sunucu", "anahtar"]);
  if (!ayar.sunucu) ayar.sunucu = VARSAYILAN_SUNUCU;
  if (!ayar.sunucu || !ayar.anahtar) return kurulumGoster();
  let ben;
  try {
    ben = await api("/ben");
  } catch (e) {
    return kurulumGoster(e.durum === 401 ? "Anahtar geçersiz ya da iptal edilmiş." : `Sunucuya ulaşılamadı: ${e.message}`);
  }
  $("#kurulum").hidden = true;
  $("#ana").hidden = false;
  $("#kim").textContent = ben.ad;
  const secim = form.elements.mahalle_id;
  for (const m of ben.mahalleler) secim.add(new Option(`${m.ad} (${m.ilce})`, m.id));

  ham = await sayfayiOku();
  const a = cozumle(ham);
  a.mahalle_id = mahalleBul([a.konum, a.baslik, a.aciklama], ben.mahalleler);
  doldur(a);
  if (!a.fiyat_birimi) form.elements.fiyat_birimi.value = "toplam";
  if (!ham.ciftler?.length && !ham.metin) $("#durum").textContent = "Bu sayfadan bilgi alınamadı; formu elle doldurun.";
  else if (ham.secili?.length > 40) $("#durum").textContent = "Seçili metin kullanıldı.";

  if (a.kaynak_ilan_no || a.kaynak_url) {
    api("/kontrol", { kaynak: a.kaynak, kaynak_ilan_no: a.kaynak_ilan_no, kaynak_url: a.kaynak_url })
      .then((k) => { if (k.var) $("#durum").innerHTML = `Bu ilan zaten adaylarda (<b>${k.durum_etiket}</b>). Eklerseniz güncellenir. <a href="${ayar.sunucu}${k.yol}" target="_blank">Aç</a>`; })
      .catch(() => {});
  }
}

$("#claude").addEventListener("click", async (e) => {
  const d = e.currentTarget;
  d.disabled = true;
  try {
    const sonuc = await api("/ayikla", { url: form.elements.kaynak_url.value, baslik: form.elements.baslik.value,
      metin: form.elements.aciklama.value || ham?.metin || "" });
    doldur(sonuc.alanlar, true);
    $("#durum").textContent = "Claude boş alanları doldurdu; kontrol edin.";
  } catch (err) {
    $("#durum").textContent = `Claude ile doldurulamadı: ${err.message}`;
  } finally {
    d.disabled = false;
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = $("#gonder");
  d.disabled = true;
  const kutu = $("#sonuc");
  kutu.hidden = false;
  kutu.className = "";
  kutu.textContent = "Gönderiliyor…";
  try {
    const r = await api("/aday", Object.fromEntries(new FormData(form)));
    const yuzde = (x) => (x == null ? "—" : `%${Math.round(Math.abs(x) * 100)}`);
    kutu.innerHTML = `<b>${r.yeni ? "Adaylara eklendi" : "Aday güncellendi"}</b> ${r.firsat ? '<span class="rozet">fırsat</span>' : ""}<br>
      Bölge ortancasına göre: ${r.iskonto == null ? "karşılaştırılamadı" : `${yuzde(r.iskonto)} ${r.iskonto >= 0 ? "altında" : "üstünde"}`}<br>
      Sahibinden olasılığı: ${yuzde(r.sahip_olasiligi)}<br>
      <a href="${ayar.sunucu}${r.yol}" target="_blank">Panelde aç →</a>`;
  } catch (err) {
    kutu.className = "hata";
    kutu.textContent = err.durum === 401 ? "Anahtar geçersiz; Ayarlar'dan yenileyin." : `Eklenemedi: ${err.message}`;
  } finally {
    d.disabled = false;
  }
});

basla();

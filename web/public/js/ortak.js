// Ortak yardımcılar: konuşma tanıma ve sesli okuma (tarayıcının kendi motorları).

export const KonusmaTanima = window.SpeechRecognition || window.webkitSpeechRecognition;

export function dinle({ dil = "tr-TR", araSonuc, bitti, hata }) {
  const r = new KonusmaTanima();
  r.lang = dil;
  r.interimResults = true;
  r.continuous = false;
  let son = "";
  r.onresult = (e) => {
    son = Array.from(e.results).map((x) => x[0].transcript).join(" ");
    araSonuc?.(son, e.results[e.results.length - 1].isFinal);
  };
  r.onerror = (e) => hata?.(e.error);
  r.onend = () => bitti?.(son.trim());
  r.start();
  return r;
}

let sesler = [];
if ("speechSynthesis" in window) {
  const yukle = () => (sesler = speechSynthesis.getVoices());
  yukle();
  speechSynthesis.onvoiceschanged = yukle;
}

export function soyle(metin, { dil = "tr-TR", basladi, bitti } = {}) {
  if (!("speechSynthesis" in window)) { bitti?.(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(metin);
  u.lang = dil;
  const dilSesleri = sesler.filter((v) => v.lang?.toLowerCase().startsWith(dil.slice(0, 2)));
  // Mümkünse kadın sesi (ad üzerinden kaba tahmin), yoksa dilin ilk sesi.
  u.voice = dilSesleri.find((v) => /female|kadın|yelda|seda|filiz|emel/i.test(v.name)) ?? dilSesleri[0] ?? null;
  u.rate = 1.02;
  u.onstart = () => basladi?.();
  u.onend = () => bitti?.();
  u.onerror = () => bitti?.();
  speechSynthesis.speak(u);
}

export function sustur() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

export async function postJson(url, govde) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.hata || `HTTP ${r.status}`);
  return j;
}

export function haritaKur(el, noktalar, { yakin = false } = {}) {
  if (!el || !window.L || !noktalar.length) { if (el) el.hidden = true; return; }
  const harita = L.map(el, { scrollWheelZoom: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18, attribution: "© OpenStreetMap",
  }).addTo(harita);
  const sinir = [];
  for (const n of noktalar) {
    const m = L.marker([n.lat, n.lng]).addTo(harita);
    if (n.no) m.bindPopup(`<a href="/ilan/${n.no}"><strong>${escape(n.baslik)}</strong></a><br>${escape(n.fiyat ?? "")}`);
    else if (n.baslik) m.bindPopup(escape(n.baslik));
    sinir.push([n.lat, n.lng]);
  }
  if (sinir.length === 1 || yakin) harita.setView(sinir[0], 13);
  else harita.fitBounds(sinir, { padding: [30, 30], maxZoom: 13 });
}

export function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

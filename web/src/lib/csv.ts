// Basit CSV okuyucu: tırnaklı alanlar, kaçırılmış tırnak (""), virgül ya da noktalı virgül ayırıcı.
export function csvOku(metin: string): Record<string, string>[] {
  metin = metin.replace(/^﻿/, "");
  const ilkSatir = metin.slice(0, metin.indexOf("\n") >>> 0);
  const ayirici = (ilkSatir.match(/;/g)?.length ?? 0) > (ilkSatir.match(/,/g)?.length ?? 0) ? ";" : ",";
  const satirlar: string[][] = [];
  let alan = "", satir: string[] = [], tirnak = false;
  for (let i = 0; i < metin.length; i++) {
    const ch = metin[i];
    if (tirnak) {
      if (ch === '"' && metin[i + 1] === '"') { alan += '"'; i++; }
      else if (ch === '"') tirnak = false;
      else alan += ch;
    } else if (ch === '"') tirnak = true;
    else if (ch === ayirici) { satir.push(alan); alan = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && metin[i + 1] === "\n") i++;
      satir.push(alan); alan = "";
      if (satir.some((x) => x.trim())) satirlar.push(satir);
      satir = [];
    } else alan += ch;
  }
  satir.push(alan);
  if (satir.some((x) => x.trim())) satirlar.push(satir);
  const [baslik, ...veri] = satirlar;
  if (!baslik) return [];
  const anahtar = baslik.map((b) => b.trim().toLowerCase());
  return veri.map((r) => Object.fromEntries(anahtar.map((k, i) => [k, (r[i] ?? "").trim()])));
}

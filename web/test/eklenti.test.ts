import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
// @ts-expect-error — eklenti düz JS modülü
import { cozumle, fiyatBul, mahalleBul, sayi } from "../eklenti/cozumle.js";
import { zip } from "../src/lib/zip.js";

const MAHALLELER = [
  { id: 1, ad: "Bitez", ilce: "Bodrum" }, { id: 2, ad: "Gümüşlük", ilce: "Bodrum" },
  { id: 3, ad: "Merkez", ilce: "Bodrum" }, { id: 4, ad: "Yalıkavak", ilce: "Bodrum" },
];
const BUGUN = new Date(Date.UTC(2026, 9, 24));

test("sayı ve fiyat ayrıştırma", () => {
  assert.equal(sayi("3.250.000 TL"), 3_250_000);
  assert.equal(sayi("4,5 milyon"), 4_500_000);
  assert.equal(sayi("1.250,50"), 1250.5);
  assert.deepEqual(fiyatBul("Bitez'de 2+1, 120 m2, fiyat 7.500.000 TL"), { fiyat: 7_500_000, para_birimi: "TRY" });
  assert.deepEqual(fiyatBul("Villa 450.000 € pazarlık payı var"), { fiyat: 450_000, para_birimi: "EUR" });
  assert.equal(fiyatBul("2019 yapımı, 120 m2"), null);
});

test("sahibinden.com detay sayfası", () => {
  const a = cozumle({
    url: "https://www.sahibinden.com/ilan/emlak-konut-satilik-bitezde-denize-yakin-2-plus1-1234567890/detay",
    baslik: "BİTEZ'DE DENİZE YAKIN 2+1 SAHİBİNDEN",
    ciftler: [["İlan No", "1234567890"], ["İlan Tarihi", "10 Ağustos 2026"], ["Emlak Tipi", "Satılık Daire"],
      ["m² (Brüt)", "130"], ["m² (Net)", "110"], ["Oda Sayısı", "2+1"], ["Kimden", "Sahibinden"]],
    fiyatMetni: "8.900.000 TL",
    konum: "Muğla / Bodrum / Bitez Mh.",
    metin: "Kendi evimdir, emlakçılar aramasın.",
    jsonld: [],
  }, BUGUN);
  assert.equal(a.kaynak, "sahibinden");
  assert.equal(a.kaynak_ilan_no, "1234567890");
  assert.equal(a.tip, "satilik");
  assert.equal(a.emlak_turu, "daire");
  assert.equal(a.net_m2, 110);
  assert.equal(a.oda, "2+1");
  assert.equal(a.fiyat, 8_900_000);
  assert.equal(a.fiyat_birimi, "toplam");
  assert.equal(a.ilan_veren, "sahibinden");
  assert.equal(a.yayinda_gun, 75);
  assert.equal(mahalleBul([a.konum, a.baslik], MAHALLELER), 1);
});

test("Facebook paylaşımı: seçili metin kullanılır", () => {
  const a = cozumle({
    url: "https://www.facebook.com/groups/bodrumemlak/posts/987",
    baslik: "Bodrum Emlak | Facebook",
    secili: "Gümüşlük'te sezonluk kiralık müstakil ev, 3+1, 140 m2, 6 kişilik. Mayıs-Eylül 900.000 TL. Sahibinden.",
    ciftler: [], jsonld: [], metin: "çok uzun sayfa metni",
  }, BUGUN);
  assert.equal(a.kaynak, "fb_grup");
  assert.equal(a.tip, "sezonluk");
  assert.equal(a.emlak_turu, "mustakil");
  assert.equal(a.fiyat_birimi, "sezon");
  assert.equal(a.yatak_kapasitesi, 6);
  assert.equal(a.fiyat, 900_000);
  assert.match(a.aciklama, /^Gümüşlük/);
  assert.equal(mahalleBul([a.konum, a.baslik, a.aciklama], MAHALLELER), 2);
});

test("'Merkez' tek başına mahalle sayılmaz", () => {
  assert.equal(mahalleBul(["Alışveriş merkezine yakın"], MAHALLELER), null);
  assert.equal(mahalleBul(["Muğla / Bodrum / Bodrum Merkez"], MAHALLELER), 3);
});

test("zip paketi geçerli", () => {
  const d = mkdtempSync(join(tmpdir(), "zip-"));
  const yol = join(d, "a.zip");
  writeFileSync(yol, zip([{ ad: "k/a.txt", veri: Buffer.from("merhaba ".repeat(50)) }, { ad: "k/ş.js", veri: Buffer.from("x") }]));
  const cikti = execFileSync("unzip", ["-t", yol]).toString();
  assert.match(cikti, /No errors detected/);
});

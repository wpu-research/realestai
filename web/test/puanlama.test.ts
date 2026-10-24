import assert from "node:assert/strict";
import { test } from "node:test";
import { birimFiyat, firsatMi, fiyatPuanla, oncelik, sahipOlasiligi, type Gozlem } from "../src/lib/puanlama.js";

let sayac = 0;
const satilik = (fiyat: number, ek: Partial<Gozlem> = {}): Gozlem => ({
  id: String(++sayac), kaynak: "aday", tip: "satilik", mahalle: "Bitez", emlak_turu: "daire", oda: "2+1",
  net_m2: 100, yatak_kapasitesi: null, fiyat, fiyat_birimi: "toplam", ...ek,
});

test("birim fiyat: dört tip", () => {
  assert.equal(birimFiyat(satilik(10_000_000)), 100_000);
  assert.equal(birimFiyat({ ...satilik(40_000), tip: "kiralik", fiyat_birimi: "aylik", net_m2: 80 }), 500);
  assert.equal(birimFiyat({ ...satilik(500_000), tip: "sezonluk", fiyat_birimi: "sezon", net_m2: 100, sezon_ay: 5 }), 1000);
  assert.equal(birimFiyat({ ...satilik(42_000), tip: "gunluk", fiyat_birimi: "haftalik", yatak_kapasitesi: 4, net_m2: null }), 1500);
  assert.equal(birimFiyat({ ...satilik(1), net_m2: null }), null);
});

test("ucuz ilan fırsat olarak işaretlenir, diğerleri değil", () => {
  const grup = [10e6, 10.5e6, 9.8e6, 11e6, 10.2e6, 9.9e6].map((f) => satilik(f));
  const ucuz = satilik(7.5e6);
  const puan = fiyatPuanla([...grup, ucuz]);
  const p = puan.get(ucuz.id)!;
  assert.ok(p.iskonto > 0.2);
  assert.ok(firsatMi(p.iskonto, p.z, 0));
  assert.ok(!firsatMi(p.iskonto, p.z, 1), "kırmızı bayrak fırsatı engeller");
  for (const g of grup) assert.ok(!firsatMi(puan.get(g.id)!.iskonto, puan.get(g.id)!.z, 0));
});

test("küçük grup daha geniş gruba düşer, hiç grup yoksa puan yok", () => {
  const grup = [10e6, 10.5e6, 9.8e6, 11e6].map((f) => satilik(f));
  const tek = satilik(14e6, { oda: "3+1", net_m2: 140 });
  const puan = fiyatPuanla([...grup, tek]);
  assert.equal(puan.get(tek.id)!.grupAdi, "Bitez · daire");
  assert.equal(fiyatPuanla([satilik(1e6), satilik(2e6)]).size, 0);
});

test("günlük kira sezon dışı karşılaştırmaz, kapasiteye göre gruplar", () => {
  const g = (f: number, k: number) => ({ ...satilik(f), tip: "gunluk", fiyat_birimi: "gecelik", yatak_kapasitesi: k, net_m2: null, oda: null });
  const kucuk = [4000, 4200, 3900, 4100, 4050].map((f) => g(f, 4));
  const puan = fiyatPuanla(kucuk);
  assert.equal(puan.get(kucuk[0].id)!.grupAdi, "Bitez · daire · k≤4");
});

test("sahip olasılığı: emlakçı dili düşürür, sahip dili yükseltir", () => {
  const sahip = sahipOlasiligi({ baslik: "Sahibinden 2+1", aciklama: "Kendi evim, emlakçılar aramasın" }, 1);
  const ofis = sahipOlasiligi({ baslik: "Yatırımlık fırsat", aciklama: "Portföyümüzdeki daire, ofisimize bekleriz" }, 6);
  assert.ok(sahip.olasilik > 0.8, String(sahip.olasilik));
  assert.ok(ofis.olasilik < 0.2, String(ofis.olasilik));
  assert.ok(ofis.gerekce.some((x) => x.includes("6 ilanda")));
  assert.ok(sahipOlasiligi({ baslik: "Sahibinden", ilan_veren: "emlakci" }, null).olasilik < 0.1);
});

test("Türkçe büyük harf ve marka adı kelime içinde eşleşmez", () => {
  assert.ok(sahipOlasiligi({ baslik: "PORTFÖYÜMÜZDE", aciklama: "OFİSİMİZE BEKLERİZ" }, null).olasilik < 0.5);
  const kamera = sahipOlasiligi({ baslik: "Kameralı güvenlik" }, null).olasilik;
  const era = sahipOlasiligi({ baslik: "ERA Gayrimenkul" }, null).olasilik;
  assert.ok(kamera > era);
});

test("öncelik: pazarlık sinyali artırır, kırmızı bayrak yarıya indirir", () => {
  const taban = oncelik({ sahip: 0.9, iskonto: 0.2, yayindaGun: 10, fiyatDustu: false, bayrakSayisi: 0 });
  assert.ok(oncelik({ sahip: 0.9, iskonto: 0.2, yayindaGun: 90, fiyatDustu: false, bayrakSayisi: 0 }) > taban);
  assert.ok(Math.abs(oncelik({ sahip: 0.9, iskonto: 0.2, yayindaGun: 10, fiyatDustu: false, bayrakSayisi: 2 }) - taban / 2) < 1e-9);
  assert.ok(oncelik({ sahip: 0.9, iskonto: -0.3, yayindaGun: 0, fiyatDustu: false, bayrakSayisi: 0 }) > 0, "pahalı ilan yine sıralanır");
});

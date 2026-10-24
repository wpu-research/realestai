import assert from "node:assert/strict";
import { test } from "node:test";
import { aramaRehberi, takipMesaji, waNumara, type RehberAday } from "../src/lib/arama-rehberi.js";

const aday: RehberAday = {
  tip: "satilik", kaynak: "sahibinden", mahalle: "Bitez", sahip_adi: "Ahmet Bey", telefon: "0532 111 22 33",
  fiyat: 9_000_000, para_birimi: "TRY", iskonto: 0.18, sahip_olasiligi: 0.4, yayinda_gun: 75, fiyat_dustu: true,
};

test("rehber adayın verisine göre ipucu üretir", () => {
  const r = aramaRehberi(aday, "Didem", "Örnek Emlak Ltd.", "RealEstAi");
  assert.equal(r.length, 6);
  assert.match(r[0].soyle!, /Ahmet Bey.*Didem.*sahibinden\.com'taki Bitez satılık ilanınız/);
  assert.match(r[2].soyle!, /Örnek Emlak Ltd\./);
  const teklif = r[3].maddeler.join(" ");
  assert.match(teklif, /%18 altında/);
  assert.match(teklif, /düşürülmüş/);
  assert.match(teklif, /75 gündür/);
  assert.match(teklif, /emlakçı ilanı olabileceğini/);
  assert.match(r[5].maddeler.join(" "), /EİDS/);
  const gunluk = aramaRehberi({ ...aday, tip: "gunluk", iskonto: null, fiyat_dustu: false, yayinda_gun: 3, sahip_olasiligi: 0.9 }, "Didem", "", "RealEstAi");
  assert.match(gunluk[5].maddeler.join(" "), /turizm|Turizm/);
  assert.deepEqual(gunluk[3].maddeler, ["Bu ilan için özel bir işaret yok; değer önerisini anlatın."]);
});

test("WhatsApp numarası ve mesaj", () => {
  assert.equal(waNumara("0532 111 22 33"), "905321112233");
  assert.equal(waNumara("532-111-2233"), "905321112233");
  assert.equal(waNumara("+90 (532) 111 22 33"), "905321112233");
  assert.equal(waNumara("12"), null);
  assert.equal(waNumara(null), null);
  const m = takipMesaji(aday, "Didem", "RealEstAi", "https://ornek.com");
  assert.match(m, /https:\/\/ornek\.com\/yasal\/kvkk/);
});

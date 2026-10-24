import assert from "node:assert/strict";
import { test } from "node:test";
import { gunOnce, oranlariAyikla } from "../src/lib/kredi-oran.js";

test("kredi oranları: boş satır atlanır, varsayılanlar ve virgül", () => {
  const { oranlar, hatalar } = oranlariAyikla(["Banka A", "", "Banka B"], ["2,79", "", "3.1"], ["", "", "0,25"], ["", "", "180"]);
  assert.deepEqual(hatalar, []);
  assert.deepEqual(oranlar, [
    { banka: "Banka A", faiz: 2.79, tahsis: 0.5, azami_vade: 120 },
    { banka: "Banka B", faiz: 3.1, tahsis: 0.25, azami_vade: 180 },
  ]);
});

test("kredi oranları: hatalı değerler reddedilir", () => {
  const { oranlar, hatalar } = oranlariAyikla(["A", "B", "C", "D"], ["", "2", "2", "2"], ["", "0.6", "", ""], ["", "", "7", "12.5"]);
  assert.equal(oranlar.length, 0);
  assert.equal(hatalar.length, 4);
  assert.match(hatalar[1], /tahsis/);
});

test("güncelleme yaşı", () => {
  assert.equal(gunOnce(null), null);
  assert.equal(gunOnce("2026-10-01T09:00:00Z", new Date("2026-10-24T10:00:00Z")), 23);
});

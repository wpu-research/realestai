import assert from "node:assert/strict";
import { test } from "node:test";
import { aktarimAyikla, kodDuzelt, kodGoster, kodUret } from "../src/lib/aktarim.js";

test("aktarım kodu: üretim, gösterim, elle yazım", () => {
  const k = kodUret();
  assert.match(k, /^[A-HJKMNP-Z2-9]{8}$/);
  assert.equal(kodDuzelt(kodGoster(k).toLowerCase()), k);
  assert.equal(kodDuzelt(" abcd efgh "), "ABCDEFGH");
  assert.equal(kodDuzelt("ABCD-EFG0"), null);    // 0 alfabede yok
  assert.equal(kodDuzelt("ABC"), null);
});

test("aktarım verisi: yalnız site içi aramalar ve geçerli ilan numaraları", () => {
  const v = aktarimAyikla({
    ilanlar: [3, 3, -1, 2.5, "7", 9],
    aramalar: [
      { ad: "Bitez", url: "/ara?mahalle=bitez", tarih: "2026-10-01T00:00:00Z" },
      { ad: "kötü", url: "javascript:alert(1)" },
      { ad: "dış", url: "//kotu.example/x" },
      { ad: "dış2", url: "/\\kotu.example" },
      { ad: "", url: "/ara" },
    ],
  });
  assert.deepEqual(v!.ilanlar, [3, 9]);
  assert.deepEqual(v!.aramalar.map((a) => [a.ad, a.url]), [["Bitez", "/ara?mahalle=bitez"], ["Arama", "/ara"]]);
  assert.equal(aktarimAyikla({ ilanlar: [], aramalar: [{ url: "https://x" }] }), null);
  assert.equal(aktarimAyikla(null), null);
});

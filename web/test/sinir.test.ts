import assert from "node:assert/strict";
import { test } from "node:test";
import { istemciIp, pdfMi, say, sayi, sifirla } from "../src/lib/sinir.js";

test("sayaç pencere içinde artar, sıfırlanır", () => {
  assert.equal(sayi("t1", 1000), 0);
  say("t1", 1000); say("t1", 1000);
  assert.equal(sayi("t1", 1000), 2);
  sifirla("t1");
  assert.equal(sayi("t1", 1000), 0);
});

test("PDF imzası ve IP", () => {
  assert.ok(pdfMi(Buffer.from("%PDF-1.7\n...")));
  assert.ok(!pdfMi(Buffer.from("<html>")));
  assert.equal(istemciIp((h) => (h === "x-forwarded-for" ? "1.2.3.4, 10.0.0.1" : undefined)), "1.2.3.4");
  assert.equal(istemciIp(() => undefined), "yerel");
});

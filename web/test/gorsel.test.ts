import assert from "node:assert/strict";
import { test } from "node:test";
import { kaynakYolu } from "../src/routes/gorsel.js";
import { kucuk } from "../src/views/layout.js";

test("küçük görsel: yalnız izinli yollar", () => {
  assert.ok(kaynakYolu("/img/ilan/demo-1-0.jpg")?.endsWith("public/img/ilan/demo-1-0.jpg"));
  assert.ok(kaynakYolu("/uploads/ilan/abc/def.jpg"));
  assert.equal(kaynakYolu("/uploads/sozlesme/x.pdf"), null);
  assert.equal(kaynakYolu("/uploads/sozlesme/x.jpg"), null);
  assert.equal(kaynakYolu("/img/../../etc/passwd.jpg"), null);
  assert.equal(kaynakYolu("/uploads/ilan/../riza/a.jpg"), null);
  assert.equal(kucuk("/img/a.jpg", 640), "/kucuk/640/img/a.jpg");
  assert.equal(kucuk("https://x.com/a.jpg", 640), "https://x.com/a.jpg");
  assert.equal(kucuk(null, 640), "");
});

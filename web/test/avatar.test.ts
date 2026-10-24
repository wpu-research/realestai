import assert from "node:assert/strict";
import { test } from "node:test";
import { fotoGosterilir, klonSesAcik, rizaGecerli, type AvatarAyar } from "../src/lib/avatar.js";

const temel: AvatarAyar = { mod: "klon", riza_tarihi: "2026-10-24", riza_belgesi: "riza/x.pdf", geri_alindi_at: null, foto: "d.webp", gunluk_karakter: 1000 };

test("rıza yoksa ya da geri alındıysa ses ve fotoğraf kapalı", () => {
  process.env.ELEVENLABS_API_KEY = "x"; process.env.ELEVENLABS_SES_ID = "y";
  assert.ok(rizaGecerli(temel) && fotoGosterilir(temel) && klonSesAcik(temel));
  const geri = { ...temel, geri_alindi_at: "2026-10-25T10:00:00Z" };
  assert.ok(!rizaGecerli(geri) && !fotoGosterilir(geri) && !klonSesAcik(geri));
  const rizasiz = { ...temel, riza_tarihi: null };
  assert.ok(!fotoGosterilir(rizasiz) && !klonSesAcik(rizasiz));
  assert.ok(!klonSesAcik({ ...temel, mod: "tarayici" }));
  delete process.env.ELEVENLABS_SES_ID;
  assert.ok(!klonSesAcik(temel), "anahtar yoksa tarayıcı sesi");
});

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ilkYonetici } from "./auth.js";
import { getCookie, setCookie } from "hono/cookie";
import { DILLER, dilIle, t, type Dil } from "./lib/dil.js";
import { seo } from "./routes/seo.js";
import { UPLOAD_DIZIN } from "./config.js";
import { migrate, sql } from "./db.js";
import { radarPuanla } from "./lib/radar.js";
import { siteAyarYukle } from "./lib/site-ayar.js";
import { admin } from "./routes/admin.js";
import { api } from "./routes/api.js";
import { ara } from "./routes/ara.js";
import { araclar } from "./routes/araclar.js";
import { eklenti } from "./routes/eklenti.js";
import { site } from "./routes/site.js";
import { Sayfa } from "./views/layout.js";

const kok = join(dirname(fileURLToPath(import.meta.url)), "..");
// serveStatic kökü çalışma dizinine göre göreli ister; aynı dizinse boş dize yerine ".".
const gorece = (p: string) => relative(process.cwd(), p) || ".";
await mkdir(UPLOAD_DIZIN, { recursive: true });
const app = new Hono();

app.use("*", secureHeaders({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: undefined }));
// Dil: ?dil=en adresi o dilde açılır ve seçim çereze yazılır (sonraki sayfalar çerezden).
// Her dilin ayrı adresi olduğu için arama motorları dört dili de dizinleyebilir.
app.use("*", async (c, next) => {
  const istenen = c.req.query("dil");
  const u = new URL(c.req.url);
  let d: Dil;
  if (istenen && (DILLER as readonly string[]).includes(istenen)) {
    d = istenen as Dil;
    if (getCookie(c, "dil") !== d) setCookie(c, "dil", d, { path: "/", maxAge: 365 * 86400, sameSite: "Lax" });
  } else {
    const cerez = getCookie(c, "dil");
    d = (DILLER as readonly string[]).includes(cerez ?? "") ? (cerez as Dil) : "tr";
  }
  u.searchParams.delete("dil");
  const kok = `${c.req.header("x-forwarded-proto") ?? u.protocol.replace(":", "")}://${c.req.header("host") ?? u.host}`;
  // Admin paneli Türkçe kalır.
  await dilIle({ dil: c.req.path.startsWith("/admin") ? "tr" : d, kok, yol: u.pathname + u.search }, () => next());
  c.header("Vary", "Cookie", { append: true });
});
app.get("/saglik", async (c) => {
  await sql`select 1`;
  return c.json({ ok: true });
});
app.use("/css/*", serveStatic({ root: gorece(join(kok, "public")) }));
app.use("/js/*", serveStatic({ root: gorece(join(kok, "public")) }));
app.use("/img/*", serveStatic({ root: gorece(join(kok, "public")) }));
app.use("/data/*", serveStatic({ root: gorece(kok) }));
// Yalnız ilan fotoğrafları herkese açık; sözleşmeler admin rotasından verilir.
app.use("/uploads/ilan/*", serveStatic({
  root: gorece(UPLOAD_DIZIN),
  rewriteRequestPath: (p) => p.replace(/^\/uploads/, ""),
}));

app.route("/", seo);
app.route("/api", api);
app.route("/eklenti-api", eklenti);
app.route("/ara", ara);
app.route("/", araclar);
app.route("/admin", admin);
app.route("/", site);

app.notFound((c) =>
  c.html(
    <Sayfa baslik={t("Bulunamadı")} noindex>
      <div class="kap dar bolum"><h1>{t("Sayfa bulunamadı")}</h1><p><a href="/">{t("Ana sayfaya dön")}</a></p></div>
    </Sayfa>,
    404,
  ),
);
app.onError((e, c) => {
  console.error(e);
  if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/eklenti-api/")) return c.json({ hata: "sunucu hatası" }, 500);
  return c.html(
    <Sayfa baslik={t("Bir hata oluştu")} noindex>
      <div class="kap dar bolum"><h1>{t("Bir hata oluştu")}</h1><p>{t("Lütfen biraz sonra tekrar deneyin.")}</p><p><a href="/">{t("Ana sayfaya dön")}</a></p></div>
    </Sayfa>,
    500,
  );
});

await migrate(join(kok, "db", "migrations"));
await ilkYonetici();
await siteAyarYukle();
// KVKK: ilana dönüşmeyen adayların kişisel verisini günde bir temizle.
setInterval(() => sql`select adaylari_temizle()`.catch((e) => console.error("temizlik", e)), 24 * 3600_000);
setInterval(() => sql`delete from oturumlar where bitis < now()`.catch(() => {}), 3600_000);
setInterval(() => sql`delete from aktarimlar where son < now()`.catch(() => {}), 3600_000);
// Radar puanları her gece (yeni gözlemlerle medyanlar değişir).
setInterval(() => radarPuanla().catch((e) => console.error("radar", e)), 24 * 3600_000);

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? "0.0.0.0" }, () => console.log(`dinleniyor :${port}`));

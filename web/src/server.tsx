import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ilkYonetici } from "./auth.js";
import { getCookie, setCookie } from "hono/cookie";
import { DILLER, dilIle, type Dil } from "./lib/dil.js";
import { UPLOAD_DIZIN } from "./config.js";
import { migrate, sql } from "./db.js";
import { radarPuanla } from "./lib/radar.js";
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
// Dil: ?dil=en ile seçilir (çereze yazılır ve parametresiz adrese dönülür), sonra çerezden okunur.
app.use("*", async (c, next) => {
  const istenen = c.req.query("dil");
  if (istenen && (DILLER as readonly string[]).includes(istenen)) {
    setCookie(c, "dil", istenen, { path: "/", maxAge: 365 * 86400, sameSite: "Lax" });
    const u = new URL(c.req.url);
    u.searchParams.delete("dil");
    return c.redirect(u.pathname + u.search);
  }
  const cerez = getCookie(c, "dil");
  const d = (DILLER as readonly string[]).includes(cerez ?? "") ? (cerez as Dil) : "tr";
  // Admin paneli Türkçe kalır.
  return dilIle(c.req.path.startsWith("/admin") ? "tr" : d, () => next());
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

app.route("/api", api);
app.route("/eklenti-api", eklenti);
app.route("/ara", ara);
app.route("/", araclar);
app.route("/admin", admin);
app.route("/", site);

app.notFound((c) =>
  c.html(
    <Sayfa baslik="Bulunamadı">
      <div class="kap dar bolum"><h1>Sayfa bulunamadı</h1><p><a href="/">Ana sayfaya dön</a></p></div>
    </Sayfa>,
    404,
  ),
);
app.onError((e, c) => {
  console.error(e);
  return c.text("Bir hata oluştu, lütfen tekrar deneyin.", 500);
});

await migrate(join(kok, "db", "migrations"));
await ilkYonetici();
// KVKK: ilana dönüşmeyen adayların kişisel verisini günde bir temizle.
setInterval(() => sql`select adaylari_temizle()`.catch((e) => console.error("temizlik", e)), 24 * 3600_000);
setInterval(() => sql`delete from oturumlar where bitis < now()`.catch(() => {}), 3600_000);
// Radar puanları her gece (yeni gözlemlerle medyanlar değişir).
setInterval(() => radarPuanla().catch((e) => console.error("radar", e)), 24 * 3600_000);

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? "0.0.0.0" }, () => console.log(`dinleniyor :${port}`));

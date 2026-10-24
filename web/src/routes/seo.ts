import { Hono } from "hono";
import { sql } from "../db.js";
import { dilAdresi, DILLER, istek } from "../lib/dil.js";
import { REHBER } from "./araclar.js";
import { YASAL } from "./site.js";

// Arama motorları: robots.txt ve dört dilli site haritası.
export const seo = new Hono();

// Railway'in geçici adresi dizinlenmez; alan adı bağlanınca o adres dizinlenir (aynı içerik iki adreste olmasın).
const geciciAdres = (host: string) => /\.up\.railway\.app$|^localhost|^127\./.test(host);

seo.get("/robots.txt", (c) => {
  const host = c.req.header("host") ?? "";
  if (geciciAdres(host)) return c.text("User-agent: *\nDisallow: /\n");
  return c.text([
    "User-agent: *",
    "Disallow: /admin", "Disallow: /api/", "Disallow: /eklenti-api/", "Disallow: /kaydedilenler", "Disallow: /avatar/",
    "",
    `Sitemap: ${istek().kok}/sitemap.xml`,
    "",
  ].join("\n"));
});

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

seo.get("/sitemap.xml", async (c) => {
  const [ilanlar, mahalleler] = await Promise.all([
    // DEMO ilanlar hiçbir zaman site haritasına girmez.
    sql<{ ilan_no: number; updated_at: Date }[]>`select ilan_no, updated_at from ilanlar where durum = 'yayinda' and not demo order by ilan_no`,
    sql<{ slug: string }[]>`select distinct m.slug from mahalleler m join ilanlar i on i.mahalle_id = m.id and i.durum = 'yayinda' and not i.demo order by m.slug`,
  ]);
  const sayfalar: { yol: string; son?: Date; diller?: readonly string[] }[] = [
    { yol: "/" }, { yol: "/ara" },
    ...["satilik", "kiralik", "sezonluk", "gunluk"].map((t) => ({ yol: `/ara?tip=${t}` })),
    ...ilanlar.map((i) => ({ yol: `/ilan/${i.ilan_no}`, son: i.updated_at })),
    ...mahalleler.map((m) => ({ yol: `/mahalle/${m.slug}` })),
    ...["/endeks", "/kredi", "/ekspertiz", "/emlakci-bul", "/evimi-listele", "/sihirbaz", "/asistan"].map((yol) => ({ yol })),
    ...Object.keys(REHBER).map((k) => ({ yol: `/rehber/${k}` })),
    // Yasal metinler yalnız Türkçe.
    ...Object.keys(YASAL).map((k) => ({ yol: `/yasal/${k}`, diller: ["tr"] })),
  ];
  const satirlar = sayfalar.flatMap(({ yol, son, diller = DILLER }) => diller.map((d) => {
    const alternatif = diller.length > 1
      ? diller.map((x) => `<xhtml:link rel="alternate" hreflang="${x}" href="${xml(dilAdresi(x as any, yol))}"/>`).join("")
      : "";
    return `<url><loc>${xml(dilAdresi(d as any, yol))}</loc>${son ? `<lastmod>${son.toISOString().slice(0, 10)}</lastmod>` : ""}${alternatif}</url>`;
  }));
  c.header("Content-Type", "application/xml; charset=utf-8");
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${satirlar.join("\n")}\n</urlset>\n`);
});

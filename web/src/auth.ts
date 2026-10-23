import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Context, Next } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sql } from "./db.js";

const scrypt = promisify(_scrypt) as (s: string, salt: string, n: number) => Promise<Buffer>;
const CEREZ = "oturum";
const SURE_GUN = 14;

export type Kullanici = { id: string; eposta: string; ad: string; rol: "admin" | "ekip" };
export type Ortam = { Variables: { kullanici: Kullanici } };

export async function sifreHashle(sifre: string): Promise<string> {
  const tuz = randomBytes(16).toString("hex");
  return `${tuz}$${(await scrypt(sifre, tuz, 64)).toString("hex")}`;
}

export async function sifreDogru(sifre: string, hash: string): Promise<boolean> {
  const [tuz, ozet] = hash.split("$");
  if (!tuz || !ozet) return false;
  const hesap = await scrypt(sifre, tuz, 64);
  const beklenen = Buffer.from(ozet, "hex");
  return beklenen.length === hesap.length && timingSafeEqual(beklenen, hesap);
}

export async function girisYap(c: Context, eposta: string, sifre: string): Promise<boolean> {
  const [k] = await sql<{ id: string; sifre_hash: string }[]>`
    select id, sifre_hash from kullanicilar where eposta = ${eposta.trim().toLowerCase()} and aktif`;
  if (!k || !(await sifreDogru(sifre, k.sifre_hash))) return false;
  const id = randomBytes(32).toString("hex");
  await sql`insert into oturumlar (id, kullanici_id, bitis)
            values (${id}, ${k.id}, now() + make_interval(days => ${SURE_GUN}))`;
  setCookie(c, CEREZ, id, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "Lax",
    path: "/", maxAge: SURE_GUN * 86400,
  });
  return true;
}

export async function cikisYap(c: Context) {
  const id = getCookie(c, CEREZ);
  if (id) await sql`delete from oturumlar where id = ${id}`;
  deleteCookie(c, CEREZ, { path: "/" });
}

export async function oturumKullanici(c: Context): Promise<Kullanici | null> {
  const id = getCookie(c, CEREZ);
  if (!id) return null;
  const [k] = await sql<Kullanici[]>`
    select k.id, k.eposta, k.ad, k.rol from oturumlar o join kullanicilar k on k.id = o.kullanici_id
    where o.id = ${id} and o.bitis > now() and k.aktif`;
  return k ?? null;
}

// /admin altı: giriş yoksa giriş sayfasına, API ise 401.
export async function ekipGerekli(c: Context<Ortam>, next: Next) {
  const k = await oturumKullanici(c);
  if (!k) {
    if (c.req.path.startsWith("/admin/api")) return c.json({ hata: "giriş gerekli" }, 401);
    return c.redirect(`/admin/giris?don=${encodeURIComponent(c.req.path)}`);
  }
  c.set("kullanici", k);
  await next();
}

// İlk açılışta ADMIN_EPOSTA / ADMIN_SIFRE ile yönetici oluşturur (yoksa).
export async function ilkYonetici() {
  const eposta = process.env.ADMIN_EPOSTA?.trim().toLowerCase();
  const sifre = process.env.ADMIN_SIFRE;
  if (!eposta || !sifre) return;
  const [var_] = await sql`select 1 from kullanicilar where eposta = ${eposta}`;
  if (var_) return;
  await sql`insert into kullanicilar (eposta, ad, sifre_hash, rol)
            values (${eposta}, ${process.env.ADMIN_AD ?? "Yönetici"}, ${await sifreHashle(sifre)}, 'admin')`;
  console.log(`ilk yönetici oluşturuldu: ${eposta}`);
}

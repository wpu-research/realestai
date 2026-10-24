import { Hono } from "hono";
import type { Child } from "hono/jsx";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { ilanCevir } from "../ai/claude.js";
import { fotoEtiketi, ODALAR } from "../ai/nvidia.js";
import { cikisYap, ekipGerekli, girisYap, sifreHashle, type Ortam } from "../auth.js";
import { SITE_ADI, UPLOAD_DIZIN } from "../config.js";
import { sql } from "../db.js";
import { csvOku } from "../lib/csv.js";
import { radarPuanla } from "../lib/radar.js";
import { anahtarUret, eklentiPaketi } from "./eklenti.js";
import {
  AVATAR_DIZIN, avatarAyar, avatarAyarKaydet, klonSesAcik, rizaGecerli, rizayiGeriAl, SesHatasi, sesAnahtarlariVar, sesUret,
} from "../lib/avatar.js";
import { KAYIT_BOLUMLERI, KAYIT_KURALLARI } from "../lib/kayit-metni.js";
import { ESKI_GUN, gunOnce, krediOranlari, krediOranlariKaydet, oranlariAyikla, type KrediOranlari } from "../lib/kredi-oran.js";
import { SIRKET_ZORUNLU, siteAyar, siteAyarKaydet, type SiteAyar } from "../lib/site-ayar.js";
import { CEPHE, ISITMA, KIMDEN, KONUT_TIPLERI, MUTFAK, OZELLIK_ANAHTARLARI, OZELLIK_GRUPLARI, TAPU, YAPI_DURUMU } from "../lib/ozellikler.js";
import {
  ADAY_DURUM_ETIKET, BAYRAK_ETIKET, fiyatMetni, ODA_ETIKET, para, tarih, TIP_ETIKET, TUR_ETIKET, yuzde,
} from "../lib/bicim.js";

export const admin = new Hono<Ortam>();

// ---------- Giriş (oturum gerektirmez) ----------
admin.get("/giris", (c) =>
  c.html(
    <AdminSayfa baslik="Ekip girişi" menu={false}>
      <form method="post" class="form dar giris">
        <h1>{SITE_ADI} · Ekip girişi</h1>
        {c.req.query("hata") && <div class="hata">E-posta veya şifre hatalı.</div>}
        <input name="eposta" type="email" placeholder="E-posta" required autofocus />
        <input name="sifre" type="password" placeholder="Şifre" required />
        <input type="hidden" name="don" value={c.req.query("don") ?? "/admin"} />
        <button class="dugme tam">Giriş</button>
      </form>
    </AdminSayfa>,
  ),
);
admin.post("/giris", async (c) => {
  const b = await c.req.parseBody();
  const don = typeof b.don === "string" && b.don.startsWith("/admin") ? b.don : "/admin";
  return (await girisYap(c, String(b.eposta ?? ""), String(b.sifre ?? "")))
    ? c.redirect(don)
    : c.redirect(`/admin/giris?hata=1&don=${encodeURIComponent(don)}`);
});

admin.use("*", ekipGerekli);

admin.post("/cikis", async (c) => { await cikisYap(c); return c.redirect("/admin/giris"); });
admin.get("/", (c) => c.redirect("/admin/adaylar"));

function AdminSayfa({ baslik, children, menu = true, kullanici, scriptler = [] }:
  { baslik: string; children: Child; menu?: boolean; kullanici?: Ortam["Variables"]["kullanici"]; scriptler?: string[] }) {
  return (
    <html lang="tr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{baslik} · Yönetim</title>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
        <link rel="stylesheet" href="/css/site.css" />
        <link rel="stylesheet" href="/css/admin.css" />
      </head>
      <body class="admin">
        {menu && (
          <header class="admin-ust">
            <a href="/admin" class="logo">{SITE_ADI} <span>Yönetim</span></a>
            <nav>
              <a href="/admin/adaylar">Adaylar</a>
              <a href="/admin/ilanlar">İlanlar</a>
              <a href="/admin/basvurular">Başvurular</a>
              <a href="/admin/talepler">Talepler</a>
              <a href="/admin/olcum">Ölçüm</a>
              <a href="/admin/eklenti">Radar eklentisi</a>
              <a href="/admin/kredi">Kredi oranları</a>
              {kullanici?.rol === "admin" && <a href="/admin/avatar">Avatar</a>}
              {kullanici?.rol === "admin" && <a href="/admin/yayin">Yayına hazırlık</a>}
              {kullanici?.rol === "admin" && <a href="/admin/kullanicilar">Kullanıcılar</a>}
            </nav>
            <form method="post" action="/admin/cikis" class="cikis"><span>{kullanici?.ad}</span><button>Çıkış</button></form>
          </header>
        )}
        <main class="admin-main">{children}</main>
        {scriptler.map((s) => <script type="module" src={s}></script>)}
      </body>
    </html>
  );
}

const s = (b: Record<string, unknown>, k: string) =>
  typeof b[k] === "string" && (b[k] as string).trim() ? (b[k] as string).trim() : null;
const coklu = (b: Record<string, unknown>, k: string) => ([] as unknown[]).concat(b[k] ?? []).filter((x): x is string => typeof x === "string" && !!x);
const n = (b: Record<string, unknown>, k: string) => {
  const v = s(b, k);
  return v == null || !Number.isFinite(Number(v.replace(",", "."))) ? null : Number(v.replace(",", "."));
};

// ================= ADAYLAR =================
const SEKMELER: Record<string, string[]> = {
  aranacak: ["yeni", "aranacak", "geri_aranacak"],
  ilgileniyor: ["ilgileniyor"],
  onaylandi: ["onaylandi"],
  kapanan: ["ulasilamadi", "reddetti", "emlakci_cikti"],
};

admin.get("/adaylar", async (c) => {
  const k = c.get("kullanici");
  const sekme = c.req.query("sekme") && SEKMELER[c.req.query("sekme")!] ? c.req.query("sekme")! : "aranacak";
  const sadeceBen = c.req.query("ben") === "1";
  const [liste, sayilar] = await Promise.all([
    sql`select a.*, m.ad as mahalle, u.ad as atanan_ad,
               (a.geri_arama_at is not null and a.geri_arama_at::date <= (now() at time zone 'Europe/Istanbul')::date) as bugun
        from adaylar a left join mahalleler m on m.id = a.mahalle_id left join kullanicilar u on u.id = a.atanan
        where a.durum::text in ${sql(SEKMELER[sekme])} ${sadeceBen ? sql`and a.atanan = ${k.id}` : sql``}
        order by bugun desc, a.oncelik desc nulls last, a.created_at desc limit 300`,
    sql<{ durum: string; n: number }[]>`select durum::text, count(*)::int as n from adaylar group by durum`,
  ]);
  const sayi = (sk: string) => sayilar.filter((r) => SEKMELER[sk].includes(r.durum)).reduce((t, r) => t + r.n, 0);
  return c.html(
    <AdminSayfa baslik="Adaylar" kullanici={k}>
      <div class="baslik-satir">
        <h1>Adaylar</h1>
        <div class="eylemler">
          <a href={`/admin/adaylar?sekme=${sekme}${sadeceBen ? "" : "&ben=1"}`} class="dugme ikincil">{sadeceBen ? "Herkesinkiler" : "Bana atananlar"}</a>
          <form method="post" action="/admin/adaylar/puanla"><button class="dugme ikincil">Puanları yeniden hesapla</button></form>
          <a href="/admin/aday-yeni" class="dugme">+ Aday ekle</a>
        </div>
      </div>
      <nav class="sekmeler">
        {[["aranacak", "Aranacak"], ["ilgileniyor", "İlgileniyor"], ["onaylandi", "Onaylandı"], ["kapanan", "Kapananlar"]].map(([sk, et]) => (
          <a href={`/admin/adaylar?sekme=${sk}${sadeceBen ? "&ben=1" : ""}`} class={sk === sekme ? "aktif" : ""}>{et} <span class="sayi">{sayi(sk)}</span></a>
        ))}
      </nav>
      <div class="tablo-kap">
        <table class="tablo">
          <thead><tr><th>Tip</th><th>Başlık</th><th>Mahalle</th><th>Fiyat</th><th>Ortancanın altında</th><th>Sahip olasılığı</th><th>Yayında</th><th>Bayrak</th><th>Atanan</th><th>Geri arama</th></tr></thead>
          <tbody>
            {liste.map((a) => (
              <tr class={a.bugun ? "bugun" : ""} onclick={`location='/admin/aday/${a.id}'`}>
                <td data-et="Tip">{TIP_ETIKET[a.tip]}</td>
                <td data-et="Başlık"><a href={`/admin/aday/${a.id}`}>{a.baslik}</a>{a.firsat && <span class="etiket yesil">fırsat</span>}{a.fiyat_dustu && <span class="etiket mavi">fiyat düştü</span>}</td>
                <td data-et="Mahalle">{a.mahalle ?? "—"}</td>
                <td data-et="Fiyat">{a.fiyat ? para(a.fiyat, a.para_birimi) : "—"}</td>
                <td data-et="İskonto" title={a.grup_adi ? `${a.grup_adi} · ${a.grup_buyuklugu} ilan` : "karşılaştırma yok"}>{a.iskonto != null ? (a.iskonto >= 0 ? yuzde(a.iskonto) : `−${yuzde(-a.iskonto)} (üstünde)`) : "—"}</td>
                <td data-et="Sahip">{yuzde(a.sahip_olasiligi)}</td>
                <td data-et="Yayında">{a.yayinda_gun != null ? `${a.yayinda_gun} gün` : "—"}</td>
                <td data-et="Bayrak">{a.kirmizi_bayraklar.map((b: string) => <span class="etiket kirmizi">{BAYRAK_ETIKET[b] ?? b}</span>)}</td>
                <td data-et="Atanan">{a.atanan_ad ?? "—"}</td>
                <td data-et="Geri arama">{a.geri_arama_at ? tarih(a.geri_arama_at) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {liste.length === 0 && <p class="bos">Bu sekmede aday yok.</p>}
      </div>
      <details class="kutu-panel">
        <summary>CSV içe aktar (radar çıktısı)</summary>
        <form method="post" action="/admin/adaylar/csv" enctype="multipart/form-data" class="form">
          <p class="kucuk">Ek sütunlar (puanlama için önerilir): aciklama (ilan metni), ilan_veren (sahibinden/emlakci), sezon_ay.
            iskonto/sahip_olasiligi verilirse ve hesaplanamazsa korunur.</p>
          <p class="kucuk">Sütunlar: kaynak, kaynak_url, kaynak_ilan_no, tip, emlak_turu, baslik, mahalle (slug), net_m2, oda,
            yatak_kapasitesi, fiyat, para_birimi, fiyat_birimi, bolge_medyani, iskonto, sahip_olasiligi, oncelik, yayinda_gun,
            fiyat_dustu, kirmizi_bayraklar (; ile), sahip_adi, telefon. Aynı kaynak + kaynak_ilan_no güncellenir.</p>
          <input type="file" name="dosya" accept=".csv,text/csv" required />
          <button class="dugme">Yükle</button>
        </form>
      </details>
    </AdminSayfa>,
  );
});

admin.post("/adaylar/puanla", async (c) => {
  await radarPuanla();
  return c.redirect("/admin/adaylar");
});

admin.get("/aday-yeni", async (c) => {
  const mh = await sql`select id, ad, ilce from mahalleler order by ilce, ad`;
  return c.html(
    <AdminSayfa baslik="Aday ekle" kullanici={c.get("kullanici")}>
      <h1>Aday ekle</h1>
      <form method="post" class="form dar">
        <label>Kaynak<select name="kaynak">{["tabela", "fb_grup", "tavsiye", "sahibinden", "hepsiemlak", "emlakjet", "diger"].map((k) => <option>{k}</option>)}</select></label>
        <label>Kaynak bağlantısı<input name="kaynak_url" type="url" /></label>
        <label>Tip<select name="tip">{Object.entries(TIP_ETIKET).map(([k, v]) => <option value={k}>{v}</option>)}</select></label>
        <label>Emlak türü<select name="emlak_turu">{Object.entries(TUR_ETIKET).map(([k, v]) => <option value={k}>{v}</option>)}</select></label>
        <label>Başlık<input name="baslik" required /></label>
        <label>Mahalle<select name="mahalle_id"><option value="">—</option>{mh.map((m) => <option value={m.id}>{m.ad} ({m.ilce})</option>)}</select></label>
        <div class="iki"><label>Net m²<input name="net_m2" /></label><label>Oda<input name="oda" placeholder="2+1" /></label></div>
        <div class="iki"><label>Fiyat<input name="fiyat" /></label><label>Kapasite (kişi)<input name="yatak_kapasitesi" /></label></div>
        <div class="iki"><label>Sahip adı<input name="sahip_adi" /></label><label>Telefon<input name="telefon" type="tel" /></label></div>
        <label>Not<textarea name="notlar" rows={3}></textarea></label>
        <button class="dugme">Kaydet</button>
      </form>
    </AdminSayfa>,
  );
});
admin.post("/aday-yeni", async (c) => {
  const b = await c.req.parseBody();
  const [a] = await sql`insert into adaylar (kaynak, kaynak_url, kaynak_ilan_no, tip, emlak_turu, baslik, mahalle_id, net_m2, oda,
      fiyat, yatak_kapasitesi, sahip_adi, telefon, notlar, atanan)
    values (${s(b, "kaynak") ?? "diger"}, ${s(b, "kaynak_url")}, ${randomUUID()}, ${s(b, "tip")}, ${s(b, "emlak_turu")}, ${s(b, "baslik")},
      ${n(b, "mahalle_id")}, ${n(b, "net_m2")}, ${s(b, "oda")}, ${n(b, "fiyat")}, ${n(b, "yatak_kapasitesi")},
      ${s(b, "sahip_adi")}, ${s(b, "telefon")}, ${s(b, "notlar")}, ${c.get("kullanici").id}) returning id`;
  await radarPuanla();
  return c.redirect(`/admin/aday/${a.id}`);
});

admin.post("/adaylar/csv", async (c) => {
  const b = await c.req.parseBody();
  const dosya = b.dosya;
  if (!(dosya instanceof File)) return c.text("dosya gerekli", 400);
  const satirlar = csvOku(await dosya.text());
  const mh = new Map((await sql<{ id: number; slug: string }[]>`select id, slug from mahalleler`).map((m) => [m.slug, m.id]));
  let eklenen = 0;
  const hatalar: string[] = [];
  for (const [i, r] of satirlar.entries()) {
    const num = (k: string) => (r[k] && Number.isFinite(Number(r[k])) ? Number(r[k]) : null);
    try {
      if (!r.kaynak || !r.kaynak_ilan_no || !r.tip || !r.baslik) throw new Error("kaynak, kaynak_ilan_no, tip, baslik zorunlu");
      const kayit = {
        kaynak: r.kaynak, kaynak_url: r.kaynak_url || null, kaynak_ilan_no: r.kaynak_ilan_no, tip: r.tip,
        emlak_turu: r.emlak_turu || null, baslik: r.baslik, mahalle_id: r.mahalle ? mh.get(r.mahalle) ?? null : null,
        net_m2: num("net_m2"), oda: r.oda || null, yatak_kapasitesi: num("yatak_kapasitesi"), fiyat: num("fiyat"),
        para_birimi: r.para_birimi || "TRY", fiyat_birimi: r.fiyat_birimi || null, bolge_medyani: num("bolge_medyani"),
        iskonto: num("iskonto"), sahip_olasiligi: num("sahip_olasiligi"), oncelik: num("oncelik"), yayinda_gun: num("yayinda_gun"),
        fiyat_dustu: ["1", "true", "evet"].includes((r.fiyat_dustu ?? "").toLowerCase()),
        kirmizi_bayraklar: (r.kirmizi_bayraklar ?? "").split(";").map((x) => x.trim()).filter(Boolean),
        sahip_adi: r.sahip_adi || null, telefon: r.telefon || null,
        aciklama: r.aciklama || null, sezon_ay: num("sezon_ay"),
        ilan_veren: ["sahibinden", "emlakci"].includes(r.ilan_veren ?? "") ? r.ilan_veren : null,
        elle_puan: !!(r.iskonto || r.sahip_olasiligi),
      };
      await sql`insert into adaylar ${sql(kayit)}
        on conflict (kaynak, kaynak_ilan_no) do update set
          fiyat = excluded.fiyat, iskonto = excluded.iskonto, bolge_medyani = excluded.bolge_medyani,
          sahip_olasiligi = excluded.sahip_olasiligi, oncelik = excluded.oncelik, yayinda_gun = excluded.yayinda_gun,
          fiyat_dustu = excluded.fiyat_dustu or coalesce(excluded.fiyat < adaylar.fiyat, false),
          kirmizi_bayraklar = excluded.kirmizi_bayraklar, aciklama = coalesce(excluded.aciklama, adaylar.aciklama),
          ilan_veren = coalesce(excluded.ilan_veren, adaylar.ilan_veren), sezon_ay = coalesce(excluded.sezon_ay, adaylar.sezon_ay),
          elle_puan = excluded.elle_puan, updated_at = now()`;
      eklenen++;
    } catch (e) {
      hatalar.push(`satır ${i + 2}: ${e instanceof Error ? e.message : e}`);
    }
  }
  const puan = await radarPuanla();
  return c.html(
    <AdminSayfa baslik="CSV sonucu" kullanici={c.get("kullanici")}>
      <h1>CSV içe aktarma</h1>
      <p>{eklenen} satır eklendi / güncellendi, {hatalar.length} hata.</p>
      <p>Puanlama: {puan.aday} adaydan {puan.puanlanan} tanesi piyasayla karşılaştırıldı, {puan.firsat} fırsat bulundu.</p>
      {hatalar.length > 0 && <ul class="hata-liste">{hatalar.slice(0, 50).map((h) => <li>{h}</li>)}</ul>}
      <a href="/admin/adaylar" class="dugme">Adaylara dön</a>
    </AdminSayfa>,
  );
});

admin.get("/aday/:id", async (c) => {
  const id = c.req.param("id");
  const [a] = await sql`select a.*, m.ad as mahalle, u.ad as atanan_ad from adaylar a
    left join mahalleler m on m.id = a.mahalle_id left join kullanicilar u on u.id = a.atanan where a.id = ${id}`;
  if (!a) return c.notFound();
  const gecmis = await sql`select g.*, u.ad as arayan_ad from arama_gecmisi g left join kullanicilar u on u.id = g.arayan
    where g.aday_id = ${id} order by g.created_at desc`;
  const k = c.get("kullanici");
  return c.html(
    <AdminSayfa baslik={a.baslik} kullanici={k}>
      <a href="/admin/adaylar" class="geri">← Adaylar</a>
      <div class="baslik-satir">
        <h1>{a.baslik}</h1>
        <span class={`durum d-${a.durum}`}>{ADAY_DURUM_ETIKET[a.durum]}</span>
      </div>
      {c.req.query("hata") && <div class="hata">{c.req.query("hata")}</div>}
      <div class="aday-izgara">
        <section class="kutu-panel">
          {a.telefon
            ? <a href={`tel:${a.telefon.replace(/[^\d+]/g, "")}`} class="telefon">📞 {a.telefon}</a>
            : <p class="kucuk">Telefon yok — kaynak ilan üzerinden ulaşın.</p>}
          {a.sahip_adi && <p>Sahip: <strong>{a.sahip_adi}</strong></p>}
          {a.kaynak_url && <p><a href={a.kaynak_url} target="_blank" rel="noopener">Kaynak ilanı aç ({a.kaynak}) ↗</a></p>}
          <dl class="ozellikler">
            <dt>Tip</dt><dd>{TIP_ETIKET[a.tip]}</dd>
            <dt>Mahalle</dt><dd>{a.mahalle ?? "—"}</dd>
            <dt>Fiyat</dt><dd>{a.fiyat ? para(a.fiyat, a.para_birimi) : "—"}</dd>
            <dt>Oda / m²</dt><dd>{a.oda ?? "—"} / {a.net_m2 ?? "—"}</dd>
            <dt>Bölge ortancası</dt><dd>{a.bolge_medyani ? `${para(a.bolge_medyani)} ${({ satilik: "/ m²", kiralik: "/ m² / ay", sezonluk: "/ m² / ay", gunluk: "/ kişi / gece" } as Record<string, string>)[a.tip] ?? ""}` : "—"}</dd>
            <dt>Ortancanın altında</dt><dd>{yuzde(a.iskonto)}</dd>
            <dt>Sahip olasılığı</dt><dd>{yuzde(a.sahip_olasiligi)}</dd>
            <dt>Yayında</dt><dd>{a.yayinda_gun != null ? `${a.yayinda_gun} gün` : "—"}{a.fiyat_dustu ? " · fiyat düştü" : ""}</dd>
            <dt>Atanan</dt><dd>{a.atanan_ad ?? "—"}</dd>
          </dl>
          {a.kirmizi_bayraklar.length > 0 && <p>{a.kirmizi_bayraklar.map((b: string) => <span class="etiket kirmizi">{BAYRAK_ETIKET[b] ?? b}</span>)}</p>}
          {a.puan_gerekce && (
            <div class="gerekce">
              <strong>Neden bu puan?</strong>{a.firsat && <span class="etiket yesil">fırsat</span>}
              <p class="kucuk">Fiyat</p>
              <ul>{(a.puan_gerekce.fiyat ?? []).map((x: string) => <li>{x}</li>)}</ul>
              <p class="kucuk">Sahibinden mi? ({yuzde(a.sahip_olasiligi)})</p>
              <ul>{(a.puan_gerekce.sahip ?? []).map((x: string) => <li>{x}</li>)}</ul>
              <p class="kucuk">Puanlandı: {tarih(a.puanlandi_at)}</p>
            </div>
          )}
          {a.notlar && <p class="not">{a.notlar}</p>}
          <form method="post" action={`/admin/aday/${a.id}/ata`}><button class="dugme ikincil">Bana ata</button></form>
          {a.durum === "onaylandi" && (
            a.ilan_id
              ? <a href={`/admin/ilan/${a.ilan_id}`} class="dugme tam">İlana git →</a>
              : <form method="post" action={`/admin/aday/${a.id}/ilana-cevir`}><button class="dugme tam">İlana dönüştür</button></form>
          )}
        </section>

        <section class="kutu-panel">
          <details open={gecmis.length === 0}>
            <summary><strong>Arama scripti</strong></summary>
            <p class="script">
              "Merhaba, ben {k.ad}, {SITE_ADI}'ndan arıyorum. {a.kaynak}'taki {a.mahalle ?? ""} {TIP_ETIKET[a.tip]?.toLowerCase()} ilanınız
              için arıyorum. Evinizi ücretsiz olarak sitemizde Türkçe, İngilizce, Rusça ve Almanca yayınlayıp yabancı ve yerli
              alıcılara ulaştırabiliriz; size ayrıca bölge fiyat analizi gönderebiliriz. Kişisel verileriniz yalnız bu ilan için
              işlenir; dilediğiniz an silinmesini isteyebilirsiniz. İlgilenir misiniz?"
            </p>
          </details>
          <h3>Arama sonucu</h3>
          <form method="post" action={`/admin/aday/${a.id}/arama`} class="form" data-arama-formu>
            <div class="secim-satir">
              {["ulasilamadi", "geri_aranacak", "ilgileniyor", "onaylandi", "reddetti", "emlakci_cikti"].map((d) => (
                <label class="kutu"><input type="radio" name="sonuc" value={d} required />{ADAY_DURUM_ETIKET[d]}</label>
              ))}
            </div>
            <label class="kutu"><input type="checkbox" name="aydinlatma" value="1" />KVKK aydınlatması yapıldı</label>
            <label>Geri arama zamanı<input type="datetime-local" name="geri_arama_at" /></label>
            <textarea name="not_metni" rows={3} placeholder="Not"></textarea>
            <button class="dugme">Kaydet</button>
            <p class="kucuk">"Onayladı" için KVKK aydınlatması işaretli olmalı.</p>
          </form>
          <h3>Geçmiş</h3>
          <ul class="zaman">
            {gecmis.map((g) => (
              <li><strong>{ADAY_DURUM_ETIKET[g.sonuc]}</strong> · {g.arayan_ad ?? "?"} · {tarih(g.created_at)}
                {g.aydinlatma_yapildi && " · aydınlatma ✓"}{g.not_metni && <div class="not">{g.not_metni}</div>}</li>
            ))}
            {gecmis.length === 0 && <li class="kucuk">Henüz arama yok.</li>}
          </ul>
        </section>
      </div>
    </AdminSayfa>,
  );
});

admin.post("/aday/:id/arama", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.parseBody();
  const sonuc = s(b, "sonuc");
  const aydinlatma = b.aydinlatma === "1";
  if (!sonuc || !ADAY_DURUM_ETIKET[sonuc]) return c.redirect(`/admin/aday/${id}?hata=${encodeURIComponent("Sonuç seçin.")}`);
  if (sonuc === "onaylandi" && !aydinlatma) {
    return c.redirect(`/admin/aday/${id}?hata=${encodeURIComponent("Onay için KVKK aydınlatmasının yapıldığını işaretleyin.")}`);
  }
  await sql.begin(async (tx) => {
    await tx`insert into arama_gecmisi (aday_id, arayan, sonuc, aydinlatma_yapildi, not_metni)
             values (${id}, ${c.get("kullanici").id}, ${sonuc}, ${aydinlatma}, ${s(b, "not_metni")})`;
    const geri = s(b, "geri_arama_at");
    await tx`update adaylar set geri_arama_at = ${sonuc === "geri_aranacak" && geri ? new Date(`${geri}:00+03:00`) : null},
             atanan = coalesce(atanan, ${c.get("kullanici").id}) where id = ${id}`;
  });
  return c.redirect(`/admin/aday/${id}`);
});

admin.post("/aday/:id/ata", async (c) => {
  await sql`update adaylar set atanan = ${c.get("kullanici").id}, updated_at = now() where id = ${c.req.param("id")}`;
  return c.redirect(`/admin/aday/${c.req.param("id")}`);
});

admin.post("/aday/:id/ilana-cevir", async (c) => {
  try {
    const [r] = await sql<{ ilan_id: string }[]>`select adayi_ilana_cevir(${c.req.param("id")}) as ilan_id`;
    return c.redirect(`/admin/ilan/${r.ilan_id}`);
  } catch (e) {
    return c.redirect(`/admin/aday/${c.req.param("id")}?hata=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
});

// ================= İLANLAR =================
admin.get("/ilanlar", async (c) => {
  const durum = c.req.query("durum");
  const liste = await sql`select i.*, m.ad as mahalle, (select count(*)::int from ilan_fotolari f where f.ilan_id = i.id) as foto
    from ilanlar i left join mahalleler m on m.id = i.mahalle_id
    ${durum ? sql`where i.durum = ${durum}` : sql``} order by i.updated_at desc limit 300`;
  return c.html(
    <AdminSayfa baslik="İlanlar" kullanici={c.get("kullanici")}>
      <div class="baslik-satir"><h1>İlanlar</h1></div>
      <nav class="sekmeler">
        {[["", "Tümü"], ["taslak", "Taslak"], ["yayinda", "Yayında"], ["kaldirildi", "Kaldırıldı"]].map(([d, e]) => (
          <a href={`/admin/ilanlar${d ? `?durum=${d}` : ""}`} class={(durum ?? "") === d ? "aktif" : ""}>{e}</a>
        ))}
      </nav>
      <div class="tablo-kap">
        <table class="tablo">
          <thead><tr><th>No</th><th>Durum</th><th>Tip</th><th>Başlık</th><th>Mahalle</th><th>Fiyat</th><th>Foto</th><th>Bayrak</th></tr></thead>
          <tbody>
            {liste.map((i) => (
              <tr onclick={`location='/admin/ilan/${i.id}'`}>
                <td data-et="No">{i.ilan_no}</td>
                <td data-et="Durum"><span class={`durum i-${i.durum}`}>{i.durum}</span>{i.demo && <span class="etiket">DEMO</span>}</td>
                <td data-et="Tip">{TIP_ETIKET[i.tip]}</td>
                <td data-et="Başlık"><a href={`/admin/ilan/${i.id}`}>{i.baslik}</a></td>
                <td data-et="Mahalle">{i.mahalle ?? "—"}</td>
                <td data-et="Fiyat">{fiyatMetni(i as any)}</td>
                <td data-et="Foto">{i.foto}</td>
                <td data-et="Bayrak">{i.kirmizi_bayraklar.length || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminSayfa>,
  );
});

type Kontrol = { ad: string; tamam: boolean };
function yayinKontrol(i: any, fotoSayisi: number): Kontrol[] {
  const k: Kontrol[] = [
    { ad: "Yetki sözleşmesi yüklendi", tamam: !!i.yetki_sozlesmesi_url },
    { ad: "KVKK açık rızası alındı", tamam: !!i.kvkk_riza_at },
  ];
  if (["satilik", "kiralik"].includes(i.tip)) k.push({ ad: "EİDS numarası", tamam: !!i.eids_no });
  if (i.tip === "gunluk" || (i.tip === "sezonluk" && !((i.kira_suresi_gun ?? 0) > 100))) {
    k.push({ ad: "Turizm izin belge numarası", tamam: !!i.turizm_izin_no });
  }
  if (i.kirmizi_bayraklar.length) k.push({ ad: "Kırmızı bayraklar gözden geçirildi", tamam: !!i.bayraklar_incelendi });
  k.push({ ad: "En az 5 fotoğraf", tamam: fotoSayisi >= 5 || i.demo });
  return k;
}

admin.get("/ilan/:id", async (c) => {
  const id = c.req.param("id");
  const [i] = await sql`select * from ilanlar where id = ${id}`;
  if (!i) return c.notFound();
  const [fotolar, mh, derinlikler] = await Promise.all([
    sql`select * from ilan_fotolari where ilan_id = ${id} order by sira`,
    sql`select id, ad, ilce from mahalleler order by ilce, ad`,
    sql`select id, foto_id, dosya_url, onaylandi, kalite from gorsel_3d where ilan_id = ${id} and yontem = 'tek_goruntu_derinlik'`,
  ]);
  const derinlik = new Map(derinlikler.map((d) => [d.foto_id, d]));
  const kontrol = yayinKontrol(i, fotolar.length);
  const hazir = kontrol.every((k) => k.tamam);
  const v = (x: unknown) => (x == null ? "" : String(x));
  const ceviri = (dil: string, alan: string) => v(i.ceviriler?.[dil]?.[alan]);

  return c.html(
    <AdminSayfa baslik={`İlan ${i.ilan_no}`} kullanici={c.get("kullanici")} scriptler={["/js/admin.js", "/js/admin-3d.js"]}>
      <a href="/admin/ilanlar" class="geri">← İlanlar</a>
      <div class="baslik-satir">
        <h1>#{i.ilan_no} · {i.baslik}</h1>
        <span class={`durum i-${i.durum}`}>{i.durum}</span>
        {i.durum === "yayinda" && <a href={`/ilan/${i.ilan_no}`} target="_blank">Sitede gör ↗</a>}
      </div>
      {c.req.query("hata") && <div class="hata">{c.req.query("hata")}</div>}
      {c.req.query("ok") && <div class="basari">Kaydedildi.</div>}
      {i.kirmizi_bayraklar.length > 0 && (
        <div class="hata">Kırmızı bayraklar: {i.kirmizi_bayraklar.map((b: string) => BAYRAK_ETIKET[b] ?? b).join(", ")}</div>
      )}

      <div class="ilan-duzen">
        <div>
          <form method="post" class="form kutu-panel">
            <h2>Bilgiler</h2>
            <div class="iki">
              <label>Tip<select name="tip">{Object.entries(TIP_ETIKET).map(([k, e]) => <option value={k} selected={i.tip === k}>{e}</option>)}</select></label>
              <label>Konut tipi<select name="emlak_turu">{[...KONUT_TIPLERI, { k: "arsa", e: "Arsa" }, { k: "diger", e: "Diğer" }].map((o) => <option value={o.k} selected={i.emlak_turu === o.k}>{o.e}</option>)}</select></label>
            </div>
            <label>Başlık<input name="baslik" value={i.baslik} required /></label>
            <label>Açıklama<textarea name="aciklama" rows={6}>{i.aciklama}</textarea></label>
            <label>Mahalle<select name="mahalle_id"><option value="">—</option>{mh.map((m) => <option value={m.id} selected={i.mahalle_id === m.id}>{m.ad} ({m.ilce})</option>)}</select></label>
            <div class="uc">
              <label>Net m²<input name="net_m2" value={v(i.net_m2)} /></label>
              <label>Brüt m²<input name="brut_m2" value={v(i.brut_m2)} /></label>
              <label>Oda<input name="oda" value={v(i.oda)} placeholder="3+1" /></label>
              <label>Banyo<input name="banyo" value={v(i.banyo)} /></label>
              <label>Kapasite (kişi)<input name="yatak_kapasitesi" value={v(i.yatak_kapasitesi)} /></label>
              <label>Kat<input name="kat" value={v(i.kat)} /></label>
              <label>Bina yaşı<input name="bina_yasi" value={v(i.bina_yasi)} /></label>
              <label>Denize mesafe (m)<input name="denize_mesafe_m" value={v(i.denize_mesafe_m)} /></label>
              <label>Havuz<select name="havuz">{["yok", "ortak", "ozel"].map((h) => <option selected={i.havuz === h}>{h}</option>)}</select></label>
            </div>
            <div class="uc">
              <label>Kat sayısı (bina)<input name="kat_sayisi" value={v(i.kat_sayisi)} /></label>
              {([["isitma", "Isıtma", ISITMA], ["mutfak", "Mutfak", MUTFAK], ["yapi_durumu", "Kullanım durumu", YAPI_DURUMU],
                 ["tapu_durumu", "Tapu durumu", TAPU], ["ilan_veren", "Kimden", KIMDEN]] as const).map(([ad, et, liste]) => (
                <label>{et}<select name={ad}><option value="">—</option>{liste.map((o) => <option value={o.k} selected={i[ad] === o.k}>{o.e}</option>)}</select></label>
              ))}
              <label>Video bağlantısı<input name="video_url" value={v(i.video_url)} placeholder="https://…" /></label>
            </div>
            <div class="secim-satir">
              {[["site_ici", "Site içi"], ["ozel_alan", "Özel alanı var"], ["deniz_manzarasi", "Deniz manzarası"], ["esyali", "Eşyalı"], ["otopark", "Otopark"],
                ["balkon", "Balkon"], ["asansor", "Asansör"], ["evcil_hayvan", "Evcil hayvan kabul"]].map(([k, e]) => (
                <label class="kutu"><input type="checkbox" name={k} value="1" checked={!!i[k]} />{e}</label>
              ))}
            </div>
            <fieldset><legend>Cephe</legend><div class="secim-satir">
              {CEPHE.map((o) => <label class="kutu"><input type="checkbox" name="cephe" value={o.k} checked={i.cephe?.includes(o.k)} />{o.e}</label>)}
            </div></fieldset>
            <fieldset><legend>Kesin konum (boş bırakılırsa mahalle merkezi kullanılır)</legend>
              <div class="iki"><label>Enlem<input name="lat" value={v(i.lat)} placeholder="37.0331" /></label><label>Boylam<input name="lng" value={v(i.lng)} placeholder="27.3870" /></label></div>
            </fieldset>
            {OZELLIK_GRUPLARI.map((g) => (
              <fieldset><legend>{g.baslik}</legend><div class="secim-satir">
                {g.secenekler.map((o) => <label class="kutu"><input type="checkbox" name="ozellikler" value={o.k} checked={i.ozellikler?.includes(o.k)} />{o.e}</label>)}
              </div></fieldset>
            ))}
            <h2>Fiyat</h2>
            <div class="uc">
              <label>Fiyat<input name="fiyat" value={v(i.fiyat)} required /></label>
              <label>Para birimi<select name="para_birimi">{["TRY", "EUR", "USD", "GBP"].map((p) => <option selected={i.para_birimi === p}>{p}</option>)}</select></label>
              <label>Birim<select name="fiyat_birimi">{[["toplam", "Toplam"], ["aylik", "Aylık"], ["sezon", "Sezon"], ["gecelik", "Gecelik"]].map(([k, e]) => <option value={k} selected={i.fiyat_birimi === k}>{e}</option>)}</select></label>
              <label>Komisyon oranı<input name="komisyon_orani" value={v(i.komisyon_orani)} placeholder="0.02" /></label>
              <label>Bölge ortancası<input name="bolge_medyani" value={v(i.bolge_medyani)} /></label>
              <label>İskonto<input name="iskonto" value={v(i.iskonto)} placeholder="0.18" /></label>
            </div>
            {i.tip === "gunluk" && (
              <div class="uc">
                <label>Yüksek sezon / gece<input name="sf_yuksek" value={v(i.sezon_fiyatlari?.yuksek)} /></label>
                <label>Ara sezon / gece<input name="sf_omuz" value={v(i.sezon_fiyatlari?.omuz)} /></label>
                <label>Düşük sezon / gece<input name="sf_dusuk" value={v(i.sezon_fiyatlari?.dusuk)} /></label>
                <label>Minimum gece<input name="min_gece" value={v(i.min_gece)} /></label>
              </div>
            )}
            {i.tip === "sezonluk" && (
              <div class="uc">
                <label>Sezon başı<input type="date" name="sezon_baslangic" value={i.sezon_baslangic ? new Date(i.sezon_baslangic).toISOString().slice(0, 10) : ""} /></label>
                <label>Sezon sonu<input type="date" name="sezon_bitis" value={i.sezon_bitis ? new Date(i.sezon_bitis).toISOString().slice(0, 10) : ""} /></label>
                <label>Kira süresi (gün)<input name="kira_suresi_gun" value={v(i.kira_suresi_gun)} /></label>
              </div>
            )}
            <h2>Belgeler</h2>
            <div class="iki">
              <label>EİDS no<input name="eids_no" value={v(i.eids_no)} /></label>
              <label>Turizm izin belge no<input name="turizm_izin_no" value={v(i.turizm_izin_no)} /></label>
            </div>
            {i.kirmizi_bayraklar.length > 0 && (
              <label class="kutu"><input type="checkbox" name="bayraklar_incelendi" value="1" checked={i.bayraklar_incelendi} />Kırmızı bayrakları gözden geçirdim (ilan metninde açıkça belirtildi)</label>
            )}
            <h2>Çeviriler {i.zeka_guncellendi_at && <span class="etiket">YZ çevirisi — yayından önce kontrol edin</span>}</h2>
            {["en", "ru", "de"].map((dil) => (
              <fieldset class="ceviri"><legend>{dil.toUpperCase()}</legend>
                <input name={`${dil}_baslik`} value={ceviri(dil, "baslik")} placeholder="Başlık" />
                <textarea name={`${dil}_aciklama`} rows={3} placeholder="Açıklama">{ceviri(dil, "aciklama")}</textarea>
              </fieldset>
            ))}
            <button class="dugme">Kaydet</button>
          </form>
        </div>

        <aside>
          <div class="kutu-panel">
            <h2>Yayın kontrol listesi</h2>
            <ul class="kontrol">{kontrol.map((k) => <li class={k.tamam ? "tamam" : "eksik"}>{k.tamam ? "✓" : "✗"} {k.ad}</li>)}</ul>
            {i.durum !== "yayinda"
              ? <form method="post" action={`/admin/ilan/${i.id}/durum`}><input type="hidden" name="durum" value="yayinda" /><button class="dugme tam" disabled={!hazir}>Yayınla</button></form>
              : <form method="post" action={`/admin/ilan/${i.id}/durum`}><input type="hidden" name="durum" value="kaldirildi" /><button class="dugme tam tehlike">Yayından kaldır</button></form>}
          </div>

          <div class="kutu-panel">
            <h2>Yetki sözleşmesi ve rıza</h2>
            {i.yetki_sozlesmesi_url
              ? <p>✓ <a href={`/admin/ilan/${i.id}/sozlesme`} target="_blank">Sözleşmeyi aç</a></p>
              : <p class="kucuk">Henüz yüklenmedi.</p>}
            <form method="post" action={`/admin/ilan/${i.id}/sozlesme`} enctype="multipart/form-data" class="form">
              <input type="file" name="dosya" accept="application/pdf" required />
              <button class="dugme ikincil">Sözleşme yükle (PDF)</button>
            </form>
            <form method="post" action={`/admin/ilan/${i.id}/riza`}>
              {i.kvkk_riza_at
                ? <p>✓ KVKK açık rızası: {tarih(i.kvkk_riza_at)}</p>
                : <button class="dugme ikincil">Sahibin KVKK açık rızası alındı</button>}
            </form>
          </div>

          <div class="kutu-panel">
            <h2>Yapay zekâ</h2>
            <p class="kucuk">Fotoğraflara oda etiketi (NVIDIA), EN/RU/DE çeviri ve kırmızı bayrak tespiti (Claude).</p>
            <button type="button" class="dugme tam" data-zeka={i.id}>Yapay zekâ ile doldur</button>
            <div class="zeka-durum" data-zeka-durum></div>
          </div>

          <div class="kutu-panel">
            <h2>Fotoğraflar ({fotolar.length})</h2>
            <form method="post" action={`/admin/ilan/${i.id}/foto`} enctype="multipart/form-data" class="form">
              <input type="file" name="dosya" accept="image/*" multiple required />
              <button class="dugme ikincil">Yükle</button>
            </form>
            <div class="foto-liste">
              {fotolar.map((f) => (
                <div class="foto">
                  <img src={f.url} alt="" loading="lazy" />
                  <form method="post" action={`/admin/foto/${f.id}`}>
                    <select name="oda_etiketi" onchange="this.form.submit()">
                      <option value="">Etiket yok</option>
                      {ODALAR.map((o) => <option value={o} selected={f.oda_etiketi === o}>{ODA_ETIKET[o]}</option>)}
                    </select>
                    {f.etiket_kaynagi === "yz" && <span class="etiket" title={f.etiket_aciklama ?? ""}>YZ</span>}
                    <input type="number" name="sira" value={f.sira} class="sira" onchange="this.form.submit()" />
                    <button name="sil" value="1" class="metin-dugme" onclick="return confirm('Silinsin mi?')">Sil</button>
                  </form>
                </div>
              ))}
            </div>
          </div>

          <div class="kutu-panel" data-3d={`/admin/ilan/${i.id}/3d`}>
            <h2>Temsili 3D</h2>
            <p class="kucuk">Her fotoğraftan derinlik haritası çıkarılır; sitede fareyle/parmakla oynatılan derinlikli görünüm olur.
              Hesap bu tarayıcıda yapılır (Depth Anything V2 Small, Apache-2.0). Yalnız onayladıklarınız sitede görünür,
              her zaman "Temsili — YZ ile üretildi" uyarısıyla.</p>
            {fotolar.map((f) => <span hidden data-3d-foto={f.id} data-url={f.url} data-var={derinlik.has(f.id) ? "1" : undefined}></span>)}
            <button type="button" class="dugme tam" data-3d-uret disabled={!fotolar.length}>
              Eksik derinlikleri üret ({fotolar.filter((f) => !derinlik.has(f.id)).length})
            </button>
            <div class="zeka-durum" data-3d-durum></div>
            <div class="derinlik-liste">
              {fotolar.filter((f) => derinlik.has(f.id)).map((f) => {
                const d = derinlik.get(f.id)!;
                return (
                  <div class="derinlik">
                    <canvas data-foto={f.url} data-onizle={d.dosya_url}></canvas>
                    {d.kalite?.uyari && <p class="hata-liste">{d.kalite.uyari}</p>}
                    <div class="eylemler">
                      <form method="post" action={`/admin/3d/${d.id}/onay`}>
                        <button class={d.onaylandi ? "dugme ikincil" : "dugme"}>{d.onaylandi ? "Yayından kaldır" : "Onayla"}</button>
                      </form>
                      <form method="post" action={`/admin/3d/${d.id}/sil`}><button class="metin-dugme">Sil</button></form>
                      {d.onaylandi && <span class="etiket yesil">sitede</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </AdminSayfa>,
  );
});

admin.post("/ilan/:id", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.parseBody({ all: true });   // çoklu kutular (cephe, özellikler) dizi gelir
  const [i] = await sql`select ceviriler, tip from ilanlar where id = ${id}`;
  if (!i) return c.notFound();
  const ceviriler = { ...(i.ceviriler ?? {}) };
  for (const dil of ["en", "ru", "de"]) {
    if (s(b, `${dil}_baslik`)) ceviriler[dil] = { baslik: s(b, `${dil}_baslik`), aciklama: s(b, `${dil}_aciklama`) ?? "" };
  }
  const sf = [n(b, "sf_yuksek"), n(b, "sf_omuz"), n(b, "sf_dusuk")];
  try {
    await sql`update ilanlar set
      tip = ${s(b, "tip")}, emlak_turu = ${s(b, "emlak_turu")}, baslik = ${s(b, "baslik")}, aciklama = ${s(b, "aciklama") ?? ""},
      mahalle_id = ${n(b, "mahalle_id")}, net_m2 = ${n(b, "net_m2")}, brut_m2 = ${n(b, "brut_m2")}, oda = ${s(b, "oda")},
      banyo = ${n(b, "banyo")}, yatak_kapasitesi = ${n(b, "yatak_kapasitesi")}, kat = ${n(b, "kat")}, bina_yasi = ${n(b, "bina_yasi")},
      denize_mesafe_m = ${n(b, "denize_mesafe_m")}, havuz = ${s(b, "havuz") ?? "yok"},
      site_ici = ${b.site_ici === "1"}, deniz_manzarasi = ${b.deniz_manzarasi === "1"}, esyali = ${b.esyali === "1"},
      otopark = ${b.otopark === "1"}, evcil_hayvan = ${b.evcil_hayvan === "1"},
      fiyat = ${n(b, "fiyat")}, para_birimi = ${s(b, "para_birimi") ?? "TRY"}, fiyat_birimi = ${s(b, "fiyat_birimi")},
      komisyon_orani = ${n(b, "komisyon_orani")}, bolge_medyani = ${n(b, "bolge_medyani")}, iskonto = ${n(b, "iskonto")},
      sezon_fiyatlari = ${sf.some((x) => x != null) ? sql.json({ yuksek: sf[0], omuz: sf[1], dusuk: sf[2] }) : null},
      min_gece = ${n(b, "min_gece")}, sezon_baslangic = ${s(b, "sezon_baslangic")}, sezon_bitis = ${s(b, "sezon_bitis")},
      kira_suresi_gun = ${n(b, "kira_suresi_gun")}, eids_no = ${s(b, "eids_no")}, turizm_izin_no = ${s(b, "turizm_izin_no")},
      bayraklar_incelendi = ${b.bayraklar_incelendi === "1"}, ceviriler = ${sql.json(ceviriler)},
      kat_sayisi = ${n(b, "kat_sayisi")}, isitma = ${s(b, "isitma")}, mutfak = ${s(b, "mutfak")},
      yapi_durumu = ${s(b, "yapi_durumu")}, tapu_durumu = ${s(b, "tapu_durumu")}, ilan_veren = ${s(b, "ilan_veren") ?? "sahibinden"},
      video_url = ${s(b, "video_url")}, balkon = ${b.balkon === "1"}, asansor = ${b.asansor === "1"}, ozel_alan = ${b.ozel_alan === "1"},
      cephe = ${coklu(b, "cephe")}::text[], ozellikler = ${coklu(b, "ozellikler").filter((x) => OZELLIK_ANAHTARLARI.includes(x))}::text[],
      lat = ${n(b, "lat")}, lng = ${n(b, "lng")}, kesin_konum = ${n(b, "lat") != null && n(b, "lng") != null}
      where id = ${id}`;
    return c.redirect(`/admin/ilan/${id}?ok=1`);
  } catch (e) {
    return c.redirect(`/admin/ilan/${id}?hata=${encodeURIComponent(kisitMesaji(e))}`);
  }
});

// Veritabanı CHECK hatalarını anlaşılır Türkçeye çevir.
function kisitMesaji(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const tablo: Record<string, string> = {
    yayin_icin_yetki: "Yayın için yetki sözleşmesi ve KVKK rızası gerekli.",
    yayin_icin_eids: "Satılık/kiralık ilan için EİDS numarası gerekli.",
    yayin_icin_turizm_izni: "Günlük (ve 100 günden kısa sezonluk) kira için turizm izin belge numarası gerekli.",
    yayin_icin_bayrak_incelemesi: "Kırmızı bayraklar gözden geçirilmeden yayınlanamaz.",
    gunluk_kapasite: "Günlük/sezonluk ilan için kişi kapasitesi gerekli.",
    konut_m2: "Net m² gerekli.",
    ilanlar_fiyat_check: "Fiyat sıfırdan büyük olmalı.",
  };
  for (const [k, v] of Object.entries(tablo)) if (m.includes(k)) return v;
  return m.includes("null value") ? "Zorunlu bir alan boş (tip, tür, başlık, fiyat, birim)." : m;
}

admin.post("/ilan/:id/durum", async (c) => {
  const id = c.req.param("id");
  const durum = (await c.req.parseBody()).durum;
  if (durum === "yayinda") {
    const [i] = await sql`select * from ilanlar where id = ${id}`;
    const [{ n: foto }] = await sql`select count(*)::int as n from ilan_fotolari where ilan_id = ${id}`;
    const eksik = yayinKontrol(i, foto).filter((k) => !k.tamam).map((k) => k.ad);
    if (eksik.length) return c.redirect(`/admin/ilan/${id}?hata=${encodeURIComponent(`Eksik: ${eksik.join(", ")}`)}`);
  }
  try {
    await sql`update ilanlar set durum = ${durum === "yayinda" ? "yayinda" : "kaldirildi"} where id = ${id}`;
    return c.redirect(`/admin/ilan/${id}?ok=1`);
  } catch (e) {
    return c.redirect(`/admin/ilan/${id}?hata=${encodeURIComponent(kisitMesaji(e))}`);
  }
});

admin.post("/ilan/:id/riza", async (c) => {
  await sql`update ilanlar set kvkk_riza_at = coalesce(kvkk_riza_at, now()) where id = ${c.req.param("id")}`;
  return c.redirect(`/admin/ilan/${c.req.param("id")}?ok=1`);
});

admin.post("/ilan/:id/sozlesme", async (c) => {
  const id = c.req.param("id");
  const dosya = (await c.req.parseBody()).dosya;
  if (!(dosya instanceof File) || dosya.type !== "application/pdf" || dosya.size > 20_000_000) {
    return c.redirect(`/admin/ilan/${id}?hata=${encodeURIComponent("PDF seçin (en fazla 20 MB).")}`);
  }
  const dizin = join(UPLOAD_DIZIN, "sozlesme");
  await mkdir(dizin, { recursive: true });
  const ad = `${id}-${Date.now()}.pdf`;
  await writeFile(join(dizin, ad), Buffer.from(await dosya.arrayBuffer()));
  await sql`update ilanlar set yetki_sozlesmesi_url = ${`sozlesme/${ad}`} where id = ${id}`;
  return c.redirect(`/admin/ilan/${id}?ok=1`);
});

// Sözleşmeler herkese açık /uploads altında DEĞİL; yalnız oturumlu ekip indirir.
admin.get("/ilan/:id/sozlesme", async (c) => {
  const [i] = await sql`select yetki_sozlesmesi_url from ilanlar where id = ${c.req.param("id")}`;
  if (!i?.yetki_sozlesmesi_url?.startsWith("sozlesme/")) return c.notFound();
  const veri = await readFile(join(UPLOAD_DIZIN, i.yetki_sozlesmesi_url));
  return c.body(veri, 200, { "Content-Type": "application/pdf" });
});

admin.post("/ilan/:id/foto", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.parseBody({ all: true });
  const dosyalar = ([] as unknown[]).concat(b.dosya ?? []).filter((f): f is File => f instanceof File);
  const dizin = join(UPLOAD_DIZIN, "ilan", id);
  await mkdir(dizin, { recursive: true });
  const [{ m }] = await sql`select coalesce(max(sira), -1)::int as m from ilan_fotolari where ilan_id = ${id}`;
  let sira = m + 1;
  for (const f of dosyalar) {
    if (!f.type.startsWith("image/") || f.size > 25_000_000) continue;
    const ad = `${randomUUID()}.jpg`;
    // EXIF (konum dahil) silinir, en uzun kenar 2000 px.
    const jpeg = await sharp(Buffer.from(await f.arrayBuffer())).rotate()
      .resize(2000, 2000, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    await writeFile(join(dizin, ad), jpeg);
    await sql`insert into ilan_fotolari (ilan_id, url, sira) values (${id}, ${`/uploads/ilan/${id}/${ad}`}, ${sira++})`;
  }
  return c.redirect(`/admin/ilan/${id}?ok=1`);
});

admin.post("/foto/:id", async (c) => {
  const b = await c.req.parseBody();
  const [f] = await sql`select * from ilan_fotolari where id = ${c.req.param("id")}`;
  if (!f) return c.notFound();
  if (b.sil === "1") {
    await sql`delete from ilan_fotolari where id = ${f.id}`;
    if (f.url.startsWith("/uploads/")) await unlink(join(UPLOAD_DIZIN, f.url.slice("/uploads/".length))).catch(() => {});
  } else {
    const etiket = s(b, "oda_etiketi");
    await sql`update ilan_fotolari set sira = ${n(b, "sira") ?? f.sira},
      oda_etiketi = ${etiket}, etiket_kaynagi = ${etiket !== f.oda_etiketi ? (etiket ? "elle" : null) : f.etiket_kaynagi}
      where id = ${f.id}`;
  }
  return c.redirect(`/admin/ilan/${f.ilan_id}`);
});

// Yapay zekâ: istemci "foto" işini kalan 0 olana kadar tekrar çağırır, sonra "ceviri".
admin.post("/api/ilan/:id/zeka", async (c) => {
  const id = c.req.param("id");
  const { is } = await c.req.json<{ is: "foto" | "ceviri" }>();
  try {
    if (is === "foto") {
      const bekleyen = await sql`select id, url from ilan_fotolari where ilan_id = ${id} and etiket_kaynagi is null order by sira`;
      const parti = bekleyen.slice(0, 4);
      const sonuclar = await Promise.allSettled(parti.map(async (f) => {
        const yol = f.url.startsWith("/uploads/") ? join(UPLOAD_DIZIN, f.url.slice("/uploads/".length)) : null;
        const veri = yol ? await readFile(yol) : Buffer.from(await (await fetch(f.url)).arrayBuffer());
        const { oda, aciklama } = await fotoEtiketi(veri);
        await sql`update ilan_fotolari set oda_etiketi = ${oda}, etiket_kaynagi = 'yz', etiket_aciklama = ${aciklama} where id = ${f.id}`;
      }));
      sonuclar.forEach((r, k) => r.status === "rejected" && console.error("foto etiketi", parti[k].id, r.reason));
      const etiketlenen = sonuclar.filter((r) => r.status === "fulfilled").length;
      return c.json({ etiketlenen, hatali: sonuclar.length - etiketlenen, kalan: bekleyen.length - etiketlenen });
    }
    const [i] = await sql`select baslik, aciklama, ceviriler from ilanlar where id = ${id}`;
    const j = await ilanCevir(i.baslik, i.aciklama);
    const ceviriler = { ...(i.ceviriler ?? {}), en: j.en, ru: j.ru, de: j.de };
    await sql`update ilanlar set ceviriler = ${sql.json(ceviriler)}, kirmizi_bayraklar = ${j.kirmizi_bayraklar},
              bayraklar_incelendi = false, zeka_guncellendi_at = now() where id = ${id}`;
    return c.json({ diller: ["en", "ru", "de"], kirmizi_bayraklar: j.kirmizi_bayraklar });
  } catch (e) {
    console.error("zeka", e);
    return c.json({ hata: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ================= BAŞVURULAR / TALEPLER =================
admin.get("/basvurular", async (c) => {
  const liste = await sql`select b.*, m.ad as mahalle from basvurular b left join mahalleler m on m.id = b.mahalle_id order by b.created_at desc limit 300`;
  return c.html(
    <AdminSayfa baslik="Başvurular" kullanici={c.get("kullanici")}>
      <h1>Ev sahibi başvuruları</h1>
      <div class="kartlar-liste">
        {liste.map((b) => (
          <div class="kutu-panel">
            <div class="baslik-satir"><strong>{b.ad_soyad}</strong><span class="durum">{b.durum}</span></div>
            <p><a href={`tel:${b.telefon}`}>{b.telefon}</a>{b.eposta && ` · ${b.eposta}`} · {TIP_ETIKET[b.tip]} · {b.mahalle ?? "—"} · {tarih(b.created_at)}{b.iys_onay && " · İYS ✓"}{b.dil !== "tr" && <> · <span class="etiket mavi">{DIL_ADI[b.dil] ?? b.dil}</span></>}{b.kaynak && ` · kaynak: ${b.kaynak}`}</p>
            {b.mesaj && <p class="not">{b.mesaj}</p>}
            <form method="post" action={`/admin/basvuru/${b.id}`} class="satir-form">
              <select name="durum">{["yeni", "arandi", "ilgileniyor", "sozlesme", "yayinda", "reddetti"].map((d) => <option selected={b.durum === d}>{d}</option>)}</select>
              <input name="notlar" value={b.notlar ?? ""} placeholder="Not" />
              <button class="dugme ikincil">Kaydet</button>
              <button name="adaya" value="1" class="dugme">Adaya dönüştür</button>
            </form>
          </div>
        ))}
        {liste.length === 0 && <p class="bos">Henüz başvuru yok.</p>}
      </div>
    </AdminSayfa>,
  );
});

admin.post("/basvuru/:id", async (c) => {
  const b = await c.req.parseBody();
  const id = c.req.param("id");
  if (b.adaya === "1") {
    const [r] = await sql`select * from basvurular where id = ${id}`;
    const [a] = await sql`insert into adaylar (kaynak, kaynak_ilan_no, tip, emlak_turu, baslik, mahalle_id, sahip_adi, telefon, notlar, atanan)
      values ('form', ${r.id}, ${r.tip}, ${r.emlak_turu}, ${`${r.ad_soyad} — başvuru`}, ${r.mahalle_id}, ${r.ad_soyad}, ${r.telefon},
              ${r.mesaj}, ${c.get("kullanici").id})
      on conflict (kaynak, kaynak_ilan_no) do update set updated_at = now() returning id`;
    await sql`update basvurular set durum = 'arandi' where id = ${id} and durum = 'yeni'`;
    return c.redirect(`/admin/aday/${a.id}`);
  }
  await sql`update basvurular set durum = ${s(b, "durum") ?? "yeni"}, notlar = ${s(b, "notlar")} where id = ${id}`;
  return c.redirect("/admin/basvurular");
});

admin.get("/talepler", async (c) => {
  const liste = await sql`select t.*, i.ilan_no, i.baslik from talepler t left join ilanlar i on i.id = t.ilan_id order by t.created_at desc limit 300`;
  return c.html(
    <AdminSayfa baslik="Talepler" kullanici={c.get("kullanici")}>
      <h1>Alıcı / kiracı talepleri</h1>
      <div class="kartlar-liste">
        {liste.map((t) => (
          <div class="kutu-panel">
            <div class="baslik-satir"><strong>{t.ad_soyad}</strong><span class="durum">{t.durum}</span></div>
            <p>{t.telefon && <a href={`tel:${t.telefon}`}>{t.telefon}</a>}{t.eposta && ` · ${t.eposta}`} · {tarih(t.created_at)}{t.dil !== "tr" && <> · <span class="etiket mavi">{DIL_ADI[t.dil] ?? t.dil}</span></>}{t.kaynak && ` · kaynak: ${t.kaynak}`}</p>
            {t.ilan_no && <p>İlan: <a href={`/ilan/${t.ilan_no}`} target="_blank">#{t.ilan_no} {t.baslik}</a></p>}
            {t.konu === "emlakci_bul" && <p><span class="etiket mavi">Bana emlakçı bul</span> {[t.ayrinti?.istek, t.ayrinti?.bolge, t.ayrinti?.butce, t.ayrinti?.zaman].filter(Boolean).join(" · ")}</p>}
            {t.konu === "ekspertiz" && <p><span class="etiket mavi">Ekspertiz</span> {[t.ayrinti?.amac, t.ayrinti?.mahalle, t.ayrinti?.tur, t.ayrinti?.m2 && `${t.ayrinti.m2} m²`].filter(Boolean).join(" · ")}</p>}
            {t.giris_tarihi && <p>{new Date(t.giris_tarihi).toLocaleDateString("tr-TR")} – {t.cikis_tarihi ? new Date(t.cikis_tarihi).toLocaleDateString("tr-TR") : "?"} · {t.kisi_sayisi ?? "?"} kişi</p>}
            {t.mesaj && <p class="not">{t.mesaj}</p>}
            <form method="post" action={`/admin/talep/${t.id}`} class="satir-form">
              <select name="durum">{["yeni", "donuldu", "gosterim", "teklif", "kapandi"].map((d) => <option selected={t.durum === d}>{d}</option>)}</select>
              <button class="dugme ikincil">Kaydet</button>
            </form>
          </div>
        ))}
        {liste.length === 0 && <p class="bos">Henüz talep yok.</p>}
      </div>
    </AdminSayfa>,
  );
});
admin.post("/talep/:id", async (c) => {
  const b = await c.req.parseBody();
  await sql`update talepler set durum = ${s(b, "durum") ?? "yeni"} where id = ${c.req.param("id")}`;
  return c.redirect("/admin/talepler");
});

// ================= ÖLÇÜM =================
const DONEMLER: Record<string, [string, string]> = { "30": ["Son 30 gün", "30 days"], "90": ["Son 90 gün", "90 days"], tumu: ["Tümü", "100 years"] };
const oran = (pay: number, payda: number) => (payda ? `%${Math.round((pay / payda) * 100)}` : "—");

admin.get("/olcum", async (c) => {
  const donem = DONEMLER[c.req.query("donem") ?? ""] ? c.req.query("donem")! : "30";
  const aralik = DONEMLER[donem][1];
  const [aramalar, oturumlar, [huni], basvuru, kanallar, ekip] = await Promise.all([
    sql`select metin, filtreler, created_at from sesli_arama_kayitlari order by created_at desc limit 200`,
    sql<{ kanal: string; toplam: number; biten: number; ort_adim: number }[]>`
      select kanal, count(*)::int as toplam, count(*) filter (where tamamlandi)::int as biten,
             round(avg(adim_sayisi), 1)::float as ort_adim
      from asistan_oturumlari where created_at > now() - ${aralik}::interval group by kanal`,
    // Sahip hunisi: dönemde eklenen adaylar ne kadar ilerledi (durum elle de değişebildiği için güncel durum da sayılır).
    sql`with g as (select aday_id, array_agg(sonuc) as s from arama_gecmisi group by aday_id)
      select count(*)::int as aday,
        count(*) filter (where g.s is not null or a.durum not in ('yeni', 'aranacak'))::int as aranan,
        count(*) filter (where g.s && array['geri_aranacak','ilgileniyor','onaylandi','reddetti','emlakci_cikti']::aday_durum[]
                          or a.durum in ('geri_aranacak','ilgileniyor','onaylandi','reddetti','emlakci_cikti'))::int as ulasilan,
        count(*) filter (where g.s && array['ilgileniyor','onaylandi']::aday_durum[] or a.durum in ('ilgileniyor','onaylandi'))::int as ilgilenen,
        count(*) filter (where 'onaylandi' = any(g.s) or a.durum = 'onaylandi' or a.ilan_id is not null)::int as onaylayan,
        count(*) filter (where i.yayinlandi_at is not null)::int as yayinlanan,
        count(*) filter (where a.durum = 'emlakci_cikti')::int as emlakci
      from adaylar a left join g on g.aday_id = a.id left join ilanlar i on i.id = a.ilan_id
      where a.created_at > now() - ${aralik}::interval`,
    sql<{ durum: string; adet: number }[]>`select durum, count(*)::int as adet from basvurular
      where created_at > now() - ${aralik}::interval group by durum`,
    // Kanal: reklam testi için talep ve başvuruların kaynağı; "ilerleyen" = gösterim/teklif/kapanış ya da sözleşme/yayın.
    sql<{ kaynak: string; kampanya: string; talep: number; basvuru: number; ilerleyen: number }[]>`
      with t as (
        select coalesce(kaynak, 'bilinmiyor') as kaynak, coalesce(kampanya, '') as kampanya, 1 as talep, 0 as basvuru,
               (durum in ('gosterim','teklif','kapandi'))::int as ilerleyen from talepler where created_at > now() - ${aralik}::interval
        union all
        select coalesce(kaynak, 'bilinmiyor'), coalesce(kampanya, ''), 0, 1, (durum in ('sozlesme','yayinda'))::int
        from basvurular where created_at > now() - ${aralik}::interval)
      select kaynak, kampanya, sum(talep)::int as talep, sum(basvuru)::int as basvuru, sum(ilerleyen)::int as ilerleyen
      from t group by kaynak, kampanya order by sum(talep) + sum(basvuru) desc`,
    sql<{ ad: string; arama: number; ulasilan: number; onay: number }[]>`
      select k.ad, count(*)::int as arama,
        count(*) filter (where g.sonuc not in ('ulasilamadi','aranacak','yeni'))::int as ulasilan,
        count(*) filter (where g.sonuc = 'onaylandi')::int as onay
      from arama_gecmisi g join kullanicilar k on k.id = g.arayan
      where g.created_at > now() - ${aralik}::interval group by k.ad order by arama desc`,
  ]);
  const adimlar: [string, number][] = [
    ["Radara eklenen aday", huni.aday], ["Arandı", huni.aranan], ["Ulaşıldı", huni.ulasilan],
    ["İlgilendi", huni.ilgilenen], ["Onayladı (yetki + KVKK)", huni.onaylayan], ["Yayına çıktı", huni.yayinlanan],
  ];
  const basvuruAdet = (d: string) => basvuru.find((x) => x.durum === d)?.adet ?? 0;
  const basvuruToplam = basvuru.reduce((t, x) => t + x.adet, 0);
  return c.html(
    <AdminSayfa baslik="Ölçüm" kullanici={c.get("kullanici")}>
      <h1>Ölçüm</h1>
      <nav class="sekmeler">
        {Object.entries(DONEMLER).map(([k, [et]]) => <a href={`/admin/olcum?donem=${k}`} class={k === donem ? "aktif" : ""}>{et}</a>)}
      </nav>

      <h2>Sahip hunisi</h2>
      <p class="kucuk">Bu dönemde radara eklenen adayların bugüne kadar nereye ilerlediği. Plan hedefi: ulaşılanların en az %10'u onaylasın.</p>
      <div class="tablo-kap"><table class="tablo huni">
        <thead><tr><th>Adım</th><th>Adet</th><th>Bir önceki adıma göre</th><th>Adaylara göre</th></tr></thead>
        <tbody>{adimlar.map(([ad, n], k) => (
          <tr><td>{ad}</td><td><strong>{n}</strong></td><td>{k ? oran(n, adimlar[k - 1][1]) : ""}</td><td>{k ? oran(n, huni.aday) : ""}</td></tr>
        ))}</tbody>
      </table></div>
      <p class="kucuk">
        Onay oranı (ulaşılanlara göre): <strong>{oran(huni.onaylayan, huni.ulasilan)}</strong> ·
        Emlakçı çıkan: {huni.emlakci} ({oran(huni.emlakci, huni.ulasilan)} — yüksekse radarın "sahibinden" tahmini gözden geçirilmeli)
      </p>

      <h2>Evini listelemek isteyen başvurular</h2>
      <p class="kucuk">
        {basvuruToplam} başvuru · arandı {basvuruAdet("arandi")} · ilgileniyor {basvuruAdet("ilgileniyor")} · sözleşme {basvuruAdet("sozlesme")} ·
        yayında {basvuruAdet("yayinda")} · reddetti {basvuruAdet("reddetti")} · bekleyen {basvuruAdet("yeni")}
      </p>

      <h2>Kanallar</h2>
      <p class="kucuk">
        Talep ve başvuruların nereden geldiği. Reklam bağlantılarına <code>?utm_source=instagram&amp;utm_campaign=bitez-ekim</code> gibi ekler koyun;
        reklam harcamasını talep sayısına bölerek talep başı maliyeti bulun. "dogrudan": adresi yazarak gelen; "bilinmiyor": bu ölçüm başlamadan önceki kayıtlar.
      </p>
      <div class="tablo-kap"><table class="tablo">
        <thead><tr><th>Kaynak</th><th>Kampanya</th><th>Talep</th><th>Başvuru</th><th>İlerleyen</th></tr></thead>
        <tbody>{kanallar.length ? kanallar.map((k) => (
          <tr><td>{k.kaynak}</td><td>{k.kampanya || "—"}</td><td>{k.talep}</td><td>{k.basvuru}</td><td>{k.ilerleyen} ({oran(k.ilerleyen, k.talep + k.basvuru)})</td></tr>
        )) : <tr><td colspan={5}>Bu dönemde talep ya da başvuru yok.</td></tr>}</tbody>
      </table></div>

      <h2>Ekip aramaları</h2>
      <div class="tablo-kap"><table class="tablo">
        <thead><tr><th>Arayan</th><th>Arama</th><th>Ulaşılan</th><th>Onay</th></tr></thead>
        <tbody>{ekip.length ? ekip.map((e) => (
          <tr><td>{e.ad}</td><td>{e.arama}</td><td>{e.ulasilan} ({oran(e.ulasilan, e.arama)})</td><td>{e.onay}</td></tr>
        )) : <tr><td colspan={4}>Bu dönemde kayıtlı arama yok.</td></tr>}</tbody>
      </table></div>

      <h2>Asistan ve sihirbaz</h2>
      <div class="kartlar-liste yatay">
        {oturumlar.length ? oturumlar.map((o) => (
          <div class="kutu-panel"><strong>{o.kanal === "avatar" ? "Didem asistanı" : "Sihirbaz"}</strong>
            <p>{o.toplam} başladı · {o.biten} bitirdi · ortalama {o.ort_adim} adım</p></div>
        )) : <p class="kucuk">Bu dönemde oturum yok.</p>}
      </div>
      <h2>Son sesli / yazılı aramalar</h2>
      <div class="tablo-kap">
        <table class="tablo">
          <thead><tr><th>Zaman</th><th>Metin</th><th>Çıkarılan filtreler</th></tr></thead>
          <tbody>{aramalar.map((a) => <tr><td>{tarih(a.created_at)}</td><td>{a.metin}</td><td><code>{JSON.stringify(a.filtreler)}</code></td></tr>)}</tbody>
        </table>
      </div>
    </AdminSayfa>,
  );
});

// ================= KULLANICILAR (yalnız admin) =================
admin.get("/kullanicilar", async (c) => {
  if (c.get("kullanici").rol !== "admin") return c.text("Yetkiniz yok", 403);
  const liste = await sql`select id, eposta, ad, rol, aktif, created_at from kullanicilar order by created_at`;
  return c.html(
    <AdminSayfa baslik="Kullanıcılar" kullanici={c.get("kullanici")}>
      <h1>Kullanıcılar</h1>
      <div class="tablo-kap">
        <table class="tablo">
          <thead><tr><th>Ad</th><th>E-posta</th><th>Rol</th><th>Durum</th><th></th></tr></thead>
          <tbody>{liste.map((u) => (
            <tr><td>{u.ad}</td><td>{u.eposta}</td><td>{u.rol}</td><td>{u.aktif ? "aktif" : "pasif"}</td>
              <td>{u.id !== c.get("kullanici").id && (
                <form method="post" action={`/admin/kullanici/${u.id}/aktif`}><button class="metin-dugme">{u.aktif ? "Pasifleştir" : "Aktifleştir"}</button></form>
              )}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <h2>Yeni kullanıcı</h2>
      <form method="post" action="/admin/kullanicilar" class="form dar">
        <input name="ad" placeholder="Ad" required />
        <input name="eposta" type="email" placeholder="E-posta" required />
        <input name="sifre" type="password" placeholder="Geçici şifre (en az 10 karakter)" minlength={10} required />
        <select name="rol"><option value="ekip">ekip</option><option value="admin">admin</option></select>
        <button class="dugme">Ekle</button>
      </form>
    </AdminSayfa>,
  );
});
admin.post("/kullanicilar", async (c) => {
  if (c.get("kullanici").rol !== "admin") return c.text("Yetkiniz yok", 403);
  const b = await c.req.parseBody();
  const sifre = s(b, "sifre") ?? "";
  if (sifre.length < 10) return c.text("Şifre en az 10 karakter olmalı", 400);
  await sql`insert into kullanicilar (ad, eposta, sifre_hash, rol)
            values (${s(b, "ad")}, ${(s(b, "eposta") ?? "").toLowerCase()}, ${await sifreHashle(sifre)}, ${s(b, "rol") === "admin" ? "admin" : "ekip"})
            on conflict (eposta) do nothing`;
  return c.redirect("/admin/kullanicilar");
});
admin.post("/kullanici/:id/aktif", async (c) => {
  if (c.get("kullanici").rol !== "admin") return c.text("Yetkiniz yok", 403);
  await sql`update kullanicilar set aktif = not aktif where id = ${c.req.param("id")}`;
  await sql`delete from oturumlar where kullanici_id = ${c.req.param("id")}`;
  return c.redirect("/admin/kullanicilar");
});

// ================= RADAR EKLENTİSİ =================
admin.get("/eklenti", async (c) => {
  const k = c.get("kullanici");
  const anahtarlar = await sql`select a.id, a.ad, a.son_kullanim, a.created_at, u.ad as kullanici from eklenti_anahtarlari a
    join kullanicilar u on u.id = a.kullanici_id where a.iptal_at is null ${k.rol === "admin" ? sql`` : sql`and a.kullanici_id = ${k.id}`}
    order by a.created_at desc`;
  return c.html(
    <AdminSayfa baslik="Radar eklentisi" kullanici={k}>
      <h1>Radar eklentisi</h1>
      <p>Chrome eklentisi, açık olan ilanı tek tıkla aday listesine ekler ve hemen puanlar. Sahibinden, Hepsiemlak,
        Emlakjet sayfalarında alanları kendisi doldurur; Facebook gibi yerlerde paylaşım metnini seçip eklentiye tıklayın.</p>
      <div class="kutu-panel">
        <h2>Kurulum</h2>
        <ol>
          <li><a href="/admin/eklenti/indir" class="dugme">Eklentiyi indir (.zip)</a> ve bir klasöre açın.</li>
          <li>Chrome'da <code>chrome://extensions</code> adresine gidin, sağ üstten <b>Geliştirici modu</b>nu açın.</li>
          <li><b>Paketlenmemiş öğe yükle</b> ile açtığınız <code>realestai-radar</code> klasörünü seçin.</li>
          <li>Aşağıdan kendinize bir anahtar oluşturun, eklentiye tıklayıp yapıştırın.</li>
        </ol>
        <p class="kucuk">Kurallar: yalnız tek tek, elle; toplu kopyalama ve otomatik tarama yok. Fotoğraf alınmaz.
          İlan metni yalnız sahip tespiti için saklanır, sitede yayınlanmaz.</p>
      </div>
      <h2>Anahtarlar</h2>
      <div class="tablo-kap">
        <table class="tablo">
          <thead><tr><th>Ad</th>{k.rol === "admin" && <th>Kullanıcı</th>}<th>Oluşturuldu</th><th>Son kullanım</th><th></th></tr></thead>
          <tbody>{anahtarlar.map((a) => (
            <tr><td>{a.ad}</td>{k.rol === "admin" && <td>{a.kullanici}</td>}<td>{tarih(a.created_at)}</td><td>{a.son_kullanim ? tarih(a.son_kullanim) : "—"}</td>
              <td><form method="post" action={`/admin/eklenti/${a.id}/iptal`}><button class="metin-dugme">İptal et</button></form></td></tr>
          ))}</tbody>
        </table>
      </div>
      <form method="post" action="/admin/eklenti" class="satir-form" style="margin-top:12px">
        <input name="ad" placeholder="Anahtar adı (ör. Didem dizüstü)" required maxlength={60} />
        <button class="dugme">Anahtar oluştur</button>
      </form>
    </AdminSayfa>,
  );
});
admin.post("/eklenti", async (c) => {
  const b = await c.req.parseBody();
  const anahtar = await anahtarUret(c.get("kullanici").id, (s(b, "ad") ?? "eklenti").slice(0, 60));
  // Anahtar yalnız bu yanıtta gösterilir (adres çubuğunda ya da geçmişte kalmasın diye yönlendirme yok).
  return c.html(
    <AdminSayfa baslik="Yeni anahtar" kullanici={c.get("kullanici")}>
      <a href="/admin/eklenti" class="geri">← Radar eklentisi</a>
      <h1>Yeni anahtar</h1>
      <div class="kutu-panel gerekce">
        <strong>Yalnız şimdi görünür — kopyalayıp eklentiye yapıştırın:</strong>
        <p><code>{anahtar}</code></p>
      </div>
    </AdminSayfa>,
  );
});
admin.post("/eklenti/:id/iptal", async (c) => {
  const k = c.get("kullanici");
  await sql`update eklenti_anahtarlari set iptal_at = now() where id = ${c.req.param("id")}
    ${k.rol === "admin" ? sql`` : sql`and kullanici_id = ${k.id}`}`;
  return c.redirect("/admin/eklenti");
});
admin.get("/eklenti/indir", async (c) => {
  const proto = c.req.header("x-forwarded-proto") ?? new URL(c.req.url).protocol.replace(":", "");
  const paket = await eklentiPaketi(`${proto}://${c.req.header("host")}`);
  return c.body(new Uint8Array(paket), 200, {
    "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="realestai-radar.zip"',
  });
});

// ================= AVATAR (yalnız admin) =================
// Didem'in ses ve görüntüsü biyometrik veridir: her şey yazılı rızaya bağlı, geri alma tek düğme.
admin.use("/avatar/*", async (c, next) => (c.get("kullanici").rol === "admin" ? next() : c.text("Yetkiniz yok", 403)));
admin.use("/avatar", async (c, next) => (c.get("kullanici").rol === "admin" ? next() : c.text("Yetkiniz yok", 403)));

admin.get("/avatar", async (c) => {
  const a = await avatarAyar();
  const kullanim = await sql`select gun, karakter, istek, onbellek from ses_kullanim order by gun desc limit 14`;
  const bugun = kullanim.find((k) => new Date(k.gun).toDateString() === new Date().toDateString());
  const hata = c.req.query("hata");
  const durumSatiri = (tamam: boolean, metin: Child) => <li class={tamam ? "tamam" : "eksik"}>{tamam ? "✓" : "✗"} {metin}</li>;
  return c.html(
    <AdminSayfa baslik="Avatar" kullanici={c.get("kullanici")}>
      <h1>Didem avatarı</h1>
      {hata && <div class="hata">{hata}</div>}
      {c.req.query("ok") && <div class="basari">Kaydedildi.</div>}
      <div class="kutu-panel">
        <h2>Durum</h2>
        <ul class="kontrol">
          {durumSatiri(rizaGecerli(a), a.geri_alindi_at
            ? <>Rıza {tarih(a.geri_alindi_at)} tarihinde <b>geri alındı</b> — yeniden kullanım için yeni yazılı rıza gerekir</>
            : a.riza_tarihi ? <>Yazılı açık rıza: {a.riza_tarihi}{a.riza_belgesi && <> · <a href="/admin/avatar/riza-belgesi">belge</a></>}</> : "Yazılı açık rıza girilmedi")}
          {durumSatiri(!!a.foto, a.foto ? "Fotoğraf yüklendi (sitede yalnız rıza geçerliyken görünür)" : "Fotoğraf yok — sitede genel görsel")}
          {durumSatiri(sesAnahtarlariVar(), sesAnahtarlariVar()
            ? `ElevenLabs bağlı (model ${process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2"})`
            : "Railway'de ELEVENLABS_API_KEY ve ELEVENLABS_SES_ID tanımlı değil")}
          {durumSatiri(klonSesAcik(a), klonSesAcik(a) ? "Sitede Didem'in klon sesi açık" : "Sitede tarayıcının kendi sesi kullanılıyor")}
          {durumSatiri(false, "Video avatar: sağlayıcı seçimi bekliyor")}
        </ul>
      </div>

      <div class="kutu-panel">
        <h2>1. Yazılı açık rıza</h2>
        <p class="kucuk">Taslak metin: <code>docs/avatar-riza.md</code> (avukata gösterilecek). İmzalı PDF'i yükleyin; belge herkese açık klasöre konmaz.</p>
        <form method="post" action="/admin/avatar/riza" enctype="multipart/form-data" class="satir-form">
          <label>Rıza tarihi<input type="date" name="tarih" required /></label>
          <label>İmzalı belge (PDF)<input type="file" name="belge" accept="application/pdf" required /></label>
          <button class="dugme">Kaydet</button>
        </form>
      </div>

      <div class="kutu-panel">
        <h2>2. Fotoğraf</h2>
        <p class="kucuk">Yüz ortada, omuzlar görünsün; kare kırpılır. Video avatar gelene kadar asistan sayfasında bu fotoğraf konuşurken canlanır.</p>
        <form method="post" action="/admin/avatar/foto" enctype="multipart/form-data" class="satir-form">
          <input type="file" name="foto" accept="image/*" required disabled={!rizaGecerli(a)} />
          <button class="dugme" disabled={!rizaGecerli(a)}>Yükle</button>
          {a.foto && <img src={`/avatar/foto?v=${encodeURIComponent(a.foto)}`} alt="" width={64} height={64} style="border-radius:50%" />}
        </form>
      </div>

      <div class="kutu-panel">
        <h2>3. Ses</h2>
        <p class="kucuk">Ses klonu ElevenLabs'te oluşturulur (Didem'in kayıtları + rıza doğrulaması); oluşan ses kimliği Railway'e
          <code>ELEVENLABS_SES_ID</code> olarak girilir. Okuma metni: <a href="/admin/avatar/kayit-metni">kayıt metni ve kurallar</a>.</p>
        <form method="post" action="/admin/avatar/ayar" class="form dar">
          <label class="kutu"><input type="radio" name="mod" value="tarayici" checked={a.mod === "tarayici"} /> Tarayıcı sesi (ücretsiz, robotik)</label>
          <label class="kutu"><input type="radio" name="mod" value="klon" checked={a.mod === "klon"} disabled={!rizaGecerli(a) || !sesAnahtarlariVar()} /> Didem'in klon sesi</label>
          <label>Günlük karakter sınırı<input name="gunluk_karakter" type="number" min={0} step={1000} value={String(a.gunluk_karakter)} /></label>
          <p class="kucuk">Sınır dolunca site o gün tarayıcı sesine döner. Aynı cümle bir kez üretilip saklanır, tekrarında ücret yok.</p>
          <button class="dugme">Kaydet</button>
        </form>
        <form method="post" action="/admin/avatar/dene" target="_blank" class="satir-form" style="margin-top:12px">
          <input name="metin" maxlength={600} value="Merhaba, ben Didem'in yapay zekâ asistanıyım. Gümüşlük'te gecesi 8 bin liraya havuzlu bir villa var." />
          <button class="dugme ikincil" disabled={!klonSesAcik(a)}>Dinle</button>
        </form>
        <h3>Kullanım (son 14 gün)</h3>
        <p class="kucuk">Bugün: {bugun?.karakter ?? 0} / {a.gunluk_karakter} karakter.</p>
        <div class="tablo-kap"><table class="tablo">
          <thead><tr><th>Gün</th><th>Üretilen karakter</th><th>Üretim</th><th>Önbellekten</th></tr></thead>
          <tbody>{kullanim.map((k) => <tr><td>{tarih(k.gun)}</td><td>{k.karakter}</td><td>{k.istek}</td><td>{k.onbellek}</td></tr>)}</tbody>
        </table></div>
      </div>

      <div class="kutu-panel">
        <h2>Rızayı geri al</h2>
        <p>Didem rızasını geri alırsa ya da işten ayrılırsa: sitede ses ve fotoğraf hemen kapanır, fotoğraf ve kayıtlı sesler
          sunucudan, ses modeli ElevenLabs'ten silinir. Bu işlem geri alınamaz.</p>
        <form method="post" action="/admin/avatar/geri-al" onsubmit="return confirm('Didem\'in ses ve görüntü verileri silinecek. Emin misiniz?')">
          <button class="dugme tehlike">Rızayı geri al ve verileri sil</button>
        </form>
      </div>
    </AdminSayfa>,
  );
});

admin.post("/avatar/riza", async (c) => {
  const b = await c.req.parseBody();
  const tarihStr = s(b, "tarih");
  const belge = b.belge;
  if (!tarihStr || !/^\d{4}-\d{2}-\d{2}$/.test(tarihStr)) return c.redirect("/admin/avatar?hata=Tarih gerekli");
  if (!(belge instanceof File) || belge.type !== "application/pdf" || belge.size > 20_000_000) {
    return c.redirect("/admin/avatar?hata=İmzalı rıza belgesi PDF olarak yüklenmeli");
  }
  const dizin = join(UPLOAD_DIZIN, "riza");
  await mkdir(dizin, { recursive: true });
  const ad = `avatar-riza-${tarihStr}-${Date.now()}.pdf`;
  await writeFile(join(dizin, ad), Buffer.from(await belge.arrayBuffer()));
  await avatarAyarKaydet({ riza_tarihi: tarihStr, riza_belgesi: `riza/${ad}`, geri_alindi_at: null });
  return c.redirect("/admin/avatar?ok=1");
});
admin.get("/avatar/riza-belgesi", async (c) => {
  const a = await avatarAyar();
  if (!a.riza_belgesi?.startsWith("riza/")) return c.notFound();
  return c.body(new Uint8Array(await readFile(join(UPLOAD_DIZIN, a.riza_belgesi))), 200, { "Content-Type": "application/pdf" });
});

admin.post("/avatar/foto", async (c) => {
  const a = await avatarAyar();
  if (!rizaGecerli(a)) return c.redirect("/admin/avatar?hata=Önce yazılı rıza girilmeli");
  const f = (await c.req.parseBody()).foto;
  if (!(f instanceof File) || !f.type.startsWith("image/") || f.size > 25_000_000) return c.redirect("/admin/avatar?hata=Geçerli bir fotoğraf seçin");
  // EXIF silinir, yüz odaklı kare kırpılır.
  const webp = await sharp(Buffer.from(await f.arrayBuffer())).rotate()
    .resize(640, 640, { fit: "cover", position: sharp.strategy.attention }).webp({ quality: 85 }).toBuffer();
  await mkdir(AVATAR_DIZIN, { recursive: true });
  const ad = `didem-${Date.now()}.webp`;
  await writeFile(join(AVATAR_DIZIN, ad), webp);
  if (a.foto) await unlink(join(AVATAR_DIZIN, a.foto)).catch(() => {});
  await avatarAyarKaydet({ foto: ad });
  return c.redirect("/admin/avatar?ok=1");
});

admin.post("/avatar/ayar", async (c) => {
  const b = await c.req.parseBody();
  const a = await avatarAyar();
  const mod = s(b, "mod") === "klon" ? "klon" : "tarayici";
  if (mod === "klon" && (!rizaGecerli(a) || !sesAnahtarlariVar())) return c.redirect("/admin/avatar?hata=Klon ses için rıza ve ElevenLabs anahtarları gerekli");
  const sinir = n(b, "gunluk_karakter");
  await avatarAyarKaydet({ mod, gunluk_karakter: sinir != null ? Math.max(0, Math.round(sinir)) : a.gunluk_karakter });
  return c.redirect("/admin/avatar?ok=1");
});

admin.post("/avatar/dene", async (c) => {
  const metin = s(await c.req.parseBody(), "metin") ?? "";
  try {
    return c.body(new Uint8Array(await sesUret(metin)), 200, { "Content-Type": "audio/mpeg" });
  } catch (e) {
    return c.text(e instanceof SesHatasi ? e.message : "ses üretilemedi", e instanceof SesHatasi ? e.durum : 500);
  }
});

admin.post("/avatar/geri-al", async (c) => {
  const rapor = await rizayiGeriAl();
  console.log(`avatar rızası geri alındı (${c.get("kullanici").eposta})`);
  return c.html(
    <AdminSayfa baslik="Rıza geri alındı" kullanici={c.get("kullanici")}>
      <h1>Rıza geri alındı</h1>
      <ul class="kontrol">{rapor.map((r) => <li>{r}</li>)}</ul>
      <a href="/admin/avatar" class="dugme">Avatar sayfasına dön</a>
    </AdminSayfa>,
  );
});

admin.get("/avatar/kayit-metni", (c) =>
  c.html(
    <AdminSayfa baslik="Kayıt metni" kullanici={c.get("kullanici")}>
      <a href="/admin/avatar" class="geri">← Avatar</a>
      <h1>Ses kaydı — okuma metni</h1>
      <div class="kutu-panel">
        <h2>Kurallar</h2>
        <ul>{KAYIT_KURALLARI.map((k) => <li>{k}</li>)}</ul>
        <p class="kucuk">Video kaydı kuralları ve rıza videosu, video avatar sağlayıcısı seçilince eklenecek (bkz. <code>docs/avatar-didem.md</code>).</p>
      </div>
      {KAYIT_BOLUMLERI.map((b) => (
        <div class="kutu-panel">
          <h2>{b.baslik}</h2>
          <p class="kucuk">{b.not}</p>
          {b.satirlar.length > 0 && <ol class="okuma">{b.satirlar.map((x) => <li>{x}</li>)}</ol>}
        </div>
      ))}
    </AdminSayfa>,
  ),
);

// ================= TEMSİLİ 3D (derinlikli fotoğraf) =================
admin.post("/ilan/:id/3d", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.parseBody();
  const fotoId = s(b, "foto_id");
  const dosya = b.derinlik;
  if (!fotoId || !(dosya instanceof File) || dosya.size > 20_000_000) return c.json({ hata: "foto_id ve derinlik gerekli" }, 400);
  const [f] = await sql`select id, oda_etiketi from ilan_fotolari where id = ${fotoId} and ilan_id = ${id}`;
  if (!f) return c.json({ hata: "fotoğraf bu ilana ait değil" }, 404);
  // Hafif bulanıklık kenarlardaki yırtılmayı azaltır. Derinlik farkı çok azsa (düz duvar, yakın çekim) uyarı.
  const gri = sharp(Buffer.from(await dosya.arrayBuffer())).grayscale().blur(1.2);
  const { channels } = await gri.clone().stats();
  const sapma = Math.round(channels[0].stdev * 10) / 10;
  const jpeg = await gri.jpeg({ quality: 90 }).toBuffer();
  const dizin = join(UPLOAD_DIZIN, "ilan", id, "3d");
  await mkdir(dizin, { recursive: true });
  const ad = `${f.id}-${Date.now()}.jpg`;
  await writeFile(join(dizin, ad), jpeg);
  const kalite = { derinlik_sapma: sapma, uyari: sapma < 12 ? "Derinlik farkı çok az; 3D etkisi zayıf olabilir." : null };
  const [eski] = await sql`select dosya_url from gorsel_3d where foto_id = ${f.id} and yontem = 'tek_goruntu_derinlik'`;
  await sql`insert into gorsel_3d (ilan_id, foto_id, oda, yontem, dosya_url, kalite, model)
    values (${id}, ${f.id}, ${f.oda_etiketi ?? "diger"}, 'tek_goruntu_derinlik', ${`/uploads/ilan/${id}/3d/${ad}`},
            ${sql.json(kalite)}, ${s(b, "model")})
    on conflict (foto_id, yontem) where foto_id is not null do update set
      dosya_url = excluded.dosya_url, kalite = excluded.kalite, model = excluded.model, onaylandi = false, created_at = now()`;
  if (eski) await unlink(join(UPLOAD_DIZIN, eski.dosya_url.replace(/^\/uploads\//, ""))).catch(() => {});
  return c.json({ ok: true, kalite });
});
admin.post("/3d/:gid/onay", async (c) => {
  const [g] = await sql`update gorsel_3d set onaylandi = not onaylandi where id = ${c.req.param("gid")} returning ilan_id`;
  return g ? c.redirect(`/admin/ilan/${g.ilan_id}`) : c.notFound();
});
admin.post("/3d/:gid/sil", async (c) => {
  const [g] = await sql`delete from gorsel_3d where id = ${c.req.param("gid")} returning ilan_id, dosya_url`;
  if (!g) return c.notFound();
  await unlink(join(UPLOAD_DIZIN, g.dosya_url.replace(/^\/uploads\//, ""))).catch(() => {});
  return c.redirect(`/admin/ilan/${g.ilan_id}`);
});

// Yabancı müşteriye kendi dilinde dönülsün diye listede gösterilir.
const DIL_ADI: Record<string, string> = { en: "İngilizce", ru: "Rusça", de: "Almanca" };

// ================= YAYINA HAZIRLIK (yalnız admin) =================
admin.use("/yayin", async (c, next) => (c.get("kullanici").rol === "admin" ? next() : c.text("Yetkiniz yok", 403)));

const SIRKET_ALANLARI: [keyof SiteAyar, string, string?][] = [
  ["unvan", "Şirket unvanı"], ["adres", "Adres"], ["mersis", "MERSİS no"], ["vergi", "Vergi dairesi / no"],
  ["yetki_belgesi_no", "Taşınmaz Ticareti Yetki Belgesi no"], ["telefon", "Telefon"], ["eposta", "E-posta (KVKK başvuruları da buraya)"],
  ["kep", "KEP adresi"], ["whatsapp", "WhatsApp numarası"], ["instagram", "Instagram bağlantısı", "https://instagram.com/…"],
  ["facebook", "Facebook bağlantısı", "https://facebook.com/…"],
];

admin.get("/yayin", async (c) => {
  const a = siteAyar();
  const [[{ gercek, demo }], [{ anahtar }], avatar] = await Promise.all([
    sql`select count(*) filter (where not demo)::int as gercek, count(*) filter (where demo)::int as demo from ilanlar where durum = 'yayinda'`,
    sql`select count(*)::int as anahtar from eklenti_anahtarlari where iptal_at is null`,
    avatarAyar(),
  ]);
  const krediYas = gunOnce((await krediOranlari()).guncelleme);
  const host = c.req.header("host") ?? "";
  const eksikSirket = SIRKET_ZORUNLU.filter((k) => !a[k]);
  const kritik: [boolean, string][] = [
    [!eksikSirket.length, eksikSirket.length ? `Şirket bilgileri eksik: ${eksikSirket.join(", ")}` : "Şirket bilgileri tamam (alt bilgi ve yasal metinlerde görünüyor)"],
    [a.hukuk_onayli, a.hukuk_onayli ? "Yasal metinler avukat onaylı" : "Yasal metinler avukata gösterilmedi (sitede TASLAK uyarısı var)"],
    [!!process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_API_KEY ? "Claude bağlı (sesli arama, asistan, çeviri)" : "ANTHROPIC_API_KEY yok — sesli arama, asistan ve çeviri çalışmıyor"],
    [gercek > 0, `Yayında gerçek ilan: ${gercek}`],
    [a.demo_gizle || demo === 0, a.demo_gizle ? "DEMO ilanlar gizli" : `${demo} DEMO ilan sitede görünüyor`],
    [!/\.up\.railway\.app$|^localhost/.test(host), `Alan adı: ${host}${/\.up\.railway\.app$/.test(host) ? " (Railway'in geçici adresi)" : ""}`],
  ];
  const istege: [boolean, string][] = [
    [!!process.env.NVIDIA_API_KEY, process.env.NVIDIA_API_KEY ? "NVIDIA bağlı (fotoğraf oda etiketi)" : "NVIDIA_API_KEY yok — fotoğraf etiketleri elle"],
    [klonSesAcik(avatar), klonSesAcik(avatar) ? "Didem'in klon sesi açık" : "Avatar: tarayıcı sesi (rıza ve ElevenLabs bekliyor)"],
    [anahtar > 0, `Radar eklentisi: ${anahtar} etkin anahtar`],
    [krediYas != null && krediYas <= ESKI_GUN, krediYas == null ? "Kredi oranları girilmedi (kredi sayfasında banka karşılaştırması yok)"
      : krediYas > ESKI_GUN ? `Kredi oranları ${krediYas} gün önce güncellendi; eskidiği için sitede gizli` : `Kredi oranları ${krediYas} gün önce güncellendi`],
  ];
  const satir = ([tamam, metin]: [boolean, string]) => <li class={tamam ? "tamam" : "eksik"}>{tamam ? "✓" : "✗"} {metin}</li>;
  return c.html(
    <AdminSayfa baslik="Yayına hazırlık" kullanici={c.get("kullanici")}>
      <h1>Yayına hazırlık</h1>
      {c.req.query("ok") && <div class="basari">Kaydedildi.</div>}
      <div class="kutu-panel">
        <h2>Kontrol listesi</h2>
        <p class="kucuk">Kritik</p>
        <ul class="kontrol">{kritik.map(satir)}</ul>
        <p class="kucuk">İsteğe bağlı</p>
        <ul class="kontrol">{istege.map(satir)}</ul>
      </div>
      <form method="post" action="/admin/yayin" class="kutu-panel form">
        <h2>Şirket bilgileri</h2>
        <p class="kucuk">Sitenin alt bilgisinde ve yasal metinlerde kullanılır. Boş bırakılan alan sitede gösterilmez.</p>
        {SIRKET_ALANLARI.map(([k, et, ph]) => <label>{et}<input name={k} value={String(a[k] ?? "")} placeholder={ph ?? ""} /></label>)}
        <h2>Yayın</h2>
        <label class="kutu"><input type="checkbox" name="demo_gizle" value="1" checked={a.demo_gizle} /> DEMO ilanları sitede gizle (silinmez; arama, ana sayfa, endeks ve mahalle sayılarından çıkar)</label>
        <label class="kutu"><input type="checkbox" name="hukuk_onayli" value="1" checked={a.hukuk_onayli} /> Yasal metinler avukat tarafından onaylandı ("TASLAK" uyarısını kaldır)</label>
        <button class="dugme">Kaydet</button>
      </form>
      <div class="kutu-panel">
        <h2>Alan adı bağlama</h2>
        <ol>
          <li>Railway → realestai → web → Settings → Networking → <b>Custom Domain</b> ile alan adını ekleyin (ör. <code>www.alanadi.com</code>).</li>
          <li>Railway'in verdiği CNAME kaydını alan adı sağlayıcınızın DNS ayarlarına girin.</li>
          <li>Sertifika Railway tarafından otomatik verilir; birkaç dakika sürebilir. Sonra bu sayfayı yeni adresten açın.</li>
          <li>Radar eklentisini kullananlar eklentinin Ayarlar'ından sunucu adresini yeni alan adıyla değiştirsin.</li>
        </ol>
      </div>
    </AdminSayfa>,
  );
});
admin.post("/yayin", async (c) => {
  const b = await c.req.parseBody();
  const yeni: Partial<SiteAyar> = { demo_gizle: b.demo_gizle === "1", hukuk_onayli: b.hukuk_onayli === "1" };
  for (const [k] of SIRKET_ALANLARI) (yeni as Record<string, string>)[k] = (s(b, k) ?? "").slice(0, 300);
  for (const k of ["instagram", "facebook"] as const) if (yeni[k] && !/^https:\/\//.test(yeni[k]!)) yeni[k] = "";
  await siteAyarKaydet(yeni);
  return c.redirect("/admin/yayin?ok=1");
});


// ================= KREDİ ORANLARI (tüm ekip) =================
// Bankaların sitelerinde ilan edilen konut kredisi oranları elle girilir; /kredi sayfasında karşılaştırılır.
type KrediSatir = { banka: string; faiz: string; tahsis: string; vade: string };
function krediSayfasi(c: any, k: KrediOranlari, satirlar: (KrediSatir | null)[], kaynak: string, hata = "") {
  const yas = gunOnce(k.guncelleme);
  satirlar = [...satirlar, ...Array.from({ length: 3 }, () => null)];
  return c.html(
    <AdminSayfa baslik="Kredi oranları" kullanici={c.get("kullanici")}>
      <h1>Kredi oranları</h1>
      {c.req.query("ok") && <div class="basari">Kaydedildi; kredi sayfasında görünüyor.</div>}
      {hata && <div class="hata">{hata}</div>}
      <div class="kutu-panel">
        <p>
          {yas == null ? "Henüz oran girilmedi." : `Son güncelleme: ${new Date(k.guncelleme!).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })} (${yas} gün önce).`}
          {" "}Oranlar {ESKI_GUN} günden eski olursa yanıltmasın diye sitede otomatik gizlenir; ayda bir bakıp kaydedin.
        </p>
        <p class="kucuk">
          Bankaların sitelerindeki "konut kredisi" sayfasından aylık faizi, kredi tahsis ücretini (yasal üst sınır kredinin binde 5'i) ve
          azami vadeyi yazın. Kampanya oranı belirli koşullara bağlıysa (maaş müşterisi, enerji sınıfı vb.) kısa notu kaynak alanına ekleyin.
          Değişiklik olmasa da "Kaydet" güncelleme tarihini yeniler.
        </p>
      </div>
      <form method="post" action="/admin/kredi" class="kutu-panel form">
        <div class="tablo-kap"><table class="tablo">
          <thead><tr><th>Banka</th><th>Aylık faiz (%)</th><th>Tahsis ücreti (%)</th><th>Azami vade (ay)</th></tr></thead>
          <tbody>
            {satirlar.map((o) => (
              <tr>
                <td><input name="banka" value={o?.banka ?? ""} placeholder="Banka adı" /></td>
                <td><input name="faiz" inputmode="decimal" value={o?.faiz ?? ""} placeholder="2,79" /></td>
                <td><input name="tahsis" inputmode="decimal" value={o?.tahsis ?? ""} placeholder="0,5" /></td>
                <td><input name="vade" inputmode="numeric" value={o?.vade ?? ""} placeholder="120" /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p class="kucuk">Bir bankayı kaldırmak için adını silin. Daha fazla satır için kaydedin; 3 boş satır yeniden eklenir.</p>
        <label>Kaynak / not (sitede gösterilmez)<input name="kaynak" value={kaynak} placeholder="ör. bankaların web siteleri; 2,79 oranı yalnız maaş müşterisine" /></label>
        <button class="dugme">Kaydet</button>
        <a href="/kredi" target="_blank" class="kucuk"> Kredi sayfasını aç ↗</a>
      </form>
    </AdminSayfa>,
  );
}
admin.get("/kredi", async (c) => {
  const k = await krediOranlari();
  const satirlar = k.oranlar.map((o) => ({ banka: o.banka, faiz: String(o.faiz), tahsis: String(o.tahsis), vade: String(o.azami_vade) }));
  return krediSayfasi(c, k, satirlar, k.kaynak);
});
admin.post("/kredi", async (c) => {
  const b = await c.req.parseBody({ all: true });
  const dizi = (k: string) => ([] as unknown[]).concat(b[k] ?? []).map((x) => (typeof x === "string" ? x : ""));
  const { oranlar, hatalar } = oranlariAyikla(dizi("banka"), dizi("faiz"), dizi("tahsis"), dizi("vade"));
  if (hatalar.length) {
    // Yazılanlar kaybolmasın: form girilen değerlerle hatayla birlikte yeniden çizilir.
    const girilen = dizi("banka").map((banka, i) => ({ banka, faiz: dizi("faiz")[i] ?? "", tahsis: dizi("tahsis")[i] ?? "", vade: dizi("vade")[i] ?? "" }))
      .filter((r) => r.banka.trim());
    return krediSayfasi(c, await krediOranlari(), girilen, s(b, "kaynak") ?? "", hatalar.join("; "));
  }
  await krediOranlariKaydet({ oranlar, guncelleme: oranlar.length ? new Date().toISOString() : null, kaynak: (s(b, "kaynak") ?? "").slice(0, 500) });
  return c.redirect("/admin/kredi?ok=1");
});

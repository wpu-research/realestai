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
                <td data-et="Başlık"><a href={`/admin/aday/${a.id}`}>{a.baslik}</a>{a.fiyat_dustu && <span class="etiket mavi">fiyat düştü</span>}</td>
                <td data-et="Mahalle">{a.mahalle ?? "—"}</td>
                <td data-et="Fiyat">{a.fiyat ? para(a.fiyat, a.para_birimi) : "—"}</td>
                <td data-et="İskonto">{yuzde(a.iskonto)}</td>
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
      };
      await sql`insert into adaylar ${sql(kayit)}
        on conflict (kaynak, kaynak_ilan_no) do update set
          fiyat = excluded.fiyat, iskonto = excluded.iskonto, bolge_medyani = excluded.bolge_medyani,
          sahip_olasiligi = excluded.sahip_olasiligi, oncelik = excluded.oncelik, yayinda_gun = excluded.yayinda_gun,
          fiyat_dustu = excluded.fiyat_dustu or coalesce(excluded.fiyat < adaylar.fiyat, false),
          kirmizi_bayraklar = excluded.kirmizi_bayraklar, updated_at = now()`;
      eklenen++;
    } catch (e) {
      hatalar.push(`satır ${i + 2}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return c.html(
    <AdminSayfa baslik="CSV sonucu" kullanici={c.get("kullanici")}>
      <h1>CSV içe aktarma</h1>
      <p>{eklenen} satır eklendi / güncellendi, {hatalar.length} hata.</p>
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
            <dt>Bölge ortancası</dt><dd>{a.bolge_medyani ? para(a.bolge_medyani) : "—"}</dd>
            <dt>Ortancanın altında</dt><dd>{yuzde(a.iskonto)}</dd>
            <dt>Sahip olasılığı</dt><dd>{yuzde(a.sahip_olasiligi)}</dd>
            <dt>Yayında</dt><dd>{a.yayinda_gun != null ? `${a.yayinda_gun} gün` : "—"}{a.fiyat_dustu ? " · fiyat düştü" : ""}</dd>
            <dt>Atanan</dt><dd>{a.atanan_ad ?? "—"}</dd>
          </dl>
          {a.kirmizi_bayraklar.length > 0 && <p>{a.kirmizi_bayraklar.map((b: string) => <span class="etiket kirmizi">{BAYRAK_ETIKET[b] ?? b}</span>)}</p>}
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
  const [fotolar, mh] = await Promise.all([
    sql`select * from ilan_fotolari where ilan_id = ${id} order by sira`,
    sql`select id, ad, ilce from mahalleler order by ilce, ad`,
  ]);
  const kontrol = yayinKontrol(i, fotolar.length);
  const hazir = kontrol.every((k) => k.tamam);
  const v = (x: unknown) => (x == null ? "" : String(x));
  const ceviri = (dil: string, alan: string) => v(i.ceviriler?.[dil]?.[alan]);

  return c.html(
    <AdminSayfa baslik={`İlan ${i.ilan_no}`} kullanici={c.get("kullanici")} scriptler={["/js/admin.js"]}>
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
              <label>Tür<select name="emlak_turu">{Object.entries(TUR_ETIKET).map(([k, e]) => <option value={k} selected={i.emlak_turu === k}>{e}</option>)}</select></label>
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
            <div class="secim-satir">
              {[["site_ici", "Site içi"], ["deniz_manzarasi", "Deniz manzarası"], ["esyali", "Eşyalı"], ["otopark", "Otopark"], ["evcil_hayvan", "Evcil hayvan kabul"]].map(([k, e]) => (
                <label class="kutu"><input type="checkbox" name={k} value="1" checked={!!i[k]} />{e}</label>
              ))}
            </div>
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
        </aside>
      </div>
    </AdminSayfa>,
  );
});

admin.post("/ilan/:id", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.parseBody();
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
      bayraklar_incelendi = ${b.bayraklar_incelendi === "1"}, ceviriler = ${sql.json(ceviriler)}
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
            <p><a href={`tel:${b.telefon}`}>{b.telefon}</a>{b.eposta && ` · ${b.eposta}`} · {TIP_ETIKET[b.tip]} · {b.mahalle ?? "—"} · {tarih(b.created_at)}{b.iys_onay && " · İYS ✓"}</p>
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
            <p>{t.telefon && <a href={`tel:${t.telefon}`}>{t.telefon}</a>}{t.eposta && ` · ${t.eposta}`} · {tarih(t.created_at)}</p>
            {t.ilan_no && <p>İlan: <a href={`/ilan/${t.ilan_no}`} target="_blank">#{t.ilan_no} {t.baslik}</a></p>}
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
admin.get("/olcum", async (c) => {
  const [aramalar, oturumlar] = await Promise.all([
    sql`select metin, filtreler, created_at from sesli_arama_kayitlari order by created_at desc limit 200`,
    sql<{ kanal: string; toplam: number; biten: number; ort_adim: number }[]>`
      select kanal, count(*)::int as toplam, count(*) filter (where tamamlandi)::int as biten,
             round(avg(adim_sayisi), 1)::float as ort_adim
      from asistan_oturumlari where created_at > now() - interval '30 days' group by kanal`,
  ]);
  return c.html(
    <AdminSayfa baslik="Ölçüm" kullanici={c.get("kullanici")}>
      <h1>Ölçüm (son 30 gün)</h1>
      <div class="kartlar-liste yatay">
        {oturumlar.map((o) => (
          <div class="kutu-panel"><strong>{o.kanal === "avatar" ? "Didem asistanı" : "Sihirbaz"}</strong>
            <p>{o.toplam} başladı · {o.biten} bitirdi · ortalama {o.ort_adim} adım</p></div>
        ))}
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

import { Hono } from "hono";
import { demoKosulu, siteAyar, yerTutucu } from "../lib/site-ayar.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { AVATAR_DIZIN, avatarAyar, fotoGosterilir, imzala, klonSesAcik } from "../lib/avatar.js";
import { dil, istek, t } from "../lib/dil.js";
import { sql } from "../db.js";
import { filtreOku, gevsetmeOnerisi, ilanAra, type Filtreler, type IlanKart } from "../lib/arama.js";
import { fiyatMetni, kisaFiyat, ODA_ETIKET, para, TIP_ETIKET, TUR_ETIKET, yuzde } from "../lib/bicim.js";
import { Ara, Ayar, Konum, Mikrofon, Ok, Onay } from "../views/ikon.js";
import { demoDerinligi, demoGorselleri, Fiyat, IlanKarti, ilanMetni, json, mahalleGorseli, ornekGorsel, Sayfa } from "../views/layout.js";
import { CEPHE, ISITMA, KIMDEN, KONUT_TIPLERI, MUTFAK, OZELLIK_GRUPLARI, TAPU, YAPI_DURUMU } from "../lib/ozellikler.js";

const etiket = (liste: { k: string; e: string }[], k: string | null) => (k ? t(liste.find((x) => x.k === k)?.e ?? k) : null);

export const site = new Hono();

type Mahalle = { id: number; slug: string; ad: string; ilce: string; segment: string; lat: number; lng: number; kiyi: boolean };
const mahalleler = () => sql<Mahalle[]>`select id, slug, ad, ilce, segment, lat, lng, kiyi from mahalleler order by ad`;

const ORNEKLER = [
  "Bitez'de denize yakın havuzlu 2+1 satılık",
  "Ağustosta 6 kişilik, gecesi 8 binin altında tatil evi",
  "Konacık'ta yıllık kiralık 3+1, eşyasız",
  "Yalıkavak'ta sezonluk deniz manzaralı villa",
];

function AramaKutusu({ deger = "", hero = false }: { deger?: string; hero?: boolean }) {
  // Kısa yazım kelimeyle arar; cümle yazılırsa ya da mikrofon kullanılırsa "detaylı arama" (yapay zekâ) devreye girer.
  return (
    <form class={`arama-kutu ${hero ? "hero-arama" : ""}`} data-sesli-arama data-akilli action="/ara" method="get">
      <span class="arama-ikon"><Ara boyut={hero ? 20 : 18} /></span>
      <input name="kelime" value={deger} placeholder={t("Örn. Bitez'de denize yakın havuzlu 2+1 satılık")} autocomplete="off" />
      <button type="button" class="mikrofon" data-mikrofon aria-label={t("Detaylı sesli arama")} title={t("Detaylı sesli arama")} hidden><Mikrofon boyut={hero ? 20 : 18} /></button>
      <button type="submit" class="ara-dugme">{t("Ara")}</button>
      <div class="arama-durum" data-durum></div>
    </form>
  );
}

// ---------- Ana sayfa ----------
site.get("/", async (c) => {
  const [firsatlar, mh] = await Promise.all([
    ilanAra({ siralama: "en_firsat" }, { limit: 6 }) as Promise<IlanKart[]>,
    sql<(Mahalle & { n: number })[]>`
      select m.slug, m.ad, m.ilce, count(i.id) filter (where i.durum = 'yayinda' ${demoKosulu()})::int as n
      from mahalleler m left join ilanlar i on i.mahalle_id = m.id group by m.id order by m.ad`,
  ]);
  return c.html(
    <Sayfa scriptler={["/js/sesli-arama.js"]}>
      <section class="hero">
        <img class="hero-gorsel" src="/img/hero-bodrum.jpg" alt="" fetchpriority="high" />
        <div class="hero-perde"></div>
        <div class="kap hero-ic">
          <h1>{t("Bodrum'da ev, sahibinden.")}</h1>
          <p>{t("Sahibinin yetki verdiği, doğrulanmış ilanlar. Ne aradığınızı söyleyin, gerisini biz bulalım.")}</p>
          <AramaKutusu hero />
          <div class="hero-cipler">
            {(["satilik", "kiralik", "sezonluk", "gunluk"] as const).map((x) => (
              <a href={`/ara?tip=${x}`} class="cam-cip">{t(TIP_ETIKET[x])}</a>
            ))}
          </div>
        </div>
      </section>

      <section class="kap bolum">
        <div class="bolum-bas">
          <h2>{t("Haftanın fırsatları")}</h2>
          <a href="/ara?siralama=en_firsat" class="bolum-link">{t("Tüm ilanlar")} <Ok boyut={14} /></a>
        </div>
        <div class="kartlar uc-sutun">{firsatlar.map((i) => <IlanKarti i={i} />)}</div>
      </section>

      <section class="kum-bolum">
        <div class="kap bolum">
          <h2>{t("Mahalleler")}</h2>
          <div class="mahalle-izgara">
            {mh.map((m, k) => (
              <a href={`/mahalle/${m.slug}`} class="mahalle-karo">
                <img src={mahalleGorseli(m.slug, k)} alt={`${m.ad} (temsili görsel)`} loading="lazy" />
                <div class="mahalle-perde"></div>
                <div class="mahalle-yazi"><strong>{m.ad}</strong><span>{m.ilce} · {m.n}</span></div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section class="kap bolum">
        <div class="cta-bant">
          <div>
            <h2>{t("Evinizi ücretsiz listeleyin")}</h2>
            <p>{t("Dört dilde yayınlayalım, yerli ve yabancı alıcılara ulaştıralım.")}</p>
          </div>
          <a href="/evimi-listele" class="dugme vurgu">{t("Başvur")}</a>
        </div>
      </section>
    </Sayfa>,
  );
});

// ---------- İlan detay ----------
site.get("/ilan/:no{[0-9]+}", async (c) => {
  const no = Number(c.req.param("no"));
  const [i] = await sql`
    select i.*, m.ad as mahalle, m.slug as mahalle_slug, m.ilce, coalesce(i.lat, m.lat) as harita_lat, coalesce(i.lng, m.lng) as harita_lng
    from ilanlar i left join mahalleler m on m.id = i.mahalle_id
    where i.ilan_no = ${no} and i.durum = 'yayinda' ${demoKosulu()}`;
  if (!i) return c.notFound();
  let fotolar = await sql<{ url: string; oda_etiketi: string | null }[]>`
    select url, oda_etiketi from ilan_fotolari where ilan_id = ${i.id} order by sira`;
  if (!fotolar.length && i.demo) {
    const uretilmis = demoGorselleri(no);
    fotolar = (uretilmis.length ? uretilmis : [0, 1, 2, 3].map((k) => ornekGorsel(no + k - 1))).map((url) => ({ url, oda_etiketi: null })) as any;
  }
  // Temsili 3D: onaylı derinlik haritaları; DEMO ilanlarda önceden üretilmiş olanlar.
  const ucBoyut: { foto: string; derinlik: string }[] = (await sql<{ foto: string; derinlik: string }[]>`
    select f.url as foto, g.dosya_url as derinlik from gorsel_3d g join ilan_fotolari f on f.id = g.foto_id
    where g.ilan_id = ${i.id} and g.onaylandi and g.yontem = 'tek_goruntu_derinlik' order by f.sira`).map((r) => ({ ...r }));
  if (!ucBoyut.length && i.demo) {
    fotolar.forEach((f, k) => { const d = demoDerinligi(no, k); if (d && f.url === demoGorselleri(no)[k]) ucBoyut.push({ foto: f.url, derinlik: d }); });
  }
  const benzer = (await ilanAra({ tip: i.tip }, { limit: 4 }) as IlanKart[]).filter((x) => x.id !== i.id).slice(0, 3);
  const gonderildi = c.req.query("talep") === "ok";
  const metin = ilanMetni(i as any);
  const evetHayir = (x: boolean | null) => (x == null ? "—" : x ? t("Evet") : t("Hayır"));

  const ozellikler: [string, unknown][] = [
    ["Konut tipi", etiket(KONUT_TIPLERI, i.emlak_turu) ?? t(TUR_ETIKET[i.emlak_turu])], ["Oda", i.oda], ["Net m²", i.net_m2],
    ["Brüt m²", i.brut_m2], ["Banyo", i.banyo], ["Bina yaşı", i.bina_yasi],
    ["Kat sayısı", i.kat_sayisi], ["Bulunduğu kat", i.kat == null ? null : i.kat === 0 ? t("Bahçe / zemin") : i.kat],
    ["Isıtma", etiket(ISITMA, i.isitma)], ["Mutfak", etiket(MUTFAK, i.mutfak)],
    ["Balkon", i.balkon == null ? null : evetHayir(i.balkon)], ["Asansör", i.asansor == null ? null : evetHayir(i.asansor)],
    ["Kullanım durumu", etiket(YAPI_DURUMU, i.yapi_durumu)], ["Tapu durumu", etiket(TAPU, i.tapu_durumu)],
    ["Kimden", etiket(KIMDEN, i.ilan_veren)], ["Cephe", i.cephe?.length ? i.cephe.map((c: string) => etiket(CEPHE, c)).join(", ") : null],
    ["Özel alan", i.ozel_alan == null ? null : evetHayir(i.ozel_alan)],
    ["Kapasite", i.yatak_kapasitesi ? `${i.yatak_kapasitesi} ${t("kişi")}` : null], ["Minimum gece", i.min_gece],
    ["İlan tarihi", i.yayinlandi_at ? new Date(i.yayinlandi_at).toLocaleDateString(dil()) : null],
    ["Site içi", evetHayir(i.site_ici)], ["Havuz", t(({ ozel: "Özel", ortak: "Ortak", yok: "Yok" } as Record<string, string>)[i.havuz as string])],
    ["Deniz manzarası", evetHayir(i.deniz_manzarasi)], ["Denize mesafe", i.denize_mesafe_m ? `${i.denize_mesafe_m} m` : null],
    ["Eşyalı", evetHayir(i.esyali)], ["Otopark", evetHayir(i.otopark)], ["Evcil hayvan", evetHayir(i.evcil_hayvan)],
    ["Sezon", i.sezon_baslangic ? `${new Date(i.sezon_baslangic).toLocaleDateString(dil())} – ${new Date(i.sezon_bitis).toLocaleDateString(dil())}` : null],
  ];

  // schema.org: arama sonuçlarında fiyat ve konumla görünsün. DEMO ilanlar dizinlenmez.
  const { kok } = istek();
  const jsonld = {
    "@context": "https://schema.org", "@type": "RealEstateListing",
    name: metin.baslik, description: metin.aciklama.slice(0, 500), url: kok + `/ilan/${no}`,
    image: fotolar.slice(0, 6).map((f) => (f.url.startsWith("http") ? f.url : kok + f.url)),
    datePosted: i.yayinlandi_at ? new Date(i.yayinlandi_at).toISOString().slice(0, 10) : undefined,
    offers: {
      "@type": "Offer", price: Number(i.fiyat), priceCurrency: i.para_birimi,
      businessFunction: i.tip === "satilik" ? "http://purl.org/goodrelations/v1#Sell" : "http://purl.org/goodrelations/v1#LeaseOut",
    },
    contentLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: i.mahalle, addressRegion: i.ilce, addressCountry: "TR" } },
  };
  return c.html(
    <Sayfa baslik={metin.baslik} aciklama={metin.aciklama.slice(0, 155)} harita scriptler={["/js/ilan.js", "/js/form.js"]}
      resim={fotolar[0]?.url} noindex={i.demo} jsonld={i.demo ? undefined : jsonld}>
      <div class="kap ilan">
        <div class="rozet-satir">
          <span class="rozet rozet-tip">{t(TIP_ETIKET[i.tip])}</span>
          {i.demo && <span class="rozet rozet-demo-acik">DEMO</span>}
          {i.iskonto >= 0.15 && <span class="rozet rozet-firsat">{t("Bölge ortalamasının %{n} altında", { n: Math.round(i.iskonto * 100) })}</span>}
          <span class="ilan-no">#{i.ilan_no}</span>
        </div>
        <div class="ilan-baslik-satir">
          <h1>{metin.baslik}</h1>
          <button type="button" class="kaydet-dugme" data-kaydet-ilan={i.ilan_no} aria-pressed="false">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>
            <span data-yazi>{t("Kaydet")}</span>
          </button>
        </div>
        <a href={`/mahalle/${i.mahalle_slug}`} class="ilan-yer"><Konum boyut={16} />{i.mahalle}, {i.ilce}</a>

        <div class="ilan-govde">
          <div class="ilan-sol">
            <div class="galeri" data-galeri>
              <div class="galeri-ana"><img src={fotolar[0]?.url ?? ""} alt={metin.baslik} data-ana />{i.demo && <span class="temsili-etiket">{t("Temsili görsel")}</span>}
                {ucBoyut.length > 0 && <button type="button" class="uc-boyut-dugme" data-3d-ac>{t("3D görünüm")} <small>({t("temsili")})</small></button>}
              </div>
              {fotolar.length > 1 && (
                <div class="galeri-kucuk">
                  {fotolar.map((f, k) => (
                    <button type="button" class={k === 0 ? "aktif" : ""} data-foto={f.url} title={t(ODA_ETIKET[f.oda_etiketi ?? ""] ?? "")}>
                      <img src={f.url} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {ucBoyut.length > 0 && (
              <dialog class="uc-boyut" data-3d-pencere>
                <div class="uc-boyut-ust">
                  <strong>{t("3D görünüm")}</strong>
                  <button type="button" class="metin-dugme" data-3d-kapat>{t("Kapat")}</button>
                </div>
                <div class="uc-boyut-sahne">
                  <canvas data-3d-tuval></canvas>
                  <span class="uc-boyut-filigran">{t("Temsili — YZ ile üretildi")}</span>
                </div>
                <p class="uc-boyut-uyari"><strong>{t("Temsili görseldir.")}</strong> {t("Bu 3D görünüm ilan fotoğraflarından yapay zekâ ile otomatik üretilmiştir. Ölçüler, oda düzeni, malzeme ve görünüm gerçeği yansıtmayabilir; bazı alanlar yapay zekâ tarafından tamamlanmıştır. Karar vermeden önce mülkü yerinde görün.")}</p>
                <p class="kucuk">{t("Fareyi gezdirin ya da parmağınızla kaydırın.")}</p>
                {ucBoyut.length > 1 && (
                  <div class="galeri-kucuk">{ucBoyut.map((u, k) => (
                    <button type="button" class={k === 0 ? "aktif" : ""} data-3d-sec={k}><img src={u.foto} alt="" loading="lazy" /></button>
                  ))}</div>
                )}
                <script type="application/json" data-3d-veri>{json(ucBoyut)}</script>
              </dialog>
            )}
            <p class="aciklama">{metin.aciklama}</p>

            <h2>{t("Özellikler")}</h2>
            <dl class="ozellik-kart">
              {ozellikler.filter(([, v]) => v != null && v !== "").map(([k, v]) => <div><dt>{t(k)}</dt><dd>{String(v)}</dd></div>)}
            </dl>

            {OZELLIK_GRUPLARI.filter((g) => g.secenekler.some((o) => i.ozellikler?.includes(o.k))).map((g) => (
              <div class="ozellik-grup">
                <h3>{t(g.baslik)}</h3>
                <ul>{g.secenekler.filter((o) => i.ozellikler.includes(o.k)).map((o) => <li>✓ {t(o.e)}</li>)}</ul>
              </div>
            ))}
            {i.video_url && <p><a href={i.video_url} target="_blank" rel="noopener" class="dugme ikincil">{t("▶ İlan videosunu izle")}</a></p>}

            <h2>{t("Konum")}</h2>
            <div class="harita-kart"><div class="harita ilan-harita" data-harita></div></div>
            <p class="kucuk">{t("Harita mahalle merkezini gösterir; tam adres görüşmede paylaşılır.")}</p>
          </div>

          <aside class="ilan-sag">
            <div class="kart-kutu fiyat-kutu">
              <div class="buyuk-fiyat"><Fiyat tutar={i.fiyat} pb={i.para_birimi} ek={t(({ toplam: "", aylik: " / ay", sezon: " / sezon", gecelik: " / gece" } as Record<string, string>)[i.fiyat_birimi])} /></div>
              {i.tip === "satilik" && i.net_m2 && <div class="m2-fiyat"><Fiyat tutar={Math.round(i.fiyat / i.net_m2)} pb={i.para_birimi} ek=" / m²" /></div>}
              {i.sezon_fiyatlari && (
                <ul class="sezon-fiyat">
                  <li><span>{t("Yüksek sezon (Tem–Ağu)")}</span><strong>{para(i.sezon_fiyatlari.yuksek, i.para_birimi)}</strong></li>
                  <li><span>{t("Ara sezon")}</span><strong>{para(i.sezon_fiyatlari.omuz, i.para_birimi)}</strong></li>
                  <li><span>{t("Düşük sezon")}</span><strong>{para(i.sezon_fiyatlari.dusuk, i.para_birimi)}</strong></li>
                </ul>
              )}
              {i.komisyon_orani && ["satilik", "kiralik"].includes(i.tip) && (
                <div class="kum-not">{t("Hizmet bedeli: %{n} + KDV (alıcıdan). Gösterilen fiyat ev sahibinin fiyatıdır.", { n: (i.komisyon_orani * 100).toFixed(0) })}</div>
              )}
              {i.bolge_medyani && <p class="kucuk">{t("Bu mahallede benzer ilanların ortanca birim fiyatı:")} {para(i.bolge_medyani)}{i.tip === "kiralik" ? t(" / m² / ay") : " / m²"}{i.iskonto ? ` — ${t("bu ilan {y} altında", { y: yuzde(i.iskonto) })}` : ""}</p>}
              {i.eids_no && <div class="dogrulama"><Onay boyut={15} /> {t("EİDS doğrulanmış ilan")} · {i.eids_no}</div>}
              {i.turizm_izin_no && <div class="dogrulama"><Onay boyut={15} /> {t("Turizm izin belge no:")} {i.turizm_izin_no}</div>}
              {["satilik"].includes(i.tip) && <a href={`/ekspertiz?ilan=${i.ilan_no}`} class="ekspertiz-link">{t("Bu ev için ekspertiz isteyin →")}</a>}
            </div>

            <div class="kart-kutu">
              <h3>{t("Bu ilanla ilgileniyorum")}</h3>
              {gonderildi ? <div class="basari">{t("Teşekkürler! Ekibimiz en kısa sürede size dönecek.")}</div> : (
                <form method="post" action={`/ilan/${i.ilan_no}/talep`} class="form" data-kvkk-form>
                  <input name="ad_soyad" placeholder={t("Ad soyad")} required />
                  <input name="telefon" placeholder={t("Telefon")} type="tel" />
                  <input name="eposta" placeholder={t("E-posta")} type="email" />
                  {["gunluk", "sezonluk"].includes(i.tip) && (
                    <div class="iki">
                      <label>{t("Giriş")}<input type="date" name="giris_tarihi" /></label>
                      <label>{t("Çıkış")}<input type="date" name="cikis_tarihi" /></label>
                    </div>
                  )}
                  {["gunluk", "sezonluk"].includes(i.tip) && <input name="kisi_sayisi" type="number" min="1" placeholder={t("Kişi sayısı")} />}
                  <textarea name="mesaj" placeholder={t("Mesaj")} rows={3}></textarea>
                  <label class="kutu"><input type="checkbox" name="kvkk_onay" value="1" required /><span><a href="/yasal/kvkk" target="_blank">{t("KVKK aydınlatma metnini okudum, kabul ediyorum")}</a> *</span></label>
                  <button class="dugme tam">{t("Gönder")}</button>
                </form>
              )}
            </div>
          </aside>
        </div>

        {benzer.length > 0 && (
          <section class="bolum-ust">
            <h2>{t("Benzer ilanlar")}</h2>
            <div class="kartlar uc-sutun">{benzer.map((b) => <IlanKarti i={b} />)}</div>
          </section>
        )}
      </div>
      <script id="noktalar" type="application/json">{json(i.harita_lat ? [{ lat: i.harita_lat, lng: i.harita_lng }] : [])}</script>
    </Sayfa>,
  );
});

site.post("/ilan/:no{[0-9]+}/talep", async (c) => {
  const no = Number(c.req.param("no"));
  const b = await c.req.parseBody();
  const [i] = await sql`select i.id from ilanlar i where i.ilan_no = ${no} and i.durum = 'yayinda' ${demoKosulu()}`;
  if (!i || b.kvkk_onay !== "1" || !b.ad_soyad || !(b.telefon || b.eposta)) {
    return c.text("Lütfen ad, telefon veya e-posta girip KVKK onayını işaretleyin.", 400);
  }
  const s = (k: string) => (typeof b[k] === "string" && (b[k] as string).trim() ? (b[k] as string).trim().slice(0, 2000) : null);
  await sql`insert into talepler (ilan_id, ad_soyad, telefon, eposta, mesaj, giris_tarihi, cikis_tarihi, kisi_sayisi, kvkk_onay)
            values (${i.id}, ${s("ad_soyad")}, ${s("telefon")}, ${s("eposta")}, ${s("mesaj")},
                    ${s("giris_tarihi")}, ${s("cikis_tarihi")}, ${s("kisi_sayisi") ? Number(s("kisi_sayisi")) : null}, true)`;
  return c.redirect(`/ilan/${no}?talep=ok`);
});


// ---------- Mahalle ----------
site.get("/mahalle/:slug", async (c) => {
  const [m] = await sql<Mahalle[]>`select * from mahalleler where slug = ${c.req.param("slug")}`;
  if (!m) return c.notFound();
  const ilanlar = await ilanAra({ mahalleler: [m.slug] }) as IlanKart[];
  return c.html(
    <Sayfa baslik={`${m.ad}, ${m.ilce}`}>
      <div class="kap bolum">
        <span class="ust-etiket">{m.kiyi ? t("Kıyı mahallesi") : t("İç kesim")}</span>
        <h1>{m.ad}, {m.ilce}</h1>
        <p class="alt-baslik">{t("{n} yayında ilan", { n: ilanlar.length })}</p>
        <div class="kartlar uc-sutun">{ilanlar.map((i) => <IlanKarti i={i} />)}</div>
        {ilanlar.length === 0 && <div class="bos"><p>{t("Bu mahallede şu an yayında ilan yok.")}</p><a href="/ara" class="dugme ikincil">{t("Tüm ilanlar")}</a></div>}
      </div>
    </Sayfa>,
  );
});

// ---------- Evimi listele ----------
site.get("/evimi-listele", async (c) => {
  const mh = await mahalleler();
  const ok = c.req.query("ok") === "1";
  return c.html(
    <Sayfa baslik={t("Evinizi listeleyin")} scriptler={["/js/form.js"]}>
      <div class="liste-sayfa">
        <div class="kap orta-dar">
          <h1>{t("Evinizi listeleyin")}</h1>
          <p class="alt-baslik">{t("Bilgilerinizi bırakın; ekibimiz sizi arayıp süreci anlatsın. Listeleme ücretsizdir.")}</p>
          {ok ? <div class="kart-kutu"><div class="basari">{t("Başvurunuz alındı, teşekkürler! En kısa sürede sizi arayacağız.")}</div></div> : (
            <form method="post" class="kart-kutu form" data-kvkk-form>
              <div class="iki">
                <label>{t("Ad soyad *")}<input name="ad_soyad" required /></label>
                <label>{t("Telefon *")}<input name="telefon" type="tel" required /></label>
              </div>
              <label>{t("E-posta")}<input name="eposta" type="email" /></label>
              <div class="uc">
                <label>{t("Tip")}
                  <select name="tip" required>
                    <option value="satilik">{t("Satılık")}</option><option value="kiralik">{t("Kiralık")}</option>
                    <option value="sezonluk">{t("Sezonluk")}</option><option value="gunluk">{t("Günlük")}</option>
                  </select>
                </label>
                <label>{t("Mahalle")}
                  <select name="mahalle_id"><option value="">—</option>{mh.map((m) => <option value={m.id}>{m.ad}</option>)}</select>
                </label>
                <label>{t("Emlak türü")}
                  <select name="emlak_turu">{Object.entries(TUR_ETIKET).map(([k, v]) => <option value={k}>{t(v)}</option>)}</select>
                </label>
              </div>
              <label>{t("Mesaj")}<textarea name="mesaj" rows={3}></textarea></label>
              <label class="kutu"><input type="checkbox" name="kvkk_onay" value="1" required /><span><a href="/yasal/kvkk" target="_blank">{t("KVKK aydınlatma metnini okudum, kabul ediyorum")}</a> *</span></label>
              <label class="kutu"><input type="checkbox" name="iys_onay" value="1" /><span>{t("Kampanya ve bilgilendirme iletileri almak istiyorum")}</span></label>
              <button class="dugme tam">{t("Gönder")}</button>
            </form>
          )}
        </div>
      </div>
    </Sayfa>,
  );
});

site.post("/evimi-listele", async (c) => {
  const b = await c.req.parseBody();
  const s = (k: string) => (typeof b[k] === "string" && (b[k] as string).trim() ? (b[k] as string).trim().slice(0, 2000) : null);
  const tip = s("tip");
  if (!s("ad_soyad") || !s("telefon") || b.kvkk_onay !== "1" || !["satilik", "kiralik", "sezonluk", "gunluk"].includes(tip ?? "")) {
    return c.text("Lütfen ad, telefon ve KVKK onayını doldurun.", 400);
  }
  await sql`insert into basvurular (ad_soyad, telefon, eposta, tip, mahalle_id, emlak_turu, mesaj, kvkk_onay, iys_onay)
            values (${s("ad_soyad")}, ${s("telefon")}, ${s("eposta")}, ${tip}, ${s("mahalle_id") ? Number(s("mahalle_id")) : null},
                    ${s("emlak_turu")}, ${s("mesaj")}, true, ${b.iys_onay === "1"})`;
  return c.redirect("/evimi-listele?ok=1");
});

// ---------- Sihirbaz ve asistan (istemci tarafında çalışır) ----------
site.get("/sihirbaz", async (c) => {
  const mh = await mahalleler();
  return c.html(
    <Sayfa baslik={t("Size uygun evi bulalım")} harita scriptler={["/js/sihirbaz.js"]}>
      <div class="sihirbaz-kap">
        <div class="sihirbaz" data-sihirbaz>
          <div class="sihirbaz-ilerleme"><div data-ilerleme></div></div>
          <div class="sihirbaz-govde" data-govde><p>{t("Yükleniyor…")}</p></div>
          <div class="sihirbaz-alt">
            <button type="button" class="dugme ikincil" data-geri>{t("Geri")}</button>
            <button type="button" class="metin-dugme" data-atla>{t("Atla")}</button>
          </div>
          <div class="sihirbaz-alternatif">
            <a href="/asistan">{t("Didem'le konuşarak ara")}</a> · <a href="/ara">{t("Filtreleri kendim seçeyim")}</a>
          </div>
        </div>
      </div>
      <script id="mahalleler" type="application/json">{json(mh.map((m) => ({ slug: m.slug, ad: m.ad, lat: m.lat, lng: m.lng })))}</script>
    </Sayfa>,
  );
});

// Didem'in fotoğrafı yalnız geçerli rıza varken verilir; rıza geri alınınca hemen 404 olur.
site.get("/avatar/foto", async (c) => {
  const a = await avatarAyar();
  if (!fotoGosterilir(a)) return c.notFound();
  const veri = await readFile(join(AVATAR_DIZIN, a.foto!)).catch(() => null);
  if (!veri) return c.notFound();
  return c.body(new Uint8Array(veri), 200, { "Content-Type": "image/webp", "Cache-Control": "public, max-age=300" });
});

site.get("/asistan", async (c) => {
  const a = await avatarAyar();
  const klon = klonSesAcik(a);
  const devam = t("Kaldığımız yerden devam edelim.");
  const ayar = {
    mod: klon ? "klon" : "tarayici",
    sabit: klon ? { devam: { metin: devam, imza: await imzala(devam) } } : { devam: { metin: devam, imza: null } },
  };
  return c.html(
    <Sayfa baslik={t("Didem'le konuşarak ara")} scriptler={["/js/asistan.js"]}>
      <div class="asistan-kap" data-asistan>
        <div class="avatar-alan">
          <div class="ai-etiket">{t("Yapay zekâ asistanı — Didem'in görünüşü ve sesiyle")}</div>
          <div class="avatar" data-avatar>
            <img src={fotoGosterilir(a) ? `/avatar/foto?v=${encodeURIComponent(a.foto!)}` : "/img/didem.svg"} alt={t("Didem'in yapay zekâ asistanı")} />
          </div>
          <div class="altyazi" data-altyazi>{t("Merhaba! Başlamak için aşağıdaki düğmeye dokunun.")}</div>
        </div>
        <div class="anlasilan" data-anlasilan></div>
        <div class="secenekler" data-secenekler></div>
        <div class="sohbet" data-sohbet></div>
        <form class="asistan-giris" data-giris>
          <button type="button" class="mikrofon" data-mikrofon aria-label={t("Konuş")}>
            <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"/></svg>
          </button>
          <input name="metin" placeholder={t("Yazın ya da mikrofona dokunup konuşun")} autocomplete="off" />
          <button class="dugme">{t("Gönder")}</button>
        </form>
        <button type="button" class="dugme tam" data-basla>{t("Didem'le konuşmaya başla")}</button>
        <div class="asistan-alt">
          <a href="/sihirbaz">{t("Adım adım sihirbazla devam et")}</a> ·
          <a href="/evimi-listele?gercek=1" data-gercek> {t("Gerçek biriyle konuşmak istiyorum")}</a>
        </div>
      </div>
      <script id="avatar-ayar" type="application/json">{json(ayar)}</script>
    </Sayfa>,
  );
});

// ---------- Yasal (taslak) ----------
export const YASAL: Record<string, [string, string]> = {
  kvkk: ["KVKK Aydınlatma Metni", "Veri sorumlusu: [ŞİRKET UNVANI]. Başvuru ve talep formlarında verdiğiniz ad, telefon ve e-posta bilgileri yalnız talebinizi yanıtlamak ve ilan hizmetini sunmak amacıyla işlenir; yurt içinde barındırma hizmeti sağlayıcılarına ve yazılı açık rızanızla yurt dışındaki hizmet sağlayıcılara aktarılabilir. Verileriniz amaç için gerekli süre boyunca saklanır. KVKK m.11 kapsamındaki haklarınız için [e-posta] adresine başvurabilirsiniz."],
  cerez: ["Çerez Politikası", "Bu site yalnız oturum için zorunlu çerez kullanır. Analitik veya reklam çerezi kullanılmaz."],
  "acik-riza": ["Açık Rıza Metni", "[ŞİRKET UNVANI] tarafından, talebimi yanıtlamak ve ilan hizmetinin sunulması amacıyla, yurt dışındaki hizmet sağlayıcılara aktarım dahil kişisel verilerimin işlenmesine açık rıza veriyorum. Rızamı dilediğim zaman [e-posta] adresine yazarak geri alabilirim."],
  iys: ["Ticari Elektronik İleti Onay Metni", "[ŞİRKET UNVANI] tarafından kampanya, yeni ilan ve bilgilendirme amaçlı ticari elektronik iletilerin (SMS, e-posta, arama) tarafıma gönderilmesine onay veriyorum. Onayımı İleti Yönetim Sistemi (İYS) üzerinden ya da [e-posta] adresine yazarak dilediğim zaman geri alabilirim."],
  kullanim: ["Kullanım Koşulları", "İlan bilgileri ev sahiplerinin beyanına dayanır. Yapay zekâ ile üretilen içerikler (çeviriler, temsili görseller, asistan yanıtları) bilgi amaçlıdır; karar vermeden önce mülkü yerinde görün ve tapu kaydını kontrol edin."],
};
site.get("/yasal/:sayfa", (c) => {
  const s = YASAL[c.req.param("sayfa")];
  if (!s) return c.notFound();
  return c.html(
    <Sayfa baslik={t(s[0])}>
      <div class="kap dar bolum">
        {dil() !== "tr" && <div class="bilgi">{t("Bu sayfa şimdilik yalnızca Türkçe.")}</div>}
        {!siteAyar().hukuk_onayli && <div class="uyari">{t("TASLAK — hukuki inceleme bekliyor")}</div>}
        <h1>{t(s[0])}</h1>
        <p>{yerTutucu(s[1])}</p>
        {siteAyar().unvan && (
          <p class="kucuk">{siteAyar().unvan}{siteAyar().adres && <> · {siteAyar().adres}</>}{siteAyar().mersis && <> · MERSİS {siteAyar().mersis}</>}
            {siteAyar().kep && <> · KEP {siteAyar().kep}</>}</p>
        )}
      </div>
    </Sayfa>,
  );
});


import { Hono } from "hono";
import { sql } from "../db.js";
import { filtreOku, gevsetmeOnerisi, ilanAra, type IlanKart } from "../lib/arama.js";
import { fiyatMetni, ODA_ETIKET, para, TIP_ETIKET, TUR_ETIKET, yuzde } from "../lib/bicim.js";
import { IlanKarti, json, Sayfa } from "../views/layout.js";

export const site = new Hono();

type Mahalle = { id: number; slug: string; ad: string; ilce: string; segment: string; lat: number; lng: number; kiyi: boolean };
const mahalleler = () => sql<Mahalle[]>`select id, slug, ad, ilce, segment, lat, lng, kiyi from mahalleler order by ilce, ad`;

const ORNEKLER = [
  "Bitez'de denize yakın havuzlu 2+1 satılık",
  "Ağustosta 6 kişilik, gecesi 8 binin altında tatil evi",
  "Konacık'ta yıllık kiralık 3+1",
  "Yalıkavak'ta sezonluk deniz manzaralı villa",
];

function AramaKutusu({ deger = "", buyuk = false }: { deger?: string; buyuk?: boolean }) {
  return (
    <form class={`arama-kutu ${buyuk ? "buyuk" : ""}`} data-sesli-arama action="/ara" method="get">
      <input name="q" value={deger} placeholder="Ne arıyorsunuz? Örn. Bitez'de havuzlu 2+1 satılık" autocomplete="off" />
      <button type="button" class="mikrofon" data-mikrofon aria-label="Sesli ara" hidden>
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"/></svg>
      </button>
      <button type="submit" class="ara-dugme">Ara</button>
      <div class="arama-durum" data-durum></div>
    </form>
  );
}

// ---------- Ana sayfa ----------
site.get("/", async (c) => {
  const [firsatlar, mh, sayilar] = await Promise.all([
    ilanAra({ siralama: "en_firsat" }, { limit: 6 }) as Promise<IlanKart[]>,
    mahalleler(),
    sql<{ tip: string; n: number }[]>`select tip, count(*)::int as n from ilanlar where durum = 'yayinda' group by tip`,
  ]);
  const sayi = Object.fromEntries(sayilar.map((r) => [r.tip, r.n]));
  return c.html(
    <Sayfa scriptler={["/js/sesli-arama.js"]}>
      <section class="hero">
        <div class="kap hero-ic">
          <h1>Bodrum'da evi <em>sahibinden</em>, doğru fiyattan bulun</h1>
          <p>Yalnız sahibinin yetki verdiği, doğrulanmış ilanlar. Söyleyin, gerisini biz bulalım.</p>
          <AramaKutusu buyuk />
          <div class="ornekler">
            {ORNEKLER.map((o) => <button type="button" class="cip" data-ornek={o}>{o}</button>)}
          </div>
          <div class="hero-alternatif">
            <a href="/sihirbaz" class="dugme ikincil">Adım adım arayalım</a>
            <a href="/asistan" class="dugme ikincil">Didem'le konuşarak ara</a>
          </div>
        </div>
      </section>

      <section class="kap tipler">
        {(["satilik", "kiralik", "sezonluk", "gunluk"] as const).map((t) => (
          <a href={`/ara?tip=${t}`} class={`tip-karti tip-${t}`}>
            <strong>{TIP_ETIKET[t]}</strong>
            <span>{sayi[t] ?? 0} ilan</span>
          </a>
        ))}
      </section>

      <section class="kap bolum">
        <div class="bolum-bas">
          <h2>Haftanın fırsatları</h2>
          <a href="/ara?siralama=en_firsat">Tümü →</a>
        </div>
        <div class="kartlar">{firsatlar.map((i) => <IlanKarti i={i} />)}</div>
      </section>

      <section class="kap bolum">
        <h2>Mahalleler</h2>
        <div class="mahalleler">
          {mh.map((m) => (
            <a href={`/mahalle/${m.slug}`} class="mahalle-karti">
              <strong>{m.ad}</strong><span>{m.ilce}{m.kiyi ? " · kıyı" : ""}</span>
            </a>
          ))}
        </div>
      </section>

      <section class="bant">
        <div class="kap bant-ic">
          <div>
            <h2>Evinizi ücretsiz listeleyin</h2>
            <p>Türkçe, İngilizce, Rusça ve Almanca yayınlayalım; yerli ve yabancı alıcıya ulaştıralım.</p>
          </div>
          <a href="/evimi-listele" class="dugme">Evimi listele</a>
        </div>
      </section>
    </Sayfa>,
  );
});

// ---------- Arama ----------
site.get("/ara", async (c) => {
  const q = new URL(c.req.url).searchParams;
  const f = filtreOku(q);
  const metin = q.get("q") ?? "";
  const [sonuclar, mh] = await Promise.all([ilanAra(f) as Promise<IlanKart[]>, mahalleler()]);
  const oneri = sonuclar.length === 0 ? await gevsetmeOnerisi(f) : null;
  const secili = (k: string, v: string) => (Array.isArray((f as any)[k]) ? (f as any)[k].includes(v) : (f as any)[k] === v);

  return c.html(
    <Sayfa baslik="Ara" harita scriptler={["/js/sesli-arama.js", "/js/ara.js"]}>
      <div class="kap ara-ust">
        <AramaKutusu deger={metin} />
        <div class="ara-ozet" data-ozet hidden></div>
        <div class="ara-linkler">
          <a href="/sihirbaz">Sihirbazla yeniden ara</a> · <a href="/asistan">Didem'le konuş</a>
          <button type="button" class="filtre-ac" data-filtre-ac>Filtreler</button>
        </div>
      </div>
      <div class="kap ara-govde">
        <form class="filtre-panel" method="get" action="/ara" data-filtre-panel>
          <div class="panel-bas"><strong>Filtreler</strong><button type="button" data-filtre-kapat>✕</button></div>
          <label>Tip
            <select name="tip">
              <option value="">Hepsi</option>
              {Object.entries(TIP_ETIKET).map(([k, v]) => <option value={k} selected={f.tip === k}>{v}</option>)}
            </select>
          </label>
          <fieldset><legend>Mahalle</legend>
            <div class="secim-izgara">
              {mh.map((m) => (
                <label class="kutu"><input type="checkbox" name="mahalleler" value={m.slug} checked={secili("mahalleler", m.slug)} />{m.ad}</label>
              ))}
            </div>
          </fieldset>
          <div class="iki">
            <label>En az fiyat<input type="number" name="min_fiyat" value={f.min_fiyat ?? ""} min="0" /></label>
            <label>En çok fiyat<input type="number" name="max_fiyat" value={f.max_fiyat ?? ""} min="0" /></label>
          </div>
          <label>Para birimi
            <select name="para_birimi">
              {["TRY", "EUR", "USD", "GBP"].map((p) => <option selected={(f.para_birimi ?? "TRY") === p}>{p}</option>)}
            </select>
          </label>
          <fieldset><legend>Oda</legend>
            <div class="secim-satir">
              {["1+1", "2+1", "3+1", "4+1"].map((o) => (
                <label class="kutu"><input type="checkbox" name="oda" value={o} checked={secili("oda", o)} />{o === "4+1" ? "4+1 ve üzeri" : o}</label>
              ))}
            </div>
          </fieldset>
          <div class="iki">
            <label>En az m²<input type="number" name="min_net_m2" value={f.min_net_m2 ?? ""} min="0" /></label>
            <label>Kişi sayısı<input type="number" name="min_kapasite" value={f.min_kapasite ?? ""} min="1" /></label>
          </div>
          <label>Havuz
            <select name="havuz">
              <option value="">Fark etmez</option>
              <option value="herhangi" selected={f.havuz === "herhangi"}>Havuzlu</option>
              <option value="ozel" selected={f.havuz === "ozel"}>Özel havuz</option>
            </select>
          </label>
          <label>Denize en fazla (m)<input type="number" name="max_denize_mesafe_m" value={f.max_denize_mesafe_m ?? ""} min="0" step="100" /></label>
          <div class="secim-satir">
            <label class="kutu"><input type="checkbox" name="deniz_manzarasi" value="1" checked={!!f.deniz_manzarasi} />Deniz manzarası</label>
            <label class="kutu"><input type="checkbox" name="site_ici" value="1" checked={!!f.site_ici} />Site içi</label>
            <label class="kutu"><input type="checkbox" name="esyali" value="1" checked={!!f.esyali} />Eşyalı</label>
            <label class="kutu"><input type="checkbox" name="evcil_hayvan" value="1" checked={!!f.evcil_hayvan} />Evcil hayvan</label>
            <label class="kutu"><input type="checkbox" name="sadece_firsat" value="1" checked={!!f.sadece_firsat} />Sadece fırsatlar</label>
          </div>
          <div class="iki">
            <label>Giriş<input type="date" name="giris_tarihi" value={f.giris_tarihi ?? ""} /></label>
            <label>Çıkış<input type="date" name="cikis_tarihi" value={f.cikis_tarihi ?? ""} /></label>
          </div>
          <label>Sıralama
            <select name="siralama">
              {[["onerilen", "Önerilen"], ["fiyat_artan", "Fiyat (artan)"], ["fiyat_azalan", "Fiyat (azalan)"], ["en_yeni", "En yeni"], ["en_firsat", "En fırsat"]]
                .map(([k, v]) => <option value={k} selected={(f.siralama ?? "onerilen") === k}>{v}</option>)}
            </select>
          </label>
          <button class="dugme tam">Uygula</button>
          <a href="/ara" class="temizle">Temizle</a>
        </form>

        <section class="sonuclar">
          <div class="sonuc-bas"><strong>{sonuclar.length} ilan</strong></div>
          {sonuclar.length === 0 && (
            <div class="bos">
              <p>Bu kriterlere uyan ilan yok.</p>
              {oneri && <p><strong>{oneri.alan}</strong> kriterini gevşetirseniz {oneri.sayi} ilan çıkıyor.</p>}
              <a href="/sihirbaz" class="dugme ikincil">Sihirbazla yeniden dene</a>
            </div>
          )}
          <div id="harita" class="harita" data-noktalar={JSON.stringify(sonuclar.filter((i) => i.lat).map((i) => ({
            lat: i.lat, lng: i.lng, no: i.ilan_no, baslik: i.baslik, fiyat: fiyatMetni(i),
          })))}></div>
          <div class="kartlar">{sonuclar.map((i) => <IlanKarti i={i} />)}</div>
        </section>
      </div>
      <script id="filtreler" type="application/json">{json(f)}</script>
    </Sayfa>,
  );
});

// ---------- İlan detay ----------
site.get("/ilan/:no{[0-9]+}", async (c) => {
  const no = Number(c.req.param("no"));
  const [i] = await sql`
    select i.*, m.ad as mahalle, m.slug as mahalle_slug, coalesce(i.lat, m.lat) as harita_lat, coalesce(i.lng, m.lng) as harita_lng
    from ilanlar i left join mahalleler m on m.id = i.mahalle_id
    where i.ilan_no = ${no} and i.durum = 'yayinda'`;
  if (!i) return c.notFound();
  const fotolar = await sql<{ url: string; oda_etiketi: string | null }[]>`
    select url, oda_etiketi from ilan_fotolari where ilan_id = ${i.id} order by sira`;
  const benzer = (await ilanAra({ tip: i.tip, mahalleler: i.mahalle_slug ? [i.mahalle_slug] : undefined }, { limit: 4 }) as IlanKart[])
    .filter((x) => x.id !== i.id).slice(0, 3);
  const odalar = [...new Set(fotolar.map((f) => f.oda_etiketi).filter(Boolean))] as string[];
  const gonderildi = c.req.query("talep") === "ok";

  const ozellikler: [string, string | null][] = [
    ["Tip", TIP_ETIKET[i.tip]], ["Tür", TUR_ETIKET[i.emlak_turu]], ["Oda", i.oda],
    ["Net m²", i.net_m2 ? `${i.net_m2} m²` : null], ["Brüt m²", i.brut_m2 ? `${i.brut_m2} m²` : null],
    ["Banyo", i.banyo], ["Kapasite", i.yatak_kapasitesi ? `${i.yatak_kapasitesi} kişi` : null],
    ["Kat", i.kat], ["Bina yaşı", i.bina_yasi], ["Havuz", { ozel: "Özel", ortak: "Ortak", yok: "Yok" }[i.havuz as string] ?? null],
    ["Deniz manzarası", i.deniz_manzarasi ? "Var" : "Yok"], ["Denize mesafe", i.denize_mesafe_m ? `${i.denize_mesafe_m} m` : null],
    ["Site içi", i.site_ici ? "Evet" : "Hayır"], ["Eşyalı", i.esyali ? "Evet" : "Hayır"],
    ["Evcil hayvan", i.evcil_hayvan == null ? null : i.evcil_hayvan ? "Kabul" : "Kabul edilmiyor"],
    ["Minimum gece", i.min_gece], ["Sezon", i.sezon_baslangic ? `${new Date(i.sezon_baslangic).toLocaleDateString("tr-TR")} – ${new Date(i.sezon_bitis).toLocaleDateString("tr-TR")}` : null],
  ];

  return c.html(
    <Sayfa baslik={i.baslik} aciklama={i.aciklama.slice(0, 155)} harita scriptler={["/js/ilan.js"]}>
      <div class="kap ilan">
        <div class="ilan-ust">
          <div>
            <div class="kart-yer"><a href={`/mahalle/${i.mahalle_slug}`}>{i.mahalle}</a> · {TIP_ETIKET[i.tip]}</div>
            <h1>{i.baslik}</h1>
            {i.demo && <span class="rozet demo satir">DEMO — örnek ilan</span>}
          </div>
        </div>

        <div class="galeri" data-galeri>
          {odalar.length > 1 && (
            <div class="galeri-sekme">
              <button class="aktif" data-oda="">Tümü</button>
              {odalar.map((o) => <button data-oda={o}>{ODA_ETIKET[o] ?? o}</button>)}
            </div>
          )}
          {fotolar.length ? (
            <div class="galeri-izgara">
              {fotolar.map((f) => <a href={f.url} target="_blank" data-oda-etiket={f.oda_etiketi ?? ""}><img src={f.url} alt={ODA_ETIKET[f.oda_etiketi ?? ""] ?? i.baslik} loading="lazy" /></a>)}
            </div>
          ) : <div class="galeri-bos">{TUR_ETIKET[i.emlak_turu]} · fotoğraflar yakında</div>}
        </div>

        <div class="ilan-govde">
          <div>
            <h2>Açıklama</h2>
            <p class="aciklama">{i.aciklama}</p>
            <h2>Özellikler</h2>
            <dl class="ozellikler">
              {ozellikler.filter(([, v]) => v != null && v !== "").map(([k, v]) => <><dt>{k}</dt><dd>{v}</dd></>)}
            </dl>
            <h2>Konum</h2>
            <div id="harita" class="harita kucuk" data-noktalar={JSON.stringify(i.harita_lat ? [{ lat: i.harita_lat, lng: i.harita_lng, baslik: i.mahalle }] : [])}></div>
            <p class="kucuk">Harita mahalle merkezini gösterir; tam adres görüşmede paylaşılır.</p>
          </div>

          <aside class="fiyat-kutu">
            <div class="buyuk-fiyat">{fiyatMetni(i as any)}</div>
            {i.sezon_fiyatlari && (
              <ul class="sezon-fiyat">
                <li>Yüksek sezon (Tem–Ağu): {para(i.sezon_fiyatlari.yuksek, i.para_birimi)} / gece</li>
                <li>Ara sezon (May–Haz, Eyl–Eki): {para(i.sezon_fiyatlari.omuz, i.para_birimi)} / gece</li>
                <li>Düşük sezon: {para(i.sezon_fiyatlari.dusuk, i.para_birimi)} / gece</li>
              </ul>
            )}
            {i.tip === "satilik" && i.net_m2 && <div class="kucuk">{para(Math.round(i.fiyat / i.net_m2), i.para_birimi)} / m²</div>}
            {i.bolge_medyani && <div class="bilgi">Bu mahallede benzer ilanların ortanca birim fiyatı: {para(i.bolge_medyani)}{i.tip === "kiralik" ? " / m² / ay" : " / m²"}{i.iskonto ? ` — bu ilan ${yuzde(i.iskonto)} altında` : ""}</div>}
            {i.komisyon_orani && ["satilik", "kiralik"].includes(i.tip) && (
              <div class="bilgi">Hizmet bedeli: %{(i.komisyon_orani * 100).toFixed(0)} + KDV (alıcıdan). Gösterilen fiyat ev sahibinin fiyatıdır.</div>
            )}
            {i.eids_no && <div class="dogrulama">✓ EİDS doğrulanmış ilan · {i.eids_no}</div>}
            {i.turizm_izin_no && <div class="dogrulama">✓ Turizm izin belge no: {i.turizm_izin_no}</div>}

            <h3>Bu ilanla ilgileniyorum</h3>
            {gonderildi ? <div class="basari">Teşekkürler! Ekibimiz en kısa sürede size dönecek.</div> : (
              <form method="post" action={`/ilan/${i.ilan_no}/talep`} class="form">
                <input name="ad_soyad" placeholder="Ad soyad" required />
                <input name="telefon" placeholder="Telefon" type="tel" />
                <input name="eposta" placeholder="E-posta" type="email" />
                {["gunluk", "sezonluk"].includes(i.tip) && (
                  <div class="iki">
                    <label>Giriş<input type="date" name="giris_tarihi" /></label>
                    <label>Çıkış<input type="date" name="cikis_tarihi" /></label>
                  </div>
                )}
                {["gunluk", "sezonluk"].includes(i.tip) && <input name="kisi_sayisi" type="number" min="1" placeholder="Kişi sayısı" />}
                <textarea name="mesaj" placeholder="Mesajınız (isteğe bağlı)" rows={3}></textarea>
                <label class="kutu"><input type="checkbox" name="kvkk_onay" value="1" required /> <span><a href="/yasal/kvkk" target="_blank">KVKK aydınlatma metnini</a> okudum, kabul ediyorum.</span></label>
                <button class="dugme tam">Gönder</button>
              </form>
            )}
          </aside>
        </div>

        {benzer.length > 0 && (
          <section class="bolum">
            <h2>Benzer ilanlar</h2>
            <div class="kartlar">{benzer.map((b) => <IlanKarti i={b} />)}</div>
          </section>
        )}
      </div>
    </Sayfa>,
  );
});

site.post("/ilan/:no{[0-9]+}/talep", async (c) => {
  const no = Number(c.req.param("no"));
  const b = await c.req.parseBody();
  const [i] = await sql`select id from ilanlar where ilan_no = ${no} and durum = 'yayinda'`;
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
    <Sayfa baslik={`${m.ad} — ${m.ilce}`}>
      <div class="kap bolum">
        <h1>{m.ad}, {m.ilce}</h1>
        <p class="kucuk">{m.kiyi ? "Kıyı mahallesi" : "İç kesim"} · segment: {m.segment}</p>
        <div class="kartlar">{ilanlar.map((i) => <IlanKarti i={i} />)}</div>
        {ilanlar.length === 0 && <p>Bu mahallede şu an yayında ilan yok.</p>}
      </div>
    </Sayfa>,
  );
});

// ---------- Evimi listele ----------
site.get("/evimi-listele", async (c) => {
  const mh = await mahalleler();
  const ok = c.req.query("ok") === "1";
  return c.html(
    <Sayfa baslik="Evimi listele">
      <div class="kap dar bolum">
        <h1>Evinizi ücretsiz listeleyelim</h1>
        <p>Evinizi dört dilde yayınlayıp yerli ve yabancı alıcıya ulaştıralım; size bölge fiyat analizi de gönderelim.
          Formu doldurun, ekibimiz sizi arasın.</p>
        {ok ? <div class="basari">Başvurunuz alındı, teşekkürler! En kısa sürede sizi arayacağız.</div> : (
          <form method="post" class="form">
            <input name="ad_soyad" placeholder="Ad soyad" required />
            <input name="telefon" placeholder="Telefon" type="tel" required />
            <input name="eposta" placeholder="E-posta (isteğe bağlı)" type="email" />
            <div class="iki">
              <label>Ne yapmak istiyorsunuz?
                <select name="tip" required>
                  <option value="satilik">Satmak</option><option value="kiralik">Yıllık kiraya vermek</option>
                  <option value="sezonluk">Sezonluk kiraya vermek</option><option value="gunluk">Günlük / tatil kirası</option>
                </select>
              </label>
              <label>Mahalle
                <select name="mahalle_id"><option value="">Seçin</option>{mh.map((m) => <option value={m.id}>{m.ad} ({m.ilce})</option>)}</select>
              </label>
            </div>
            <label>Emlak türü
              <select name="emlak_turu">{Object.entries(TUR_ETIKET).map(([k, v]) => <option value={k}>{v}</option>)}</select>
            </label>
            <textarea name="mesaj" rows={4} placeholder="Eviniz hakkında kısaca (oda sayısı, m², havuz, fiyat beklentiniz…)"></textarea>
            <label class="kutu"><input type="checkbox" name="kvkk_onay" value="1" required /><span><a href="/yasal/kvkk" target="_blank">KVKK aydınlatma metnini</a> okudum, kabul ediyorum.</span></label>
            <label class="kutu"><input type="checkbox" name="iys_onay" value="1" /><span>Kampanya ve bilgilendirme iletileri almak istiyorum (isteğe bağlı).</span></label>
            <button class="dugme tam">Başvur</button>
          </form>
        )}
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
    <Sayfa baslik="Size uygun evi bulalım" harita scriptler={["/js/sihirbaz.js"]} asistanDugmesi={false}>
      <div class="sihirbaz-kap">
        <div class="sihirbaz" data-sihirbaz>
          <div class="sihirbaz-ilerleme"><div data-ilerleme></div></div>
          <div class="sihirbaz-govde" data-govde><p>Yükleniyor…</p></div>
          <div class="sihirbaz-alt">
            <button type="button" class="dugme ikincil" data-geri>Geri</button>
            <button type="button" class="metin-dugme" data-atla>Atla</button>
          </div>
          <div class="sihirbaz-alternatif">
            <a href="/asistan">Didem'le konuşarak ara</a> · <a href="/ara">Filtreleri kendim seçeyim</a>
          </div>
        </div>
      </div>
      <script id="mahalleler" type="application/json">{json(mh.map((m) => ({ slug: m.slug, ad: m.ad, lat: m.lat, lng: m.lng })))}</script>
    </Sayfa>,
  );
});

site.get("/asistan", (c) =>
  c.html(
    <Sayfa baslik="Didem'le konuşarak ara" scriptler={["/js/asistan.js"]} asistanDugmesi={false}>
      <div class="asistan-kap" data-asistan>
        <div class="avatar-alan">
          <div class="ai-etiket">Yapay zekâ asistanı — Didem'in görünüşü ve sesiyle</div>
          <div class="avatar" data-avatar><img src="/img/didem.svg" alt="Didem'in yapay zekâ asistanı" /></div>
          <div class="altyazi" data-altyazi>Merhaba! Başlamak için aşağıdaki düğmeye dokunun.</div>
        </div>
        <div class="anlasilan" data-anlasilan></div>
        <div class="secenekler" data-secenekler></div>
        <div class="sohbet" data-sohbet></div>
        <form class="asistan-giris" data-giris>
          <button type="button" class="mikrofon" data-mikrofon aria-label="Konuş">
            <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"/></svg>
          </button>
          <input name="metin" placeholder="Yazın ya da mikrofona dokunup konuşun" autocomplete="off" />
          <button class="dugme">Gönder</button>
        </form>
        <button type="button" class="dugme tam" data-basla>Didem'le konuşmaya başla</button>
        <div class="asistan-alt">
          <a href="/sihirbaz">Adım adım sihirbazla devam et</a> ·
          <a href="/evimi-listele?gercek=1" data-gercek> Gerçek biriyle konuşmak istiyorum</a>
        </div>
      </div>
    </Sayfa>,
  ),
);

// ---------- Yasal (taslak) ----------
const YASAL: Record<string, [string, string]> = {
  kvkk: ["KVKK Aydınlatma Metni", "Veri sorumlusu: [ŞİRKET UNVANI]. Başvuru ve talep formlarında verdiğiniz ad, telefon ve e-posta bilgileri yalnız talebinizi yanıtlamak ve ilan hizmetini sunmak amacıyla işlenir; yurt içinde barındırma hizmeti sağlayıcılarına ve yazılı açık rızanızla yurt dışındaki hizmet sağlayıcılara aktarılabilir. Verileriniz amaç için gerekli süre boyunca saklanır. KVKK m.11 kapsamındaki haklarınız için [e-posta] adresine başvurabilirsiniz."],
  cerez: ["Çerez Politikası", "Bu site yalnız oturum için zorunlu çerez kullanır. Analitik veya reklam çerezi kullanılmaz."],
  kullanim: ["Kullanım Koşulları", "İlan bilgileri ev sahiplerinin beyanına dayanır. Yapay zekâ ile üretilen içerikler (çeviriler, temsili görseller, asistan yanıtları) bilgi amaçlıdır; karar vermeden önce mülkü yerinde görün ve tapu kaydını kontrol edin."],
};
site.get("/yasal/:sayfa", (c) => {
  const s = YASAL[c.req.param("sayfa")];
  if (!s) return c.notFound();
  return c.html(
    <Sayfa baslik={s[0]}>
      <div class="kap dar bolum">
        <div class="uyari">TASLAK — hukuki inceleme bekliyor</div>
        <h1>{s[0]}</h1>
        <p>{s[1]}</p>
      </div>
    </Sayfa>,
  );
});


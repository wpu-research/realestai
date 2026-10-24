import { Hono } from "hono";
import { dil, t } from "../lib/dil.js";
import { sql } from "../db.js";
import { KUR } from "../lib/arama.js";
import { para } from "../lib/bicim.js";
import { Sayfa } from "../views/layout.js";

// Emlak endeksi, kredi hesaplama, bana emlakçı bul, rehberler ve kaydedilenler.
export const araclar = new Hono();

const tlCarpani = sql`case para_birimi when 'EUR' then ${KUR.EUR}::numeric when 'USD' then ${KUR.USD}::numeric
  when 'GBP' then ${KUR.GBP}::numeric else 1 end`;

// ---------- Kaydedilenler (tarayıcıda tutulur; sayfa istemcide çizilir) ----------
araclar.get("/kaydedilenler", (c) =>
  c.html(
    <Sayfa baslik={t("Kaydedilenler")} scriptler={["/js/kaydedilenler.js"]}>
      <div class="kap bolum">
        <h1>{t("Kaydedilenler")}</h1>
        <p class="alt-baslik">{t("Kaydettiğiniz ilanlar ve aramalar bu cihazda saklanır.")}</p>
        <h2>{t("Kayıtlı aramalar")}</h2>
        <div class="kayitli-aramalar" data-aramalar><p class="kucuk">{t("Yükleniyor…")}</p></div>
        <h2 class="bolum-ust">{t("Kayıtlı ilanlar")}</h2>
        <div class="kartlar uc-sutun" data-ilanlar></div>
        <div class="bos" data-bos hidden><p>{t("Henüz ilan kaydetmediniz. İlanlardaki ♡ simgesine dokunarak kaydedebilirsiniz.")}</p><a href="/ara" class="dugme ikincil">{t("İlanlara göz at")}</a></div>
      </div>
    </Sayfa>,
  ),
);

// ---------- Emlak endeksi ----------
type EndeksSatiri = { mahalle: string; ilce: string; slug: string; tip: string; adet: number; medyan: number | null;
  son90: number | null; onceki90: number | null };

araclar.get("/endeks", async (c) => {
  // Yayındaki ilanlar + radarın gözlediği piyasa ilanları (adaylar), TL / net m². Satılık: toplam; kiralık: aylık.
  const satirlar = await sql<EndeksSatiri[]>`
    with gozlem as (
      select i.mahalle_id, i.tip::text as tip, i.fiyat * ${tlCarpani} / nullif(i.net_m2, 0) as birim, i.yayinlandi_at as zaman
      from ilanlar i where i.durum = 'yayinda' and i.tip in ('satilik', 'kiralik') and i.net_m2 > 0
      union all
      select a.mahalle_id, a.tip::text, a.fiyat * ${tlCarpani} / nullif(a.net_m2, 0), a.created_at
      from adaylar a where a.tip in ('satilik', 'kiralik') and a.net_m2 > 0 and a.fiyat > 0 and a.durum <> 'emlakci_cikti'
    )
    select m.ad as mahalle, m.ilce, m.slug, g.tip, count(*)::int as adet,
           percentile_cont(0.5) within group (order by g.birim) as medyan,
           percentile_cont(0.5) within group (order by g.birim) filter (where g.zaman >= now() - interval '90 days') as son90,
           percentile_cont(0.5) within group (order by g.birim) filter (where g.zaman < now() - interval '90 days'
                                                                     and g.zaman >= now() - interval '180 days') as onceki90
    from gozlem g join mahalleler m on m.id = g.mahalle_id
    group by m.ad, m.ilce, m.slug, g.tip
    order by m.ilce, m.ad`;
  const tablo = (tip: string) => satirlar.filter((r) => r.tip === tip);
  const degisim = (r: EndeksSatiri) => {
    if (r.son90 == null || r.onceki90 == null) return null;
    return (r.son90 - r.onceki90) / r.onceki90;
  };

  const Tablo = ({ tip, birim }: { tip: string; birim: string }) => (
    <div class="tablo-sarmal">
      <table class="endeks-tablo">
        <thead><tr><th>{t("Mahalle")}</th><th>{t("Ortanca")} {birim}</th><th>{t("Son 90 gün değişim")}</th><th>{t("Gözlem")}</th></tr></thead>
        <tbody>
          {tablo(tip).map((r) => {
            const d = degisim(r);
            return (
              <tr>
                <td><a href={`/ara?tip=${tip}&mahalleler=${r.slug}`}>{r.mahalle}</a> <span class="kucuk">{r.ilce}</span></td>
                <td><strong>{r.medyan ? para(Math.round(r.medyan)) : "—"}</strong></td>
                <td class={d == null ? "" : d >= 0 ? "artis" : "azalis"}>{d == null ? <span class="kucuk">{t("veri birikiyor")}</span> : `${d >= 0 ? "▲" : "▼"} %${Math.abs(d * 100).toFixed(1)}`}</td>
                <td>{r.adet}{r.adet < 5 && <span class="kucuk"> {t("· az veri")}</span>}</td>
              </tr>
            );
          })}
          {tablo(tip).length === 0 && <tr><td colspan={4} class="kucuk">{t("Henüz yeterli veri yok.")}</td></tr>}
        </tbody>
      </table>
    </div>
  );

  return c.html(
    <Sayfa baslik={t("Emlak endeksi")}>
      <div class="kap bolum">
        <span class="ust-etiket">{t("Kiralarken · Satın alırken")}</span>
        <h1>{t("Emlak endeksi")}</h1>
        <p class="alt-baslik">{t("Bodrum ve çevresinde mahalle mahalle ortanca metrekare fiyatları ve son 90 günlük değişim.")}</p>
        <h2>{t("Satılık · TL / net m²")}</h2>
        <Tablo tip="satilik" birim="₺ / m²" />
        <h2 class="bolum-ust">{t("Kiralık · TL / net m² / ay")}</h2>
        <Tablo tip="kiralik" birim={`₺ / m² / ${t("ay")}`} />
        <div class="bilgi">
          {t("Endeks, sitemizdeki yayındaki ilanlarla ekibimizin bölgede gözlediği güncel ilan fiyatlarından hesaplanır; satış değil, istenen fiyat ortancasıdır. Gözlem sayısı 5'ten az olan mahallelerde sonuçlar yanıltıcı olabilir.")}{" "}
          <a href="/ekspertiz">{t("Kesin değer için gayrimenkul ekspertizi yaptırın.")}</a>
        </div>
      </div>
    </Sayfa>,
  );
});

// ---------- Kredi hesapla ----------
araclar.get("/kredi", (c) =>
  c.html(
    <Sayfa baslik={t("Konut kredisi hesapla")} scriptler={["/js/kredi.js"]}>
      <div class="kap bolum">
        <span class="ust-etiket">{t("Kredi")}</span>
        <h1>{t("Konut kredisi hesapla")}</h1>
        <p class="alt-baslik">{t("Ev fiyatı, peşinat, vade ve faiz oranına göre aylık taksidinizi hesaplayın.")}</p>
        <div class="kredi-izgara">
          <form class="kart-kutu form" data-kredi>
            <label>{t("Ev fiyatı (₺)")}<input type="number" name="fiyat" min="0" step="10000" value={c.req.query("fiyat") ?? ""} required /></label>
            <label>{t("Peşinat (₺)")}<input type="number" name="pesinat" min="0" step="10000" /></label>
            <div class="iki">
              <label>{t("Vade (ay)")}
                <select name="vade">{[12, 24, 36, 48, 60, 84, 96, 120, 180, 240].map((v) => <option value={v} selected={v === 120}>{v} {t("ay")}</option>)}</select>
              </label>
              <label>{t("Aylık faiz oranı (%)")}<input type="number" name="faiz" min="0" max="20" step="0.01" placeholder={t("Bankanızın oranı")} required /></label>
            </div>
            <p class="kucuk">{t("Güncel faiz oranını bankanızdan öğrenip yazın; oranlar sık değişir.")}</p>
          </form>
          <div class="kart-kutu kredi-sonuc" data-sonuc>
            <div class="sonuc-satir"><span>{t("Kredi tutarı")}</span><strong data-k="tutar">—</strong></div>
            <div class="sonuc-satir buyuk"><span>{t("Aylık taksit")}</span><strong data-k="taksit">—</strong></div>
            <div class="sonuc-satir"><span>{t("Toplam geri ödeme")}</span><strong data-k="toplam">—</strong></div>
            <div class="sonuc-satir"><span>{t("Toplam faiz")}</span><strong data-k="faiz">—</strong></div>
            <div class="sonuc-satir"><span>{t("Peşinat oranı")}</span><strong data-k="oran">—</strong></div>
            <details class="odeme-plani"><summary>{t("Ödeme planı (ilk 12 ay)")}</summary><div data-plan></div></details>
          </div>
        </div>
        <div class="bilgi">
          {t("Hesaplama eşit taksitli kredi formülüyle yapılır ve bilgi amaçlıdır. Bireysel konut kredilerinde KKDF ve BSMV genellikle uygulanmaz; ekspertiz ücreti, konut ve DASK sigortası, tapu masrafları ayrıca ödenir. Bankaların kullandırabileceği kredi/değer oranı düzenlemelerle değişir; kesin teklif için bankanızla görüşün.")}
        </div>
      </div>
    </Sayfa>,
  ),
);

// ---------- Bana emlakçı bul ----------
araclar.get("/emlakci-bul", (c) => {
  const ok = c.req.query("ok") === "1";
  return c.html(
    <Sayfa baslik={t("Bana emlakçı bul")} scriptler={["/js/form.js"]}>
      <div class="liste-sayfa">
        <div class="kap orta-dar">
          <span class="ust-etiket">{t("Danışman")}</span>
          <h1>{t("Bana emlakçı bul")}</h1>
          <p class="alt-baslik">{t("Ne aradığınızı anlatın; bölgeyi bilen bir danışmanımız sizi arasın, uygun evleri birlikte bulalım.")}</p>
          {ok ? <div class="kart-kutu"><div class="basari">{t("Talebiniz alındı. Danışmanımız en kısa sürede sizinle iletişime geçecek.")}</div></div> : (
            <form method="post" class="kart-kutu form" data-kvkk-form>
              <div class="iki">
                <label>{t("Ad soyad *")}<input name="ad_soyad" required /></label>
                <label>{t("Telefon *")}<input name="telefon" type="tel" required /></label>
              </div>
              <label>{t("E-posta")}<input name="eposta" type="email" /></label>
              <div class="iki">
                <label>{t("Ne istiyorsunuz?")}
                  <select name="istek">
                    <option value="satin_al">{t("Ev satın almak")}</option><option value="kirala">{t("Ev kiralamak")}</option>
                    <option value="sat">{t("Evimi satmak")}</option><option value="kiraya_ver">{t("Evimi kiraya vermek")}</option>
                  </select>
                </label>
                <label>{t("Bölge")}<input name="bolge" placeholder={t("Örn. Bitez, Yalıkavak, fark etmez")} /></label>
              </div>
              <div class="iki">
                <label>{t("Bütçe")}<input name="butce" placeholder={t("Örn. 10 milyon ₺ ya da 50 bin ₺/ay")} /></label>
                <label>{t("Ne zaman?")}
                  <select name="zaman"><option>{t("Hemen")}</option><option>{t("1–3 ay içinde")}</option><option>{t("3 aydan sonra")}</option><option>{t("Sadece bakıyorum")}</option></select>
                </label>
              </div>
              <label>{t("Not")}<textarea name="mesaj" rows={3} placeholder={t("Oda sayısı, havuz, okul yakınlığı gibi önemli gördükleriniz")}></textarea></label>
              <label class="kutu"><input type="checkbox" name="kvkk_onay" value="1" required /><span><a href="/yasal/kvkk" target="_blank">{t("KVKK aydınlatma metnini okudum, kabul ediyorum")}</a> *</span></label>
              <button class="dugme tam">{t("Danışman istiyorum")}</button>
            </form>
          )}
        </div>
      </div>
    </Sayfa>,
  );
});

araclar.post("/emlakci-bul", async (c) => {
  const b = await c.req.parseBody();
  const s = (k: string) => (typeof b[k] === "string" && (b[k] as string).trim() ? (b[k] as string).trim().slice(0, 2000) : null);
  if (!s("ad_soyad") || !s("telefon") || b.kvkk_onay !== "1") return c.text("Lütfen ad, telefon ve KVKK onayını doldurun.", 400);
  await sql`insert into talepler (ad_soyad, telefon, eposta, mesaj, kvkk_onay, konu, ayrinti)
            values (${s("ad_soyad")}, ${s("telefon")}, ${s("eposta")}, ${s("mesaj")}, true, 'emlakci_bul',
                    ${sql.json({ istek: s("istek"), bolge: s("bolge"), butce: s("butce"), zaman: s("zaman") })})`;
  return c.redirect("/emlakci-bul?ok=1");
});

// ---------- Ekspertiz talebi ----------
araclar.get("/ekspertiz", async (c) => {
  const ok = c.req.query("ok") === "1";
  const ilanNo = Number(c.req.query("ilan")) || null;
  const [ilan] = ilanNo ? await sql`select i.ilan_no, i.baslik, m.ad as mahalle from ilanlar i left join mahalleler m on m.id = i.mahalle_id
                                   where i.ilan_no = ${ilanNo} and i.durum = 'yayinda'` : [];
  const mh = await sql<{ ad: string }[]>`select ad from mahalleler order by ad`;
  return c.html(
    <Sayfa baslik={t("Gayrimenkul ekspertizi")} scriptler={["/js/form.js"]}>
      <div class="liste-sayfa">
        <div class="kap orta-dar">
          <span class="ust-etiket">{t("Alırken · Satarken")}</span>
          <h1>{t("Gayrimenkul ekspertizi isteyin")}</h1>
          <p class="alt-baslik">{t("Evin piyasa değerini ve yasal durumunu bağımsız bir değerleme raporuyla öğrenin. Raporu SPK lisanslı değerleme uzmanları hazırlar; ücret ve süreyi danışmanımız size iletir.")}</p>
          {ok ? <div class="kart-kutu"><div class="basari">{t("Talebiniz alındı. Danışmanımız ekspertiz için sizinle iletişime geçecek.")}</div></div> : (
            <form method="post" class="kart-kutu form" data-kvkk-form>
              {ilan && <div class="kum-not">{t("İlan:")} <strong>#{ilan.ilan_no} {ilan.baslik}</strong> ({ilan.mahalle})</div>}
              <input type="hidden" name="ilan_no" value={ilan?.ilan_no ?? ""} />
              <div class="iki">
                <label>{t("Ad soyad *")}<input name="ad_soyad" required /></label>
                <label>{t("Telefon *")}<input name="telefon" type="tel" required /></label>
              </div>
              <label>{t("E-posta")}<input name="eposta" type="email" /></label>
              <div class="iki">
                <label>{t("Neden ekspertiz?")}
                  <select name="amac">
                    <option>{t("Satın almadan önce")}</option><option>{t("Konut kredisi")}</option><option>{t("Satış fiyatını belirlemek")}</option>
                    <option>{t("Miras / paylaşım")}</option><option>{t("Diğer")}</option>
                  </select>
                </label>
                <label>{t("Mahalle")}
                  <select name="mahalle"><option value="">—</option>{mh.map((m) => <option selected={ilan?.mahalle === m.ad}>{m.ad}</option>)}</select>
                </label>
              </div>
              <div class="iki">
                <label>{t("Emlak türü")}
                  <select name="tur"><option>{t("Daire")}</option><option>{t("Villa")}</option><option>{t("Müstakil ev")}</option><option>{t("Arsa")}</option><option>{t("Diğer")}</option></select>
                </label>
                <label>{t("Yaklaşık m²")}<input name="m2" type="number" min="0" /></label>
              </div>
              <label>{t("Adres / not")}<textarea name="mesaj" rows={3} placeholder={t("Ada/parsel biliyorsanız yazabilirsiniz")}></textarea></label>
              <label class="kutu"><input type="checkbox" name="kvkk_onay" value="1" required /><span><a href="/yasal/kvkk" target="_blank">{t("KVKK aydınlatma metnini okudum, kabul ediyorum")}</a> *</span></label>
              <button class="dugme tam">{t("Ekspertiz istiyorum")}</button>
            </form>
          )}
        </div>
      </div>
    </Sayfa>,
  );
});

araclar.post("/ekspertiz", async (c) => {
  const b = await c.req.parseBody();
  const s = (k: string) => (typeof b[k] === "string" && (b[k] as string).trim() ? (b[k] as string).trim().slice(0, 2000) : null);
  if (!s("ad_soyad") || !s("telefon") || b.kvkk_onay !== "1") return c.text("Lütfen ad, telefon ve KVKK onayını doldurun.", 400);
  const [ilan] = s("ilan_no") ? await sql`select id from ilanlar where ilan_no = ${Number(s("ilan_no"))}` : [];
  await sql`insert into talepler (ilan_id, ad_soyad, telefon, eposta, mesaj, kvkk_onay, konu, ayrinti)
            values (${ilan?.id ?? null}, ${s("ad_soyad")}, ${s("telefon")}, ${s("eposta")}, ${s("mesaj")}, true, 'ekspertiz',
                    ${sql.json({ amac: s("amac"), mahalle: s("mahalle"), tur: s("tur"), m2: s("m2") })})`;
  return c.redirect("/ekspertiz?ok=1");
});

// ---------- Rehberler ----------
const REHBER: Record<string, { baslik: string; ust: string; giris: string; bolumler: { id?: string; baslik: string; maddeler: string[] }[] }> = {
  alirken: {
    ust: "Alırken", baslik: "Ev alırken: ekspertiz ve alım rehberi",
    giris: "Bodrum'da ev alırken adım adım neye bakmanız gerektiği, ekspertizin ne işe yaradığı ve masraflar.",
    bolumler: [
      { baslik: "1. Bütçe ve finansman", maddeler: [
        "Peşinat, kredi ve masrafları birlikte planlayın; masraflar için fiyatın yaklaşık %5–7'si kadar pay ayırın.",
        "Kredi kullanacaksanız bankadan ön onay alın; aylık taksidi <a href=\"/kredi\">kredi hesaplayıcı</a> ile görün.",
      ] },
      { baslik: "2. Tapu kaydını kontrol edin", maddeler: [
        "Tapu türünü öğrenin: kat mülkiyeti, kat irtifakı, hisseli tapu ya da arsa. Hisseli tapuda tüm hissedarların durumu önemlidir.",
        "İpotek, haciz, şerh ve beyan olup olmadığını satıcıyla birlikte e-Devlet veya tapu müdürlüğü üzerinden kontrol edin.",
      ] },
      { baslik: "3. İmar, ruhsat ve iskân", maddeler: [
        "Belediyeden imar durumunu öğrenin; yapı ruhsatı ve iskânı (yapı kullanma izin belgesi) olup olmadığına bakın.",
        "Bodrum'a özgü riskler: sit alanı, kıyı kenar çizgisi, zeytinlik ve tarla vasfı. İlanlarımızda bunlar kırmızı uyarıyla belirtilir.",
      ] },
      { id: "ekspertiz", baslik: "4. Gayrimenkul ekspertizi (değerleme)", maddeler: [
        "Ekspertiz raporu, evin piyasa değerini ve yasal durumunu bağımsız bir uzmanın gözüyle ortaya koyar.",
        "Raporu SPK lisanslı değerleme uzmanları hazırlar. Konut kredisi kullanırken banka ekspertizi kendisi yaptırır.",
        "Yabancı alıcılar için tapu işlemlerinde değerleme raporu istenir.",
        "Fiyat pazarlığında rapordaki değer ve <a href=\"/endeks\">emlak endeksimizdeki</a> mahalle ortancası güçlü dayanaktır.",
        "<a href=\"/ekspertiz\">Ekspertiz talep formunu</a> doldurun; danışmanımız lisanslı bir değerleme uzmanıyla süreci başlatsın.",
      ] },
      { baslik: "5. Masraflar", maddeler: [
        "Tapu harcı: alıcı ve satıcı için ayrı ayrı, beyan edilen değer üzerinden alınır; beyan değeri belediye rayiç değerinin altında olamaz.",
        "Döner sermaye ücreti, zorunlu deprem sigortası (DASK) ve varsa emlakçı hizmet bedeli (yetki sözleşmesine göre, KDV dahil edilerek).",
        "Güncel harç oranlarını ve ücretleri işlem öncesi tapu müdürlüğünden teyit edin.",
      ] },
      { baslik: "6. Ödeme ve tapu devri", maddeler: [
        "Kapora veriyorsanız mutlaka yazılı belge alın; büyük ödemeleri nakit değil, banka kanalıyla ve tapu devriyle eş zamanlı yapın.",
        "Tapu randevusunu Web Tapu üzerinden alabilirsiniz; devirde alıcı ve satıcı (ya da vekilleri) hazır bulunur.",
      ] },
    ],
  },
  satarken: {
    ust: "Satarken", baslik: "Evinizi satarken: alım/satım rehberi",
    giris: "Evinizi doğru fiyatla ve sorunsuz satmak için hazırlık, belgeler ve süreç.",
    bolumler: [
      { baslik: "1. Doğru fiyat", maddeler: [
        "Mahallenizin ortanca m² fiyatına <a href=\"/endeks\">emlak endeksinden</a> bakın; benzer ilanlarla karşılaştırın.",
        "Tereddüt ediyorsanız bağımsız bir ekspertiz raporu alın; alıcıya da güven verir.",
      ] },
      { baslik: "2. Belgeleri hazırlayın", maddeler: [
        "Tapu belgesi ve kimlik, geçerli DASK poliçesi, belediyeden emlak vergisi borcu olmadığına dair yazı.",
        "Varsa iskân belgesi, proje, site yönetim planı ve aidat bilgileri. Binaya göre enerji kimlik belgesi de istenebilir.",
      ] },
      { baslik: "3. İlanı yayınlayın", maddeler: [
        "Satılık ve kiralık ilanlar e-Devlet üzerinden doğrulanır (EİDS). Sitemizde ilanınızı yetki sözleşmesiyle biz doğrularız.",
        "İyi fotoğraf ve dürüst açıklama satışı hızlandırır; hisseli tapu, kiracı gibi durumları baştan belirtin.",
        "<a href=\"/evimi-listele\">Evinizi ücretsiz listeleyin</a>: dört dilde yayınlayıp yerli ve yabancı alıcıya ulaştıralım.",
      ] },
      { baslik: "4. Vergi ve masraflar", maddeler: [
        "Tapu harcının satıcı payını siz ödersiniz.",
        "Evi edindikten kısa süre sonra satıyorsanız değer artış kazancı vergisi doğabilir; güncel kuralları mali müşavirinize danışın.",
      ] },
    ],
  },
  kiralarken: {
    ust: "Kiralarken", baslik: "Ev kiralarken: emlak endeksi ve kira rehberi",
    giris: "Doğru kirayı bulmak, sözleşme ve haklarınız.",
    bolumler: [
      { baslik: "1. Bölgenin kira seviyesini öğrenin", maddeler: [
        "<a href=\"/endeks\">Emlak endeksimizde</a> mahalle mahalle kiralık ortanca m² fiyatlarını ve son 90 günlük değişimi görün.",
        "Bodrum'da yaz aylarında kısa dönem kiralar yükselir; yıllık kiralık ararken sezon dışında bakmak avantajlıdır.",
      ] },
      { baslik: "2. Sözleşme ve güvence", maddeler: [
        "Kira sözleşmesini yazılı yapın; kira bedeli, artış, aidat ve demirbaşları açıkça yazın.",
        "Güvence (depozito) yasa gereği üç aylık kirayı aşamaz.",
        "Evi teslim alırken fotoğraflı bir teslim tutanağı hazırlayın.",
      ] },
      { baslik: "3. Kira artışı", maddeler: [
        "Konut kiralarında yenilenen dönem artışı, bir önceki kira yılının TÜFE on iki aylık ortalamasını geçemez.",
        "Güncel oranı TÜİK'in açıkladığı verilerden kontrol edin.",
      ] },
      { baslik: "4. Tatil ve kısa dönem kiralama", maddeler: [
        "Konutların turizm amaçlı kısa süreli kiralanması için Kültür ve Turizm Bakanlığı izin belgesi gerekir. Sitemizde günlük ilanlar izin belge numarasıyla yayınlanır.",
      ] },
    ],
  },
};

araclar.get("/rehber/:konu", (c) => {
  const r = REHBER[c.req.param("konu")];
  if (!r) return c.notFound();
  return c.html(
    <Sayfa baslik={r.baslik}>
      <div class="kap orta-dar bolum rehber">
        <span class="ust-etiket">{r.ust}</span>
        <h1>{r.baslik}</h1>
        <p class="alt-baslik">{r.giris}</p>
        {r.bolumler.map((b) => (
          <section id={b.id}>
            <h2>{b.baslik}</h2>
            <ul>{b.maddeler.map((m) => <li dangerouslySetInnerHTML={{ __html: m }} />)}</ul>
          </section>
        ))}
        <div class="bilgi">{t("Bu rehber genel bilgilendirme amaçlıdır; harç, vergi ve oranlar değişebilir. İşlem öncesi ilgili kurumdan ya da uzmanınızdan teyit edin.")}</div>
        <div class="rehber-alt">
          <a href="/rehber/alirken">{t("Alırken")}</a> · <a href="/rehber/satarken">{t("Satarken")}</a> · <a href="/rehber/kiralarken">{t("Kiralarken")}</a> · <a href="/kredi">{t("Kredi hesapla")}</a> · <a href="/emlakci-bul">{t("Bana emlakçı bul")}</a>
        </div>
      </div>
    </Sayfa>,
  );
});


import { Hono } from "hono";
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
    <Sayfa baslik="Kaydedilenler" scriptler={["/js/kaydedilenler.js"]}>
      <div class="kap bolum">
        <h1>Kaydedilenler</h1>
        <p class="alt-baslik">Kaydettiğiniz ilanlar ve aramalar bu cihazda saklanır.</p>
        <h2>Kayıtlı aramalar</h2>
        <div class="kayitli-aramalar" data-aramalar><p class="kucuk">Yükleniyor…</p></div>
        <h2 class="bolum-ust">Kayıtlı ilanlar</h2>
        <div class="kartlar uc-sutun" data-ilanlar></div>
        <div class="bos" data-bos hidden><p>Henüz ilan kaydetmediniz. İlanlardaki ♡ simgesine dokunarak kaydedebilirsiniz.</p><a href="/ara" class="dugme ikincil">İlanlara göz at</a></div>
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
        <thead><tr><th>Mahalle</th><th>Ortanca {birim}</th><th>Son 90 gün değişim</th><th>Gözlem</th></tr></thead>
        <tbody>
          {tablo(tip).map((r) => {
            const d = degisim(r);
            return (
              <tr>
                <td><a href={`/ara?tip=${tip}&mahalleler=${r.slug}`}>{r.mahalle}</a> <span class="kucuk">{r.ilce}</span></td>
                <td><strong>{r.medyan ? para(Math.round(r.medyan)) : "—"}</strong></td>
                <td class={d == null ? "" : d >= 0 ? "artis" : "azalis"}>{d == null ? <span class="kucuk">veri birikiyor</span> : `${d >= 0 ? "▲" : "▼"} %${Math.abs(d * 100).toFixed(1)}`}</td>
                <td>{r.adet}{r.adet < 5 && <span class="kucuk"> · az veri</span>}</td>
              </tr>
            );
          })}
          {tablo(tip).length === 0 && <tr><td colspan={4} class="kucuk">Henüz yeterli veri yok.</td></tr>}
        </tbody>
      </table>
    </div>
  );

  return c.html(
    <Sayfa baslik="Emlak endeksi">
      <div class="kap bolum">
        <span class="ust-etiket">Kiralarken · Satın alırken</span>
        <h1>Emlak endeksi</h1>
        <p class="alt-baslik">Bodrum ve çevresinde mahalle mahalle ortanca metrekare fiyatları ve son 90 günlük değişim.</p>
        <h2>Satılık · TL / net m²</h2>
        <Tablo tip="satilik" birim="₺ / m²" />
        <h2 class="bolum-ust">Kiralık · TL / net m² / ay</h2>
        <Tablo tip="kiralik" birim="₺ / m² / ay" />
        <div class="bilgi">
          Endeks, sitemizdeki yayındaki ilanlarla ekibimizin bölgede gözlediği güncel ilan fiyatlarından hesaplanır; satış
          değil, <strong>istenen fiyat</strong> ortancasıdır. Gözlem sayısı 5'ten az olan mahallelerde sonuçlar yanıltıcı olabilir.
          Kesin değer için <a href="/rehber/alirken#ekspertiz">gayrimenkul ekspertizi</a> yaptırın.
        </div>
      </div>
    </Sayfa>,
  );
});

// ---------- Kredi hesapla ----------
araclar.get("/kredi", (c) =>
  c.html(
    <Sayfa baslik="Konut kredisi hesapla" scriptler={["/js/kredi.js"]}>
      <div class="kap bolum">
        <span class="ust-etiket">Kredi</span>
        <h1>Konut kredisi hesapla</h1>
        <p class="alt-baslik">Ev fiyatı, peşinat, vade ve faiz oranına göre aylık taksidinizi hesaplayın.</p>
        <div class="kredi-izgara">
          <form class="kart-kutu form" data-kredi>
            <label>Ev fiyatı (₺)<input type="number" name="fiyat" min="0" step="10000" value={c.req.query("fiyat") ?? ""} required /></label>
            <label>Peşinat (₺)<input type="number" name="pesinat" min="0" step="10000" /></label>
            <div class="iki">
              <label>Vade (ay)
                <select name="vade">{[12, 24, 36, 48, 60, 84, 96, 120, 180, 240].map((v) => <option value={v} selected={v === 120}>{v} ay</option>)}</select>
              </label>
              <label>Aylık faiz oranı (%)<input type="number" name="faiz" min="0" max="20" step="0.01" placeholder="Bankanızın oranı" required /></label>
            </div>
            <p class="kucuk">Güncel faiz oranını bankanızdan öğrenip yazın; oranlar sık değişir.</p>
          </form>
          <div class="kart-kutu kredi-sonuc" data-sonuc>
            <div class="sonuc-satir"><span>Kredi tutarı</span><strong data-k="tutar">—</strong></div>
            <div class="sonuc-satir buyuk"><span>Aylık taksit</span><strong data-k="taksit">—</strong></div>
            <div class="sonuc-satir"><span>Toplam geri ödeme</span><strong data-k="toplam">—</strong></div>
            <div class="sonuc-satir"><span>Toplam faiz</span><strong data-k="faiz">—</strong></div>
            <div class="sonuc-satir"><span>Peşinat oranı</span><strong data-k="oran">—</strong></div>
            <details class="odeme-plani"><summary>Ödeme planı (ilk 12 ay)</summary><div data-plan></div></details>
          </div>
        </div>
        <div class="bilgi">
          Hesaplama eşit taksitli kredi formülüyle yapılır ve bilgi amaçlıdır. Bireysel konut kredilerinde KKDF ve BSMV
          genellikle uygulanmaz; ekspertiz ücreti, konut ve DASK sigortası, tapu masrafları ayrıca ödenir. Bankaların
          kullandırabileceği kredi/değer oranı düzenlemelerle değişir; kesin teklif için bankanızla görüşün.
        </div>
      </div>
    </Sayfa>,
  ),
);

// ---------- Bana emlakçı bul ----------
araclar.get("/emlakci-bul", (c) => {
  const ok = c.req.query("ok") === "1";
  return c.html(
    <Sayfa baslik="Bana emlakçı bul" scriptler={["/js/form.js"]}>
      <div class="liste-sayfa">
        <div class="kap orta-dar">
          <span class="ust-etiket">Danışman</span>
          <h1>Bana emlakçı bul</h1>
          <p class="alt-baslik">Ne aradığınızı anlatın; bölgeyi bilen bir danışmanımız sizi arasın, uygun evleri birlikte bulalım.</p>
          {ok ? <div class="kart-kutu"><div class="basari">Talebiniz alındı. Danışmanımız en kısa sürede sizinle iletişime geçecek.</div></div> : (
            <form method="post" class="kart-kutu form" data-kvkk-form>
              <div class="iki">
                <label>Ad soyad *<input name="ad_soyad" required /></label>
                <label>Telefon *<input name="telefon" type="tel" required /></label>
              </div>
              <label>E-posta<input name="eposta" type="email" /></label>
              <div class="iki">
                <label>Ne istiyorsunuz?
                  <select name="istek">
                    <option value="satin_al">Ev satın almak</option><option value="kirala">Ev kiralamak</option>
                    <option value="sat">Evimi satmak</option><option value="kiraya_ver">Evimi kiraya vermek</option>
                  </select>
                </label>
                <label>Bölge<input name="bolge" placeholder="Örn. Bitez, Yalıkavak, fark etmez" /></label>
              </div>
              <div class="iki">
                <label>Bütçe<input name="butce" placeholder="Örn. 10 milyon ₺ ya da 50 bin ₺/ay" /></label>
                <label>Ne zaman?
                  <select name="zaman"><option>Hemen</option><option>1–3 ay içinde</option><option>3 aydan sonra</option><option>Sadece bakıyorum</option></select>
                </label>
              </div>
              <label>Not<textarea name="mesaj" rows={3} placeholder="Oda sayısı, havuz, okul yakınlığı gibi önemli gördükleriniz"></textarea></label>
              <label class="kutu"><input type="checkbox" name="kvkk_onay" value="1" required /><span><a href="/yasal/kvkk" target="_blank">KVKK aydınlatma metnini okudum, kabul ediyorum</a> *</span></label>
              <button class="dugme tam">Danışman istiyorum</button>
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
        <div class="bilgi">Bu rehber genel bilgilendirme amaçlıdır; harç, vergi ve oranlar değişebilir. İşlem öncesi ilgili kurumdan ya da uzmanınızdan teyit edin.</div>
        <div class="rehber-alt">
          <a href="/rehber/alirken">Alırken</a> · <a href="/rehber/satarken">Satarken</a> · <a href="/rehber/kiralarken">Kiralarken</a> · <a href="/kredi">Kredi hesapla</a> · <a href="/emlakci-bul">Bana emlakçı bul</a>
        </div>
      </div>
    </Sayfa>,
  );
});


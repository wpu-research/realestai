# Lovable kurulum + promptlar

Promptları **sırayla**, her biri bitip önizlemede kontrol edildikten sonra yapıştırın. Lovable tek
dev prompttan çok adım adım ilerleyince daha temiz kod üretiyor.

## 0. Kurulum (prompttan önce, 10 dk)

1. Lovable'da yeni proje açın → sağ üstten **Supabase'i bağlayın** (yeni Supabase projesi).
2. Supabase → **SQL Editor**:
   - `supabase/migrations/001_init.sql` içeriğini yapıştırıp çalıştırın.
   - Ardından `supabase/seed.sql` içeriğini çalıştırın (15 mahalle + 10 DEMO ilan).
3. Supabase → **Edge Functions → Secrets**: `ANTHROPIC_API_KEY` ekleyin.
4. Supabase → **Authentication → Users**: kendinize ve Didem'e kullanıcı açın. SQL Editor'de:
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'SİZİN-EPOSTANIZ';
   insert into public.user_roles (user_id, role)
   select id, 'ekip' from auth.users where email = 'DIDEM-EPOSTASI';
   ```
5. (İsteğe bağlı) Supabase → Database → Extensions → `pg_cron` açın ve KVKK temizliğini kurun:
   ```sql
   select cron.schedule('adaylari-temizle', '0 3 * * *', 'select public.adaylari_temizle()');
   ```

---

## Prompt 1 — Site iskeleti

```
Bodrum ve çevresi için bir emlak sitesi yapıyoruz. Çalışma adı "RealEstAi" (sonra değişecek, adı
tek bir sabitten oku). Supabase bağlı; şema hazır, tabloları değiştirme, yeni tablo açma.

Tablolar: mahalleler, ilanlar, ilan_fotolari, gorsel_3d, adaylar, arama_gecmisi, basvurular,
talepler, sesli_arama_kayitlari, user_roles. Supabase tiplerini oluştur ve bunları kullan.

Dört ilan tipi var ve sitede dört ayrı sekme olarak görünür:
- satilik  → fiyat TOPLAM, "₺ / m²" ile birlikte göster
- kiralik  → fiyat AYLIK ("/ay")
- sezonluk → fiyat SEZON TOPLAMI, sezon_baslangic–sezon_bitis tarihleriyle ("Mayıs–Ekim")
- gunluk   → fiyat GECELİK ("/gece"); sezon_fiyatlari varsa yüksek/omuz/düşük sezon fiyatlarını göster

Tasarım: Ege — beyaz, kireç badana dokusu, derin deniz mavisi (#0B4F6C) ana renk, bougainvillea
pembesi (#C2185B) yalnız vurgu için, kum beji arka plan bölümleri. Başlıklar serif (Playfair
Display), gövde Inter. Geniş fotoğraflar, bol boşluk, sade. Mobil öncelikli; ziyaretçilerin çoğu
telefondan gelecek.

Diller: TR (varsayılan), EN, RU, DE. Arayüz metinleri i18n dosyalarından gelsin. İlan başlığı ve
açıklaması seçili dilde ilanlar.ceviriler[dil] içinde varsa onu, yoksa Türkçeyi göster. Dil
seçici üst menüde; seçim URL'de (/en/..., /ru/...).

Para birimi seçici (TRY/EUR/USD/GBP) üst menüde. Şimdilik sabit kur tablosu kullan (tek dosyada),
ilan kendi para biriminde ve seçili birimde yaklaşık değer olarak gösterilsin ("≈").

Sayfalar:
1. Ana sayfa: büyük hero (Bodrum koyu fotoğrafı, placeholder), ortada BÜYÜK arama kutusu ve
   mikrofon düğmesi (sesli arama bir sonraki adımda bağlanacak; şimdilik yazılı arama /ara
   sayfasına yönlendirsin). Altında 4 tip sekmesi, "Haftanın fırsatları" (iskonto en yüksek 6
   yayındaki ilan), mahalle kartları (mahalleler tablosundan), "Evinizi listeleyin" bandı.
2. /ara: solda filtre paneli (tip, mahalle çoklu seçim, fiyat aralığı, oda, min m², kapasite,
   havuz özel/ortak, deniz manzarası, denize max mesafe, site içi, eşyalı, sadece fırsatlar,
   gunluk/sezonluk için giriş-çıkış tarihi), sağda ilan kartları + harita (Leaflet +
   OpenStreetMap; ilanın lat/lng'si yoksa mahallenin lat/lng'sini kullan). Filtreler URL query
   parametrelerinde dursun ki link paylaşılabilsin. Mobilde filtre paneli alttan açılan sheet.
3. /ilan/:ilan_no: fotoğraf galerisi (ilan_fotolari, sira'ya göre), özellikler tablosu, fiyat
   kutusu, harita, "Bu ilanla ilgileniyorum" formu (talepler tablosuna yazar; gunluk/sezonluk
   için tarih ve kişi sayısı alanları), benzer ilanlar.
4. /mahalle/:slug: mahalle sayfası ve o mahallenin ilanları.
5. /evimi-listele: ev sahibi başvuru formu (basvurular tablosu): ad soyad, telefon, e-posta, tip,
   mahalle, emlak türü, mesaj. "KVKK aydınlatma metnini okudum, kabul ediyorum" kutusu ZORUNLU
   (kvkk_onay). "Kampanya ve bilgilendirme iletileri almak istiyorum" kutusu İSTEĞE BAĞLI
   (iys_onay), varsayılan işaretsiz. Gönderince teşekkür ekranı.

İlan kartı: kapak fotoğrafı, tip rozeti, başlık, mahalle, oda / m² / kapasite, fiyat. iskonto
>= 0.15 ise yeşil "Bölge ortalamasının %X altında" rozeti. demo = true ise köşede gri "DEMO"
rozeti.

Fiyat kutusunda (ilan detay):
- satilik/kiralik ve komisyon_orani doluysa: "Hizmet bedeli: %2 + KDV (alıcıdan)" gibi AÇIKÇA
  yaz. Fiyatın üstüne asla komisyon ekleme; gösterilen fiyat ev sahibinin fiyatıdır.
- bolge_medyani doluysa: "Bu mahallede benzer ilanların ortanca birim fiyatı: ..." satırı.
- satilik/kiralik için "EİDS doğrulanmış ilan" rozeti ve eids_no.
- gunluk/sezonluk için "Turizm izin belge no: ..." (turizm_izin_no doluysa) satırı.

Fotoğraf yoksa zarif bir placeholder göster (Unsplash'tan Bodrum/Ege temalı sabit görseller,
demo için).

Supabase RLS zaten ayarlı: ziyaretçi yalnız durum='yayinda' ilanları görür. Sorgularda ayrıca
filtreleme yapma ama durum alanına güvenme varsayımıyla kod yazma — RLS'e güven.
```

## Prompt 2 — Sesli ve konuşarak arama

Önce `supabase/functions/sesli-arama/index.ts` dosyasının içeriğini kopyalayın; prompttaki
yere yapıştırın.

```
Supabase'de "sesli-arama" adında bir Edge Function oluştur, kodu aynen şu:

<<< supabase/functions/sesli-arama/index.ts İÇERİĞİNİ BURAYA YAPIŞTIR >>>

ANTHROPIC_API_KEY secret'ı Supabase'de tanımlı. Fonksiyonu JWT doğrulaması olmadan çağrılabilir
yap (verify_jwt = false), ziyaretçiler giriş yapmadan arama yapacak.

Fonksiyonun sözleşmesi:
  istek  { metin: string, dil: "tr"|"en"|"ru"|"de", onceki?: Filtreler }
  yanıt  { filtreler: Filtreler, ozet: string, anlasilmadi: boolean }
Filtreler alanları: tip, emlak_turu[], mahalleler[] (slug), min_fiyat, max_fiyat, para_birimi,
oda[], min_net_m2, min_kapasite, havuz ("ozel"|"ortak"|"herhangi"), deniz_manzarasi,
max_denize_mesafe_m, site_ici, esyali, evcil_hayvan, giris_tarihi, cikis_tarihi,
sadece_firsat, siralama.

Arayüz:
1. Ana sayfadaki ve /ara sayfasındaki mikrofon düğmesi Web Speech API ile (SpeechRecognition /
   webkitSpeechRecognition) konuşmayı yazıya çevirsin. Dil sitenin seçili diline göre: tr-TR,
   en-US, ru-RU, de-DE. interimResults açık; konuşulurken metin kutuda canlı görünsün.
   Dinlerken düğme nabız gibi atan bir animasyonla kırmızı olsun. Sessizlikte otomatik dursun.
2. Tarayıcı Web Speech API desteklemiyorsa (ör. Firefox) mikrofonu gizle, yazılı arama çalışsın.
3. Metin tamamlanınca (ya da kullanıcı yazıp Enter'a basınca) sesli-arama fonksiyonunu çağır,
   dönen filtreleri /ara sayfasının URL parametrelerine uygula ve sonuçları göster. Filtre
   panelindeki alanlar da dolsun ki kullanıcı elle düzeltebilsin.
4. Sonuç listesinin üstünde sohbet şeridi: fonksiyonun döndüğü "ozet" bir balon olarak görünsün
   ("Bitez'de, havuzlu, 6+ kişilik, gecesi 8.000 ₺ altı ağustos tatil evleri"). Altında "Daha
   fazla anlat…" kutusu + mikrofon: kullanıcı "biraz daha ucuz olsun", "Turgutreis'e de bak"
   dediğinde fonksiyonu onceki = mevcut filtrelerle çağır, filtreleri güncelle. Konuşma geçmişi
   şeritte yukarı doğru birikir.
5. anlasilmadi true ise ozet'i uyarı balonu olarak göster, filtreleri değiştirme.
6. Örnek öneri çipleri (tıklanınca o metinle arama yapar), seçili dilde:
   - "Bitez'de denize yakın havuzlu 2+1 satılık"
   - "Ağustosta 6 kişilik, gecesi 8 binin altında tatil evi"
   - "Konacık'ta yıllık kiralık 3+1, eşyasız"
   - "Yalıkavak'ta sezonluk deniz manzaralı villa"
7. Bekleme sırasında iskelet (skeleton) kartlar göster; hata olursa "Aramanızı anlayamadık,
   filtrelerden seçebilirsiniz" de ve filtre panelini aç.
```

## Prompt 3 — İlan detayında temsili 3D görünüm

```
İlan detay sayfasındaki galerinin yanına "3D Görünüm (temsili)" sekmesi ekle. Yalnız ilanın
gorsel_3d tablosunda onaylandi = true kaydı varsa görünsün.

- Oda seçici: gorsel_3d kayıtlarının oda alanlarından düğmeler (Salon, Mutfak, Yatak odası, ...).
- dosya_url uzantısına göre görüntüleyici:
  .splat / .ply / .ksplat → @mkkellogg/gaussian-splats-3d ile three.js sahnesi (orbit kontrol,
     mobilde dokunmatik)
  .glb / .gltf → @react-three/fiber + @react-three/drei (useGLTF, OrbitControls)
  .png / .jpg (yontem = 'kat_plani') → zoom yapılabilen görsel, başlığı "Tahmini kat planı"
- Görüntüleyicinin ÜSTÜNDE her zaman görünen, kapatılamayan sarı uyarı kutusu (seçili dilde):
  TR: "Temsili görseldir. Bu 3D görünüm ilan fotoğraflarından yapay zekâ ile otomatik
       üretilmiştir. Ölçüler, oda düzeni, malzeme ve görünüm gerçeği yansıtmayabilir; bazı alanlar
       yapay zekâ tarafından tamamlanmıştır. Karar vermeden önce mülkü yerinde görün."
  EN / RU / DE çevirilerini sen yaz.
- Ayrıca canvas'ın sağ alt köşesinde, canvas'ın İÇİNE çizilen yarı saydam kalıcı filigran:
  "Temsili — YZ ile üretildi" (ekran görüntüsünde de görünsün diye HTML değil canvas üstünde).
- 3D yüklenirken ilerleme çubuğu; yüklenemezse sekmeyi sessizce gizle.
- Test için gorsel_3d boşsa hiçbir şey gösterme (sekme yok).
```

## Prompt 4 — Admin paneli (Didem'in arama ekranı dahil)

```
/admin altında giriş gerektiren bir yönetim paneli yap (Supabase Auth, e-posta + şifre).
Erişim: user_roles tablosunda 'admin' veya 'ekip' rolü olanlar. Rolü olmayan girişi "Yetkiniz
yok" ekranına düşür. Panel yalnız Türkçe. Sol menü: Adaylar, İlanlar, Başvurular, Talepler,
Sesli aramalar (yalnız admin), Kullanıcılar (yalnız admin).

1. ADAYLAR (en önemli ekran — arama kuyruğu)
   Radarın bulduğu ilanlar buraya düşer; ekip arkadaşı (Didem) sahipleri arar.
   - Üstte sekmeler: Aranacak (durum yeni/aranacak/geri_aranacak), İlgileniyor, Onaylandı,
     Kapananlar (ulasilamadi/reddetti/emlakci_cikti). Her sekmede sayı rozeti.
   - Liste oncelik'e göre azalan sıralı. Sütunlar: tip, başlık, mahalle, fiyat, "medyanın %X
     altında" (iskonto), sahip olasılığı (%), kaç gündür yayında, fiyat düştü mü, kırmızı
     bayraklar (kırmızı etiket), atanan, geri arama zamanı.
   - Bugün geri aranacaklar en üstte turuncu vurguyla.
   - Satıra tıklayınca sağdan açılan panel:
       * Kaynak ilan linki (yeni sekmede açılır), tüm alanlar
       * Telefon: büyük, tıklanınca tel: linki (mobilde direkt arar)
       * ARAMA SCRIPTİ kutusu (katlanabilir):
         "Merhaba, ben [ad], [site adı]'ndan arıyorum. [kaynak]'taki [mahalle] [tip] ilanınız
          için arıyorum. Evinizi ücretsiz olarak sitemizde, Türkçe, İngilizce, Rusça ve Almanca
          yayınlayıp yabancı ve yerli alıcılara ulaştırabiliriz; size ayrıca bölge fiyat analizi
          gönderebiliriz. Kişisel verileriniz yalnız bu ilan için işlenir; dilediğiniz an
          silinmesini isteyebilirsiniz. İlgilenir misiniz?"
       * "Arama sonucu" formu → arama_gecmisi'ne yazar: sonuç (Ulaşılamadı / Geri aranacak /
         İlgileniyor / Onayladı / Reddetti / Emlakçı çıktı), "KVKK aydınlatması yapıldı"
         kutusu, not. Geri aranacak seçilirse tarih-saat seçici → adaylar.geri_arama_at.
         (adaylar.durum veritabanı trigger'ı ile otomatik güncellenir; ayrıca update yapma.)
       * "Onayladı" seçilip "KVKK aydınlatması yapıldı" işaretli DEĞİLSE kaydetmeye izin verme.
       * Arama geçmişi zaman çizelgesi (kim, ne zaman, sonuç, not).
       * Durum onaylandi ise "İlana dönüştür" düğmesi → supabase.rpc('adayi_ilana_cevir',
         { _aday_id }) → dönen ilan id'si ile İlanlar ekranındaki düzenleme sayfasına git.
   - "Bana ata" düğmesi ve atanan filtresi (Didem kendi kuyruğunu görsün).
   - Elle aday ekleme formu (tabela, Facebook grubu, tavsiye gibi kaynaklar için).
   - CSV içe aktarma (radar çıktısı): sütunlar adaylar tablosuyla aynı adlarda; kaynak +
     kaynak_ilan_no tekrar ederse güncelle (upsert).

2. İLANLAR
   - Liste: durum filtresi (taslak / yayında / kaldırıldı), tip, mahalle, demo.
   - Düzenleme sayfası: tüm alanlar, tipe göre değişen form (gunluk'ta sezon_fiyatlari için üç
     alan; sezonluk'ta sezon tarihleri ve kira_suresi_gun; satilik/kiralik'te eids_no).
   - Fotoğraf yükleme: 'ilan-fotolari' bucket'ına, sürükle-bırak sıralama, oda etiketi seçimi.
   - Çeviriler sekmesi: EN / RU / DE başlık ve açıklama alanları.
   - Yetki sözleşmesi yükleme: PDF, 'sozlesmeler' bucket'ına (private) → yetki_sozlesmesi_url.
     "Sahip KVKK açık rızası alındı" kutusu → kvkk_riza_at = now().
   - YAYIN KONTROL LİSTESİ (sağ panelde, canlı): 
       ✓/✗ Yetki sözleşmesi yüklendi
       ✓/✗ KVKK açık rızası
       ✓/✗ EİDS no (satilik/kiralik)
       ✓/✗ Turizm izin belge no (gunluk; sezonluk'ta kira 100 günü aşmıyorsa)
       ✓/✗ En az 5 fotoğraf
     Hepsi tamam değilse "Yayınla" düğmesi pasif ve eksikler yazılı. Veritabanı da bu kuralları
     CHECK ile zorluyor; hata gelirse anlaşılır Türkçe mesaja çevir.
   - "Yayından kaldır" düğmesi (durum = kaldirildi).

3. BAŞVURULAR (ev sahiplerinin formdan gelen başvuruları): liste, durum değiştirme, not,
   "Adaya dönüştür" (adaylar tablosuna kaynak='form' ile kopyalar).

4. TALEPLER (alıcı/kiracı talepleri): ilan bağlantısıyla liste, durum, not.

5. SESLİ ARAMALAR (admin): sesli_arama_kayitlari son 500 kayıt — metin, çıkarılan filtreler
   (JSON), tarih. Anlaşılmayan aramaları süzme seçeneği.

6. KULLANICILAR (admin): user_roles yönetimi (e-posta ile kullanıcı bul, admin/ekip rolü ver/al).

Panel masaüstünde tablo, telefonda kart listesi olsun — Didem telefondan da çalışabilmeli.
```

## Prompt 5 — Yasal sayfalar ve son dokunuşlar

```
Footer'a ve /yasal altına şu sayfaları ekle (TR + EN; RU/DE için İngilizceyi göster):
- KVKK Aydınlatma Metni (veri sorumlusu: [ŞİRKET UNVANI — doldurulacak], işlenen veriler:
  başvuru ve talep formları, işleme amaçları, aktarım, saklama süresi, başvuru hakları)
- Açık Rıza Metni
- Çerez Politikası + ilk ziyarette çerez bandı (yalnız zorunlu çerezler varsayılan)
- Kullanım Koşulları
- Ticari İleti Onay Metni (İYS)
Metinleri "TASLAK — hukuki inceleme bekliyor" başlığıyla, genel şablon olarak yaz; şirket
bilgileri için [köşeli parantez] yer tutucular bırak.

Footer'da: Taşınmaz Ticareti Yetki Belgesi No: [doldurulacak], iletişim, sosyal medya.
SEO: her ilan ve mahalle sayfası için başlık/açıklama meta etiketleri, OpenGraph görseli (kapak
fotoğrafı), sitemap.xml ve hreflang (tr/en/ru/de).
```

---

# Ek paket: İlan zekası (NVIDIA), arama sihirbazı, Didem avatarı

Kurulum (promptlardan önce):
1. Supabase SQL Editor'de `supabase/migrations/002_zeka_asistan.sql` çalıştırın.
2. Supabase → Edge Functions → Secrets: `NVIDIA_API_KEY` ekleyin (build.nvidia.com'dan **yeni**
   anahtar alın; eski anahtar bir sohbette paylaşılmıştı). `ANTHROPIC_API_KEY` zaten tanımlı
   olmalı (çeviri ve kırmızı bayrak Claude ile yapılıyor). İsteğe bağlı: `NVIDIA_VISION_MODEL`
   (varsayılan: nvidia/nemotron-3.5-super-vl-120b-a12b).

## Prompt 6 — İlan zekası (admin)

```
Supabase'de "ilan-zeka" adında bir Edge Function oluştur, kodu aynen şu:

<<< supabase/functions/ilan-zeka/index.ts İÇERİĞİNİ BURAYA YAPIŞTIR >>>

Bu fonksiyon JWT doğrulamalı kalsın (verify_jwt = true); yalnız giriş yapmış ekip çağırır.
Sözleşme (iki ayrı iş):
  { ilan_id, is: "foto" }   → { etiketlenen, hatali, kalan }
  { ilan_id, is: "ceviri" } → { diller, kirmizi_bayraklar }
Fotoğraf başına ~25 sn sürer ve her çağrı en fazla 4 fotoğraf işler: kalan > 0 olduğu sürece
"foto" çağrısını tekrarla (hatali > 0 ve etiketlenen = 0 ise döngüyü durdur, sonsuz döngü olmasın).

Admin → İlan düzenleme sayfasına:
1. "Yapay zekâ ile doldur" düğmesi: önce "foto" döngüsü ("Fotoğraflar etiketleniyor… 4 / 12"
   ilerleme çubuğu), sonra "ceviri" ("Çeviriler hazırlanıyor…"). Bitince özet toast, sayfayı
   yenile. İki iş bağımsız: biri hata verirse diğeri yine çalışsın, hatayı toast'ta göster.
2. Fotoğraflar sekmesinde her fotoğrafın oda_etiketi bir açılır listede görünsün; etiket_kaynagi
   'yz' ise yanında küçük "YZ" rozeti ve etiket_aciklama tooltip'i. Kullanıcı etiketi elle
   değiştirirse etiket_kaynagi = 'elle' yaz (YZ bir daha üzerine yazmaz).
3. Çeviriler sekmesindeki EN/RU/DE alanları ceviriler'den dolsun ve elle düzeltilebilsin.
   Çeviri YZ ile geldiyse üstte "Yapay zekâ çevirisi — yayından önce kontrol edin" notu.
4. ilanlar.kirmizi_bayraklar doluysa düzenleme sayfasının en üstünde kırmızı uyarı kutusu
   (ör. "Hisseli tapu", "İmarsız") — yayın kontrol listesinde de "Kırmızı bayraklar gözden
   geçirildi" kutusu olsun (işaretlenmeden Yayınla pasif). Bayrak isimlerini Türkçe etikete çevir:
   hisseli_tapu→Hisseli tapu, imarsiz→İmarsız, iskansiz→İskânsız, kooperatif→Kooperatif,
   kat_irtifaki→Kat irtifakı, kiyi_kenar_cizgisi→Kıyı kenar çizgisi, tarla_vasfi→Tarla vasfı,
   zeytinlik→Zeytinlik, ipotekli→İpotekli, kiracili→Kiracılı, yapi_kayit→Yapı kayıt belgeli.
5. İlan detay sayfasında (ziyaretçi) galeri fotoğrafları oda_etiketi'ne göre gruplanabilsin
   ("Tümü / Salon / Yatak odası / Havuz / Manzara" sekmeleri).
```

## Prompt 7 — Arama sihirbazı (filtre anketi)

`data/sihirbaz.json` içeriğini kopyalayın.

```
Ziyaretçiler filtre panelini kullanmayı bilmiyor. "Ara" denince önce kısa bir sihirbaz açılsın,
gerekli kriterleri biz soralım. Soru seti aşağıdaki JSON'da; src/data/sihirbaz.json olarak ekle
ve sihirbazı bu dosyadan üret (soruları koda gömme):

<<< data/sihirbaz.json İÇERİĞİNİ BURAYA YAPIŞTIR >>>

Davranış:
1. Ana sayfadaki büyük "Ev ara" düğmesi ve /ara sayfasına filtresiz gelen ziyaretçi için
   tam ekran (mobilde) / ortada büyük kart (masaüstünde) sihirbaz açılır.
2. Her ekranda TEK soru, büyük dokunulabilir kartlar (ikonlu), üstte ilerleme çubuğu
   ("3 / 7"), "Geri" ve "Atla" (zorunlu olmayanlarda). Tek seçimli sorularda karta dokununca
   otomatik sonraki soruya geç. Geçişler yumuşak kaydırma animasyonlu.
3. gosterIf koşulu tutmayan adımlar atlanır (ör. tip = satilik ise tarih ve kişi sayısı sorulmaz).
4. "butce" adımında tipe göre birim etiketi ("gecelik", "aylık" …) ve hazirAraliklar kartları;
   altında "Kendim yazayım" ile min/max alanları; para birimi seçici.
5. "bolge" adımında @ ile başlayan seçenekler mahalle gruplarıdır: seçilince o grubun
   mahalleler listesi filtreye eklenir; @harita seçilirse mahalleler tablosundan Leaflet haritada
   tıklanabilir mahalle noktaları açılır.
6. Son ekranda seçimlerin özeti (düzenlemek için her satıra dokunulabilir) ve büyük
   "İlanları göster" düğmesi → /ara?<filtreler>. Sonuç sayısını önceden göster
   ("23 ilan bulundu"); 0 ise hangi kriteri gevşetmeyi önerdiğini yaz (en kısıtlayıcı olanı:
   önce bütçe, sonra bölge, sonra olmazsa olmazlar).
7. Sihirbazın ilk ekranında iki küçük alternatif bağlantı: "Didem'le konuşarak ara" (Prompt 8)
   ve "Filtreleri kendim seçeyim" (doğrudan filtre paneli).
8. Sihirbaz açılınca asistan_oturumlari'na { kanal: 'sihirbaz', dil } ile bir kayıt ekle;
   bitince filtreler ve sonuc_sayisi ile ayrı bir kayıt daha ekle (anon update yok, o yüzden
   yeni satır). Admin → "Sesli aramalar" sayfasına bir "Sihirbaz / asistan oturumları" sekmesi
   ekle: kaç kişi başladı, kaçı bitirdi, en çok hangi adımda bırakıldı.
9. /ara sayfasında filtre panelinin üstünde "Sihirbazla yeniden ara" bağlantısı.
```

## Prompt 8 — Didem'le konuşarak ara (avatar asistanı, 1. aşama)

Ayrıntılar ve gerçek video avatar planı: `../docs/avatar-didem.md`. Bu prompt avatar katmanını
değiştirilebilir yazar; şimdilik Didem'in fotoğrafı + tarayıcının kendi sesiyle çalışır.

```
Supabase'de "asistan" adında bir Edge Function oluştur, kodu aynen şu:

<<< supabase/functions/asistan/index.ts İÇERİĞİNİ BURAYA YAPIŞTIR >>>

verify_jwt = false (ziyaretçiler giriş yapmadan konuşur). Sözleşme:
  istek { mesajlar: {rol: "kullanici"|"asistan", metin}[], filtreler, dil, oturum_id? }
  yanıt { cevap, filtreler, secenekler: string[], tamamlandi: boolean, oturum_id }
Konuşma geçmişini istemci tutar; her turda tüm mesajları ve son filtreleri gönder, dönen
oturum_id'yi sonraki turlarda geri yolla.

Arayüz — "Didem'le konuşarak ara":
1. Ana sayfada ve sihirbazın ilk ekranında "Didem'le konuşarak ara" düğmesi. Basınca
   (mobilde tam ekran, masaüstünde sağ altta büyük panel) asistan ekranı açılır. Avatar KENDİLİĞİNDEN
   başlamaz; yalnız bu düğmeyle.
2. Üstte avatar alanı. Avatarı ayrı bir bileşen olarak yaz: <AvatarSahnesi konusuyor={bool}
   metin={string} onBitti={fn} />. Arayüzü şimdiki ve gelecekteki uygulamalar paylaşsın:
     - Şimdiki uygulama "FotoAvatar": src/assets/didem.jpg (yer tutucu, sonra gerçek fotoğraf
       konacak) yuvarlak çerçevede; konuşurken çerçevede nabız gibi ses dalgası animasyonu.
       Sesi tarayıcının speechSynthesis'i ile çal (dil: tr-TR/en-US/ru-RU/de-DE, mümkünse kadın
       sesi seç), onend'de onBitti çağır.
     - Gelecekteki "VideoAvatar" (gerçek avatar sağlayıcısı, WebRTC) aynı props'la takılacak;
       şimdilik yazma, sadece bileşen seçimi tek bir sabitten yapılsın (AVATAR_MODU = "foto").
3. Avatarın üstünde her zaman görünen etiket: "Yapay zekâ asistanı — Didem'in görünüşü ve
   sesiyle" (seçili dilde).
4. Akış: ekran açılınca asistan'ı boş mesajlarla çağır → dönen cevabı avatar söyler ve altında
   altyazı olarak da yazar → secenekler çip olarak görünür → avatar susunca mikrofon otomatik
   dinlemeye başlar (Web Speech API, interimResults açık, konuşulan metin canlı görünür).
   Kullanıcı çipe dokunabilir, konuşabilir ya da yazabilir (altta metin kutusu her zaman var).
5. Kullanıcı avatar konuşurken konuşmaya başlarsa ya da çipe dokunursa avatarı sustur (söz kesme).
6. Her turda dönen filtreler ekranın altında küçük "anlaşılan" etiketleri olarak birikir
   ("Tatil · 6 kişi · ≤ 8.000 ₺/gece · Bitez"); etikete dokunup silinebilir (silinince filtre
   güncellenir ve bir sonraki turda asistan'a gönderilir).
7. tamamlandi = true gelince: avatar cevabını bitirdikten sonra panel küçülür, /ara sonuçları
   filtrelerle açılır; asistan paneli sağ altta küçük bir balon olarak kalır, kullanıcı
   "daha ucuz olsun" gibi düzeltmeler söyleyebilir (aynı konuşma devam eder, filtreler ve
   sonuçlar canlı güncellenir).
8. Sınırlar: tek oturum en fazla 20 tur ya da 5 dakika; kullanıcı 30 saniye sessiz kalırsa
   mikrofon kapanır ve "Devam etmek için dokunun" yazar. Web Speech API desteklenmiyorsa
   yalnız yazılı sohbet + sesli okuma çalışsın.
9. Hata olursa: "Şu an bağlantı kuramıyorum, sihirbazla devam edebilirsiniz" + sihirbaza geçiş
   düğmesi; o ana kadar anlaşılan filtreler sihirbaza taşınsın.
10. Panelde küçük "Gerçek biriyle konuşmak istiyorum" bağlantısı → ad/telefon formu
   (talepler tablosuna, ilan_id boş, mesaj alanına konuşma özeti; KVKK onay kutusu zorunlu).
```

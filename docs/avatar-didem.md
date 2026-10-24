# Didem avatarı — konuşan arama asistanı

Karar (2026-10-22): Sitedeki arama asistanı ekipten Didem'in görünüşü ve klonlanmış sesiyle
konuşan, gerçeğe yakın bir video avatar olacak. Kriterleri konuşarak sorar, filtreleri doldurur.

## Mimari

```
Ziyaretçi konuşur ─► tarayıcıda yazıya çevirme (Web Speech / sağlayıcının STT'si)
   ─► asistan (Supabase Edge Function, Claude) ─► { cevap, filtreler, secenekler, tamamlandi }
   ─► cevap metni ─► avatar sağlayıcısı: Didem'in klon sesi + yüzüyle canlı video (WebRTC)
   ─► filtreler ─► /ara sonuçları (tamamlandi = true olunca)
```

Beyin (ne sorulacağı, filtreler) bizde kalır; avatar sağlayıcısı yalnız "verilen metni Didem'in
sesi ve yüzüyle söyle" işini yapar. Böylece sağlayıcı değişse de mantık değişmez.

## 1. Önce: Didem'in yazılı rızası (zorunlu)

Ses ve yüz görüntüsünden üretilen avatar biyometrik veri işler; KVKK'da özel nitelikli veridir.
Didem bir çalışan olduğu için rızanın gerçekten serbest olması önemli.

- [ ] Ayrı, yazılı **açık rıza metni**: hangi verinin (ses, video) hangi amaçla (sitedeki asistan),
      hangi sağlayıcıya (yurt dışı aktarım!) aktarıldığı, ne kadar süre kullanılacağı.
- [ ] **Geri alma hakkı**: Didem istediği an rızasını geri alabilir; avatar ve ses modeli
      sağlayıcıdan silinir. İşten ayrılırsa da silinir. Bu madde sözleşmede açık olsun.
- [ ] Avatarın söyleyebileceklerinin sınırı: yalnız arama asistanlığı; Didem adına söz, fiyat,
      pazarlık yok (asistan sistem metninde zorlanıyor).
- [ ] Avukata gösterilecek (yurt dışına aktarım + biyometrik veri).

## 2. Sitede şeffaflık (zorunlu)

- Avatarın üstünde sabit etiket: **"Yapay zekâ asistanı — Didem'in görünüşü ve sesiyle"**.
- Asistan ilk cümlesinde yapay zekâ olduğunu söyler; sorulursa açıkça söyler (sistem metninde var).
- AB'den gelen ziyaretçiler için AB Yapay Zekâ Yasası'nın şeffaflık kuralı (yapay zekâyla
  konuşulduğunun ve sentetik görüntü/sesin belirtilmesi) — etiket bunu karşılar.

## 3. Kayıt rehberi (Didem için)

Sağlayıcıyı seçince onun güncel şartnamesine göre son haline getirilecek; genel olarak:

**Video (avatar için)**
- 2–5 dakika, kesintisiz tek çekim, 1080p veya 4K, kamera sabit (tripod), göz hizasında.
- Yüz ve omuzlar kadrajda, kameraya bakarak doğal konuşma; arada 1–2 saniyelik ağzı kapalı,
  gülümseyen duraklamalar.
- Aydınlık ve eşit ışık (pencere karşıdan ya da iki yumuşak ışık), arkada sade ve düzgün fon.
- Sessiz oda, yaka mikrofonu. Saç yüzü kapatmasın; elleri az hareket ettirsin.
- Sitede görünmesini istediğimiz kıyafet (sonradan değiştirilemez).

**Rıza kaydı**: Sağlayıcıların çoğu, Didem'in kameraya kendi rızasını söylediği kısa ayrı bir video
istiyor (sağlayıcının verdiği metinle). Bunu sağlayıcı seçilince çekeriz.

**Ses (klon için)**: Videodaki ses çoğu zaman yeter. Daha doğal Türkçe için ayrıca sessiz
ortamda 10–30 dakika okuma kaydı (ilan metinleri, sorular, rakamlar, mahalle adları:
Gümüşlük, Göltürkbükü, Yalıkavak…).

## 4. Sağlayıcı seçimi (karar bekliyor)

Canlı (gerçek zamanlı) konuşan, videodan özel avatar üretebilen ve Türkçe konuşan bir servis
gerekiyor. Adaylar: **HeyGen** (etkileşimli avatar), **Tavus**, **D-ID**, **Simli**. Ses klonu
sağlayıcının kendisinden ya da **ElevenLabs**'ten (Türkçe destekli) olabilir.

Seçimden önce her biri için kontrol edilecekler:

| Ölçüt | Neden |
|-------|-------|
| Türkçe dudak senkronu ve klon ses kalitesi | Bodrum mahalle adları ve rakamlarla dene |
| Gecikme (konuşma bitti → avatar başladı) | 2 sn üstü sohbeti bozar |
| Dakika başı fiyat + aylık sabit | Ziyaretçi başı ortalama 2–3 dk konuşma varsayımıyla hesapla |
| "Verilen metni söyle" modu | Beyin bizde kalsın diye şart |
| Veri nerede tutuluyor, silme süreci | KVKK, Didem'in geri alma hakkı |
| Mobil tarayıcı (iOS Safari) desteği | Ziyaretçilerin çoğu telefondan |

**Maliyet kontrolü**: Avatar yalnız kullanıcı "Didem'le konuş" düğmesine basınca başlar; tek
oturum en fazla 5 dakika; sessizlikte 30 sn sonra kapanır; günlük toplam dakika sınırı.

## 5. Aşamalar

**Durum (2026-10-24):** Aşama 1 ve sağlayıcıdan bağımsız ses katmanı tamam (Hono uygulaması, `web/`):
- Admin → **Avatar** (yalnız admin): yazılı rıza (tarih + imzalı PDF), fotoğraf, ses modu, günlük karakter
  sınırı ve kullanım, ses denemesi, **rızayı geri al** (fotoğraf, ses önbelleği ve ElevenLabs ses modeli
  silinir, site anında genel görsel + tarayıcı sesine döner). Okuma metni: Admin → Avatar → kayıt metni.
- Klon ses: ElevenLabs (`ELEVENLABS_API_KEY`, `ELEVENLABS_SES_ID`, isteğe bağlı `ELEVENLABS_MODEL`).
  `/api/ses` yalnız sunucunun imzaladığı metni okur (asistan cevapları + sayfadaki sabit cümleler);
  kimse Didem'in sesiyle keyfi cümle söyletemez. Aynı cümle bir kez üretilip diskte saklanır.
- Sitede: rıza yoksa ya da geri alındıysa fotoğraf ve klon ses gösterilmez. Klon seste fotoğraf, sesin
  şiddetine göre canlanır.
- Rıza metni taslağı: `docs/avatar-riza.md` (avukat onayı bekliyor).
- Kalan: video avatar sağlayıcısı (aşağıdaki ölçütlerle deneme), video kaydı ve sağlayıcının rıza videosu.

Orijinal plan:

1. **Şimdi (Lovable Prompt 8)**: Asistan konuşma akışı + Didem'in fotoğrafı + tarayıcının kendi
   sesi (ücretsiz). Avatar katmanı değiştirilebilir bileşen olarak yazılır.
2. **Didem kaydı + rıza** → sağlayıcıyla 1 haftalık deneme (Türkçe kalite, gecikme, maliyet).
3. **Gerçek avatar**: Sağlayıcı oturum anahtarını Supabase Edge Function'dan alan (API anahtarı
   tarayıcıya hiç inmez) avatar bileşeni; Prompt 8'deki yer tutucunun yerine geçer.

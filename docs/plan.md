# MVP planı (6 hafta)

## Hipotez

Bodrum'da sahibinden ve piyasa altı ilan sahiplerinin anlamlı bir kısmı (hedef: ulaşılanların
≥%10'u) ücretsiz değerleme, çok dilli yayın ve yabancı alıcı erişimi karşılığında bize yetki
verir.

## Pilot mahalleler (ilk 3 + yedek)

| Mahalle | Neden |
|---------|-------|
| Bitez | Orta-üst segment, dört tip de yoğun (aile yazlığı + uzun kira) |
| Turgutreis | Yüksek hacim, yabancı alıcı yoğun, fiyat karşılaştırması kolay |
| Konacık | Merkeze yakın, uzun dönem kiralık pazarı (yerleşik halk) |
| Yedek: Gümüşlük / Yalıkavak | Lüks segment testi, günlük kirada yüksek gecelik |

## Haftalar

| Hafta | İş | Çıktı |
|-------|----|-------|
| 1 | Şema, mahalle listesi, sahip tespiti ve fiyat skoru iskeleti | Bu repo |
| 1–2 | Radar: 3 mahallede 4 tip ilanın yarı manuel toplanması, normalize | ≥1.000 gözlem |
| 2–3 | Karşılaştırma grupları, medyan + MAD skoru; hedonik model (LightGBM) denemesi | Haftalık "fırsat listesi" |
| 3–4 | Haftada 30–50 sahibe birebir temas, CRM | Yanıt / ilgi / sözleşme oranları |
| 4–5 | Onaylı ilanlarla çok dilli site (TR/EN/RU/DE) | Yayında ≥10 ilan |
| 5–6 | Alıcı/kiracı tarafı reklam testi (yabancı + yerli) | Lead başı maliyet |

## Metrikler

- Radar: günlük yeni ilan, tekilleştirme oranı, sahibinden oranı
- Huni: aday → temas → yanıt → ilgi → sözleşme → yayın → işlem
- Fiyat: işaretlenen "ucuz" ilanların gerçek kapanış fiyatı (model kalibrasyonu)

## Açık sorular

1. Yetki belgesi kimde? (şirket / ortak ofis)
2. Kim arayacak, hangi script ile?
3. Günlük kirada model: sadece ilan mı, yoksa operasyon (temizlik, check-in) da mı?
4. Komisyon mu, sabit paket mi, ikisi birden mi?

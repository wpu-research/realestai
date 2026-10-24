# İlan fotoğraflarından temsili 3D görsel

Karar (2026-10-22): 3D görsel **yalnızca ilandaki fotoğraflardan** üretilir, ek çekim yapılmaz.
Her görselde "temsilidir" uyarısı gösterilir.

## Gerçekçi beklenti

İlan fotoğrafları 3D için kötü girdidir: az sayıda (10–30), geniş açı, odalar arası örtüşme
yok, kamera konumu bilinmiyor. Bu yüzden **evin tamamının ölçülü modeli çıkmaz**. Çıkabilecek
olan:

| Durum | Yöntem | Sonuç |
|-------|--------|-------|
| Aynı odanın ≥2 örtüşen fotoğrafı | Poz-bağımsız ileri beslemeli rekonstrüksiyon (VGGT / MASt3R) → Gaussian splat | Oda içinde sınırlı açıyla gezinilebilir 3D |
| Odanın tek fotoğrafı | Monoküler derinlik (MoGe / Depth Anything V2) → 2.5D sahne | Fareyle/eğimle hareket eden derinlikli "3D fotoğraf" |
| Görünmeyen kısımları da doldurmak | Görüntüden-dünya üretici modeller (ör. World Labs Marble; API ve lisans kontrol edilecek) | Daha sürükleyici ama **uydurma** kısımlar içerir — uyarı bu yüzden şart |
| Kat planı | Fotoğraflar + ilan m²/oda bilgisi → LLM/vision ile şematik plan | "Tahmini kat planı" |

## Durum (2026-10-24)

**Katman 1 — tek fotoğraftan derinlikli görünüm: yayında.**
- Model: Depth Anything V2 **Small** (Apache-2.0, ticari kullanım serbest). Base/Large sürümleri
  CC-BY-NC — **kullanılmaz**.
- Üretim admin tarayıcısında (transformers.js; WebGPU, yoksa WASM). Sunucuda GPU gerekmez, maliyet yok.
  Admin → ilan → "Temsili 3D" → "Eksik derinlikleri üret" → önizle → **Onayla** (kalite kapısı: yalnız
  onaylı olanlar sitede; derinlik farkı çok düşükse uyarı).
- Sitede ilan galerisinde "3D görünüm (temsili)" düğmesi → WebGL paralaks görüntüleyici; filigran
  ve uyarı metni (TR/EN/RU/DE) her zaman görünür.
- DEMO ilanlar için derinlikler `web/scripts/demo-derinlik.py` ile yerelde üretildi.

**Katman 2 — aynı odanın birden çok fotoğrafından gezinilebilir 3D (Gaussian splat): karar bekliyor.**
Kiralık GPU (Modal/RunPod) mı, ücretli servis mi seçilecek; lisansı ticari kullanıma uygun model
seçilmeli (VGGT/MASt3R lisansları kontrol edilecek).

## Boru hattı

1. **Fotoğraf sınıflandırma** — vision model (Claude) her fotoğrafa oda etiketi verir:
   salon, mutfak, yatak_odasi, banyo, dis_cephe, havuz, bahce, manzara, diger. Aynı oda
   fotoğrafları örtüşmeye göre gruplanır.
2. **Oda başına yöntem seçimi** — örtüşen ≥2 fotoğraf varsa çoklu görüntü, yoksa tek görüntü.
3. **Üretim** — GPU işi (yerelde RTX 4070 8 GB ile prototip; üretimde Modal/RunPod/Replicate,
   Railway'de GPU yok).
4. **Kalite kapısı** — otomatik kontrol (boş/bozuk splat, aşırı gürültü) + ilk 100 ilanda
   elle onay. Kötü sonuç yayınlanmaz; ilan 3D'siz kalır.
5. **Yayın** — web'de Gaussian splat görüntüleyici (three.js tabanlı), oda oda geçiş.

## Uyarı metni (görüntüleyicide her zaman görünür, kapatılamaz)

> **Temsili görseldir.** Bu 3D görünüm ilan fotoğraflarından yapay zekâ ile otomatik
> üretilmiştir. Ölçüler, oda düzeni, malzeme ve görünüm gerçeği yansıtmayabilir; bazı
> alanlar yapay zekâ tarafından tamamlanmıştır. Karar vermeden önce mülkü yerinde görün.

EN / RU / DE çevirileri sitenin diğer dilleriyle birlikte. Uyarı ayrıca görüntüleyicinin
köşesinde kalıcı filigran ("Temsili — YZ ile üretildi") olarak durur; ekran görüntüsü
alınsa bile görünür.

## Hukuki not

Uyarı yanıltıcı reklam riskini azaltır, ama fotoğrafın telif hakkı sorununu çözmez:
3D üretilen fotoğraflar, sahibinin yetki verdiği ilanlardan gelmeli (bkz. `hukuk.md`).

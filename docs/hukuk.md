# Hukuki çerçeve — kontrol listesi

> Avukata danışmadan canlıya çıkılmaz. Aşağıdakiler bizim çalışma varsayımlarımız; madde
> numaraları ve güncel yönetmelik metni avukatla teyit edilecek.

## Tüm tipler için

- [ ] **Taşınmaz Ticareti Yetki Belgesi** — şirkette ya da ortak emlak ofisinde. Aracılık ve
      komisyon için şart.
- [ ] **Yazılı yetki sözleşmesi** — her ilan için, mülk sahibiyle. Sözleşme olmadan ilan yok.
- [ ] **EİDS (Elektronik İlan Doğrulama Sistemi)** — satılık/kiralık ilanlar e-Devlet
      üzerinden sahip veya sözleşmeli yetkili tarafından doğrulanır.
- [ ] **KVKK** — aydınlatma metni + açık rıza. VERBİS kaydı gerekip gerekmediği kontrol edilecek.
- [ ] **İYS** — ticari elektronik ileti (SMS/e-posta) yalnızca onaylı alıcılara.
- [ ] **Kaynak platform kullanım koşulları** — sahibinden.com otomatik taramayı yasaklıyor.
      Radar insan destekli ve düşük hızlı çalışır; toplu kopyalama yok, fotoğraf/metin
      kopyalanmaz, sitemizdeki içerik sahibinden yeniden alınır.

## Veri minimizasyonu (radar aşaması)

- Telefon numarası **saklanmaz**. Emlakçı tespiti için yalnızca tuzlu hash (`telefon_hash`).
- İlk temas kaynak platformun kendi mesajlaşma kanalı üzerinden, birebir.
- İletişim bilgisi ancak sahip yanıt verip rıza verdikten sonra `sahip` tablosuna girer.
- Yanıt vermeyen ilanın gözlem kaydı 90 gün sonra anonimleştirilir (fiyat istatistiği kalır).

## Satılık

- [ ] Tapu türü teyidi: kat mülkiyeti / kat irtifakı / hisseli / arsa / tarla.
- [ ] Kırmızı bayraklar ilanda açıkça belirtilir: hisseli tapu, imarsız yapı, kooperatif,
      kıyı kenar çizgisi, zeytinlik.
- [ ] Yabancı alıcı için: askeri/güvenlik bölgesi kontrolü, ekspertiz raporu süreci.

## Kiralık (uzun dönem)

- [ ] Yetki sözleşmesi + EİDS.
- [ ] Kira artış sınırları ve depozito bilgisi ilan metninde yanıltıcı olmamalı.

## Sezonluk ve günlük

- [ ] **7464 sayılı Konutların Turizm Amaçlı Kiralanmasına İlişkin Kanun (2024):** konutun
      100 günü aşmayan sürelerle turizm amaçlı kiralanması için Kültür ve Turizm Bakanlığı
      **izin belgesi** gerekir. Kat mülkiyetli binalarda diğer maliklerin oybirliği şartı var.
- [ ] İzin belge numarası ilan sayfasında gösterilir; numarası olmayan ilan yayına girmez
      (şemada `CHECK` kısıtı).
- [ ] Platform yükümlülükleri ve idari para cezaları avukatla teyit edilecek.
- [ ] Sezonluk kira 100 günü aşıyorsa izin belgesi şartı düşebilir — sözleşme süresi kayıt
      altına alınır (`kira_suresi_gun`).
- [ ] Konaklama vergisi ve kimlik bildirimi yükümlülükleri (ev sahibine bilgilendirme).

# RealEstAi — Bodrum pilotu

Sahibinden (emlakçısız) ve piyasa altı fiyatlı ilanları bulan, sahibine ulaşan ve **sahibinin
onayı ile** kendi sitemizde yayınlayan platform. Pilot bölge: Bodrum, ikinci halka Milas kıyısı
ve Didim.

## İlan tipleri

| Tip | Tanım | "Ucuz" ölçütü | Yayın şartı (bizim tarafta) |
|-----|-------|---------------|------------------------------|
| `satilik` | Satış | TL / net m² | Yetki sözleşmesi + EİDS doğrulaması |
| `kiralik` | Uzun dönem kira (yıllık sözleşme) | Aylık TL / net m² | Yetki sözleşmesi + EİDS doğrulaması |
| `sezonluk` | Birkaç aylık yazlık kira (ör. Mayıs–Ekim) | Aylık TL / net m² | 100 günden kısaysa turizm izin belgesi no |
| `gunluk` | Gecelik / haftalık tatil kirası | Gecelik TL / kişi, sezon bandına göre | **Turizm izin belgesi no zorunlu** |

Ayrıntılar: [docs/hukuk.md](docs/hukuk.md).

## Akış

```
Keşif (radar)  →  Normalize + tekilleştir  →  Sahibinden mi?  →  Ucuz mu?
      →  Birebir iletişim  →  Onay + yetki sözleşmesi + KVKK rızası  →  Yayın
```

Radarın gördüğü ilan **asla doğrudan yayınlanmaz**. Yayın tablosu veritabanı seviyesinde
yetki sözleşmesi ve rıza ister (`db/schema.sql`, `yayin` tablosu).

## Dizin

| Yol | İçerik |
|-----|--------|
| `docs/hukuk.md` | Tip bazında hukuki kontrol listesi |
| `docs/plan.md` | MVP planı, metrikler, açık sorular |
| `docs/gorsel-3d.md` | İlan fotoğraflarından temsili 3D görsel boru hattı + uyarı metni |
| `docs/avatar-didem.md` | Didem avatarı: rıza, kayıt rehberi, sağlayıcı seçimi, aşamalar |
| `data/mahalleler.csv` | Pilot bölge mahalleleri, segment ve sezon hipotezleri |
| `db/schema.sql` | Postgres + PostGIS şeması |
| `src/realestai/` | Sahip tespiti (`sahip_tespiti.py`) ve fiyat skorlama (`fiyat.py`) |
| `tests/` | pytest |
| `web/` | **Asıl site (Railway)**: Node + Hono + Postgres; halka açık site, sihirbaz, Didem asistanı, admin paneli |
| `lovable/` | Eski Lovable/Supabase paketi (yerini `web/` aldı) |

## Çalıştırma

```bash
python3 -m pytest -q
```

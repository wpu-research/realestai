-- 003: Ayrıntılı filtreler (Bodrum/Muğla gereksinim listesi), favori/kayıtlı arama ölçümü.
-- Etiket tipi özellikler (iç, dış, muhit, ulaşım, manzara, uygunluk) tek dizi kolonda:
-- anahtar listesi src/lib/ozellikler.ts'te.

alter table mahalleler add column if not exists il text;
update mahalleler set il = case ilce when 'Didim' then 'Aydın' else 'Muğla' end where il is null;
alter table mahalleler alter column il set not null;

alter table ilanlar drop constraint if exists ilanlar_emlak_turu_check;
alter table ilanlar add constraint ilanlar_emlak_turu_check check (emlak_turu in
  ('daire', 'villa', 'dubleks', 'tripleks', 'tek_kat_villa', 'mustakil', 'rezidans', 'arsa', 'diger'));

alter table ilanlar
  add column if not exists kat_sayisi smallint,
  add column if not exists isitma text check (isitma in ('yok', 'klima', 'kombi', 'merkezi', 'yerden', 'soba', 'isi_pompasi')),
  add column if not exists mutfak text check (mutfak in ('kapali', 'acik')),
  add column if not exists balkon boolean,
  add column if not exists asansor boolean,
  add column if not exists yapi_durumu text check (yapi_durumu in ('sifir', 'ikinci_el')),
  add column if not exists ozel_alan boolean,
  add column if not exists tapu_durumu text check (tapu_durumu in ('kat_mulkiyeti', 'kat_irtifaki', 'hisseli', 'mustakil_tapu', 'arsa_tapu')),
  add column if not exists ilan_veren text not null default 'sahibinden' check (ilan_veren in ('sahibinden', 'emlakci')),
  add column if not exists video_url text,
  add column if not exists cephe text[] not null default '{}',
  add column if not exists ozellikler text[] not null default '{}',
  add column if not exists kesin_konum boolean not null default false;   -- lat/lng mahalle merkezi değil, gerçek konum

create index if not exists ilanlar_ozellikler_gix on ilanlar using gin (ozellikler);

-- Kaydedilen aramalar ve favoriler tarayıcıda tutulur; burada yalnız anonim sayaç (hangi ilan kaç kez kaydedildi).
create table if not exists favori_sayaci (
  ilan_id uuid primary key references ilanlar(id) on delete cascade,
  adet integer not null default 0
);

-- "Bana emlakçı bul" talepleri talepler tablosunu kullanır; konu alanı eklenir.
alter table talepler add column if not exists konu text not null default 'ilan'
  check (konu in ('ilan', 'emlakci_bul', 'gercek_kisi'));
alter table talepler add column if not exists ayrinti jsonb;

-- DEMO ilanlara örnek özellikler (yalnız demo; gerçek ilanlarda ekip doldurur).
update ilanlar set emlak_turu = 'tek_kat_villa' where demo and baslik like 'Gümüşlük%';
update ilanlar set emlak_turu = 'dubleks' where demo and baslik like 'Yalıkavak%';
update ilanlar set
  kat_sayisi = case when emlak_turu = 'daire' then 3 else 2 end,
  kat = case when emlak_turu = 'daire' then 1 else 0 end,
  isitma = case when emlak_turu in ('villa', 'tek_kat_villa', 'dubleks') then 'yerden' else 'klima' end,
  mutfak = case when ilan_no % 2 = 0 then 'acik' else 'kapali' end,
  balkon = true, asansor = false, yapi_durumu = case when bina_yasi <= 5 then 'sifir' else 'ikinci_el' end,
  ozel_alan = emlak_turu <> 'daire',
  tapu_durumu = 'kat_mulkiyeti',
  cephe = case when deniz_manzarasi then '{guney,bati}'::text[] else '{dogu}'::text[] end,
  ozellikler = array_remove(array[
    'klima', 'celik_kapi',
    case when havuz <> 'yok' then 'bahce' end,
    case when emlak_turu <> 'daire' then 'teras' end,
    case when emlak_turu <> 'daire' then 'mangal' end,
    case when site_ici then 'guvenlik' end,
    case when site_ici then 'cocuk_oyun' end,
    case when emlak_turu in ('villa', 'tek_kat_villa', 'dubleks') then 'ebeveyn_banyosu' end,
    case when emlak_turu in ('villa', 'tek_kat_villa') then 'somine' end,
    'market', 'restoran',
    case when denize_mesafe_m <= 500 then 'plaj' end,
    case when emlak_turu = 'daire' then 'dolmus' end,
    'ana_yol',
    case when deniz_manzarasi then 'deniz_manzarasi' else 'doga_manzarasi' end,
    case when evcil_hayvan then 'hayvanli_uygun' end,
    case when emlak_turu = 'tek_kat_villa' then 'engelli_yasli_uygun' end
  ], null)
where demo;

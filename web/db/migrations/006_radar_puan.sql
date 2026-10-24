-- 006: Radar puanlaması — adaylar için piyasa karşılaştırması ve sahip olasılığı gerekçeleri.
alter table adaylar
  add column if not exists aciklama text,                         -- kaynak ilan metni (sahip tespiti için)
  add column if not exists ilan_veren text check (ilan_veren in ('sahibinden', 'emlakci', 'bilinmiyor')),
  add column if not exists sezon_ay numeric(4,1),                  -- sezonluk: kira süresi (ay)
  add column if not exists birim_fiyat numeric(14,2),              -- TL/m², TL/m²/ay ya da TL/kişi/gece
  add column if not exists robust_z numeric(6,2),
  add column if not exists grup_buyuklugu integer,
  add column if not exists grup_adi text,
  add column if not exists firsat boolean not null default false,
  add column if not exists puan_gerekce jsonb,                     -- {fiyat: [...], sahip: [...]}
  add column if not exists puanlandi_at timestamptz,
  add column if not exists elle_puan boolean not null default false; -- CSV/elle verilen değerler korunur

create index if not exists adaylar_telefon_ix on adaylar (regexp_replace(coalesce(telefon, ''), '\D', '', 'g'));

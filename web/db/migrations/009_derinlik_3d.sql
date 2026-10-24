-- 009: Tek fotoğraftan derinlikli "3D fotoğraf" (tek_goruntu_derinlik). Her fotoğrafa en fazla bir tane.
alter table gorsel_3d
  add column if not exists foto_id uuid references ilan_fotolari(id) on delete cascade,
  add column if not exists kalite jsonb,                -- {derinlik_sapma, uyari}
  add column if not exists model text;                  -- üreten model (lisans takibi için)
create unique index if not exists gorsel_3d_foto_yontem_ux on gorsel_3d (foto_id, yontem) where foto_id is not null;

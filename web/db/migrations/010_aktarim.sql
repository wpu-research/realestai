-- Kaydedilenleri başka cihaza taşıma: hesap yok; kısa kod 24 saat geçerli, sonra silinir.
create table aktarimlar (
  kod text primary key,
  veri jsonb not null,
  son timestamptz not null default now() + interval '24 hours',
  kullanim int not null default 0,
  created_at timestamptz not null default now()
);
create index aktarimlar_son on aktarimlar (son);

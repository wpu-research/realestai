-- 002: NVIDIA ilan zekası (foto etiketi, çeviri, kırmızı bayrak) + arama asistanı kayıtları

alter table public.ilanlar
  add column if not exists kirmizi_bayraklar text[] not null default '{}',
  add column if not exists zeka_guncellendi_at timestamptz;

alter table public.ilan_fotolari
  add column if not exists etiket_kaynagi text check (etiket_kaynagi in ('yz', 'elle')),
  add column if not exists etiket_aciklama text;

-- Asistan / sihirbaz oturumları: hangi soruda bırakıldığını ve hangi filtrelerle bittiğini
-- ölçmek için. Kişisel veri yok (ses kaydı tutulmaz, yalnız yazıya dökülmüş metin).
create table if not exists public.asistan_oturumlari (
  id uuid primary key default gen_random_uuid(),
  kanal text not null check (kanal in ('sihirbaz', 'avatar')),
  dil text not null default 'tr',
  adim_sayisi integer not null default 0,
  filtreler jsonb not null default '{}'::jsonb,
  tamamlandi boolean not null default false,
  sonuc_sayisi integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.asistan_oturumlari enable row level security;
drop policy if exists "herkes oturum acar" on public.asistan_oturumlari;
create policy "herkes oturum acar" on public.asistan_oturumlari
  for insert to anon, authenticated with check (true);
drop policy if exists "ekip okur" on public.asistan_oturumlari;
create policy "ekip okur" on public.asistan_oturumlari
  for select to authenticated using (public.is_staff());
-- Güncelleme yalnız Edge Function (service role) üzerinden; anon update yok.

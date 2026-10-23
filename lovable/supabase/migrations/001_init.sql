-- RealEstAi — Supabase şeması (Lovable)
-- Kural: sitede yalnızca sahibinin yetki verdiği ilanlar görünür. Yayın şartları CHECK ile
-- veritabanında zorlanır; arayüz bunları atlayamaz.

create type public.ilan_tipi as enum ('satilik', 'kiralik', 'sezonluk', 'gunluk');
create type public.ilan_durum as enum ('taslak', 'yayinda', 'kaldirildi');
create type public.app_role as enum ('admin', 'ekip');

-- ---------- Roller (Lovable/Supabase standart deseni) ----------
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'ekip')
$$;

create policy "kendi rolunu gorur" on public.user_roles
  for select to authenticated using (user_id = auth.uid());
create policy "admin rolleri yonetir" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ---------- Mahalleler ----------
create table public.mahalleler (
  id serial primary key,
  ilce text not null,
  ad text not null,
  slug text not null unique,
  bolge text,
  kiyi boolean not null default false,
  segment text,
  lat double precision,
  lng double precision,
  unique (ilce, ad)
);
alter table public.mahalleler enable row level security;
create policy "herkes okur" on public.mahalleler for select using (true);
create policy "ekip yazar" on public.mahalleler for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------- İlanlar ----------
create table public.ilanlar (
  id uuid primary key default gen_random_uuid(),
  ilan_no serial unique,
  tip public.ilan_tipi not null,
  emlak_turu text not null check (emlak_turu in ('daire', 'villa', 'mustakil', 'rezidans', 'arsa', 'diger')),
  durum public.ilan_durum not null default 'taslak',
  demo boolean not null default false,

  baslik text not null,
  aciklama text not null default '',
  ceviriler jsonb not null default '{}'::jsonb,   -- {"en": {"baslik": "...", "aciklama": "..."}, "ru": {...}, "de": {...}}

  mahalle_id int references public.mahalleler(id),
  lat double precision,
  lng double precision,

  net_m2 numeric(8,1),
  brut_m2 numeric(8,1),
  oda text,                                       -- '3+1'
  banyo smallint,
  yatak_kapasitesi smallint,                      -- sezonluk / gunluk
  kat smallint,
  bina_yasi smallint,
  site_ici boolean not null default false,
  havuz text not null default 'yok' check (havuz in ('ozel', 'ortak', 'yok')),
  deniz_manzarasi boolean not null default false,
  denize_mesafe_m integer,
  esyali boolean not null default false,
  otopark boolean not null default false,
  evcil_hayvan boolean,

  fiyat numeric(14,2) not null check (fiyat > 0),
  para_birimi char(3) not null default 'TRY' check (para_birimi in ('TRY', 'EUR', 'USD', 'GBP')),
  fiyat_birimi text not null check (fiyat_birimi in ('toplam', 'aylik', 'sezon', 'gecelik')),
  sezon_fiyatlari jsonb,                          -- gunluk: {"yuksek": 9000, "omuz": 6000, "dusuk": 3500}
  sezon_baslangic date,
  sezon_bitis date,
  kira_suresi_gun integer,
  min_gece smallint,

  komisyon_orani numeric(4,3),                    -- 0.020 = %2; sitede açıkça yazılır
  bolge_medyani numeric(14,2),                    -- aynı tip/mahalle birim fiyat medyanı
  iskonto numeric(5,3),                           -- 0.18 = medyanın %18 altında

  -- Yayın şartları
  yetki_sozlesmesi_url text,
  kvkk_riza_at timestamptz,
  eids_no text,
  turizm_izin_no text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  yayinlandi_at timestamptz,

  constraint yayin_icin_yetki check (
    durum <> 'yayinda' or (yetki_sozlesmesi_url is not null and kvkk_riza_at is not null)
  ),
  constraint yayin_icin_eids check (
    durum <> 'yayinda' or tip not in ('satilik', 'kiralik') or eids_no is not null
  ),
  constraint yayin_icin_turizm_izni check (
    durum <> 'yayinda'
    or tip in ('satilik', 'kiralik')
    or turizm_izin_no is not null
    or (tip = 'sezonluk' and coalesce(kira_suresi_gun, 0) > 100)
  ),
  constraint gunluk_kapasite check (tip not in ('gunluk', 'sezonluk') or yatak_kapasitesi is not null),
  constraint konut_m2 check (tip = 'gunluk' or net_m2 is not null)
);
create index ilanlar_arama_ix on public.ilanlar (durum, tip, mahalle_id);
alter table public.ilanlar enable row level security;

create policy "yayindaki ilanlari herkes okur" on public.ilanlar
  for select using (durum = 'yayinda' or public.is_staff());
create policy "ekip yonetir" on public.ilanlar for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create or replace function public.ilan_guncellendi()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.durum = 'yayinda' and (tg_op = 'INSERT' or old.durum is distinct from 'yayinda') then
    new.yayinlandi_at := now();
  end if;
  return new;
end $$;
create trigger ilanlar_guncellendi before insert or update on public.ilanlar
  for each row execute function public.ilan_guncellendi();

-- ---------- Fotoğraflar ----------
create table public.ilan_fotolari (
  id uuid primary key default gen_random_uuid(),
  ilan_id uuid not null references public.ilanlar(id) on delete cascade,
  url text not null,
  sira smallint not null default 0,
  oda_etiketi text                               -- salon, mutfak, yatak_odasi, banyo, dis_cephe, havuz, bahce, manzara
);
alter table public.ilan_fotolari enable row level security;
create policy "yayindaki ilanin fotolari" on public.ilan_fotolari for select using (
  exists (select 1 from public.ilanlar i where i.id = ilan_id and (i.durum = 'yayinda' or public.is_staff()))
);
create policy "ekip yonetir" on public.ilan_fotolari for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------- Temsili 3D görseller ----------
create table public.gorsel_3d (
  id uuid primary key default gen_random_uuid(),
  ilan_id uuid not null references public.ilanlar(id) on delete cascade,
  oda text not null,
  yontem text not null check (yontem in ('coklu_goruntu', 'tek_goruntu_derinlik', 'uretken_dunya', 'kat_plani')),
  dosya_url text not null,                       -- .splat / .spz / .glb / .png (kat planı)
  onaylandi boolean not null default false,
  temsili boolean not null default true check (temsili),
  created_at timestamptz not null default now()
);
alter table public.gorsel_3d enable row level security;
create policy "onayli 3d herkese" on public.gorsel_3d for select using (
  (onaylandi and exists (select 1 from public.ilanlar i where i.id = ilan_id and i.durum = 'yayinda'))
  or public.is_staff()
);
create policy "ekip yonetir" on public.gorsel_3d for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------- Adaylar: radarın bulduğu ilanlar (yalnız ekip görür) ----------
-- Akış: radar → aday (yeni) → arayan kişi arar → onaylandi → taslak ilan → belgeler → yayinda
-- KVKK: telefon yalnız arama için tutulur; ilana dönüşmeyen adayın telefonu 90 gün sonra silinir
-- (adaylari_temizle). İlk aramada aydınlatma metni okunur (arama_gecmisi.aydinlatma_yapildi).
create type public.aday_durum as enum
  ('yeni', 'aranacak', 'ulasilamadi', 'geri_aranacak', 'ilgileniyor', 'onaylandi', 'reddetti', 'emlakci_cikti');

create table public.adaylar (
  id uuid primary key default gen_random_uuid(),
  kaynak text not null,                          -- sahibinden, hepsiemlak, emlakjet, fb_grup, tabela, diger
  kaynak_url text,
  kaynak_ilan_no text,
  tip public.ilan_tipi not null,
  emlak_turu text,
  baslik text not null,
  mahalle_id int references public.mahalleler(id),
  net_m2 numeric(8,1),
  oda text,
  yatak_kapasitesi smallint,
  fiyat numeric(14,2),
  para_birimi char(3) not null default 'TRY',
  fiyat_birimi text,
  bolge_medyani numeric(14,2),
  iskonto numeric(5,3),
  sahip_olasiligi numeric(4,3),                  -- 0..1, radar tahmini
  oncelik numeric(6,3),                          -- sıralama: sahip_olasiligi × iskonto (pazarlık sinyali +%20)
  yayinda_gun integer,
  fiyat_dustu boolean not null default false,
  kirmizi_bayraklar text[] not null default '{}',
  sahip_adi text,
  telefon text,
  durum public.aday_durum not null default 'yeni',
  atanan uuid references auth.users(id),
  geri_arama_at timestamptz,
  notlar text,
  ilan_id uuid references public.ilanlar(id),    -- onaylanınca oluşan taslak ilan
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kaynak, kaynak_ilan_no)
);
create index adaylar_kuyruk_ix on public.adaylar (durum, oncelik desc);
alter table public.adaylar enable row level security;
create policy "ekip yonetir" on public.adaylar for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create table public.arama_gecmisi (
  id bigserial primary key,
  aday_id uuid not null references public.adaylar(id) on delete cascade,
  arayan uuid references auth.users(id) default auth.uid(),
  sonuc public.aday_durum not null,
  aydinlatma_yapildi boolean not null default false,
  not_metni text,
  created_at timestamptz not null default now()
);
alter table public.arama_gecmisi enable row level security;
create policy "ekip yonetir" on public.arama_gecmisi for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Arama sonucu kaydı adayın durumunu da günceller.
create or replace function public.arama_sonucu_isle()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.adaylar set durum = new.sonuc, updated_at = now() where id = new.aday_id;
  return new;
end $$;
create trigger arama_gecmisi_eklendi after insert on public.arama_gecmisi
  for each row execute function public.arama_sonucu_isle();

-- Onaylanan adaydan taslak ilan oluşturur; ilan id'sini döner. Yayın için belgeler
-- (yetki sözleşmesi, KVKK rızası, EİDS / turizm izni) admin panelinden ayrıca girilir.
create or replace function public.adayi_ilana_cevir(_aday_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  a public.adaylar;
  yeni_id uuid;
begin
  if not public.is_staff() then
    raise exception 'yetkisiz';
  end if;
  select * into a from public.adaylar where id = _aday_id for update;
  if a.id is null then
    raise exception 'aday bulunamadi';
  end if;
  if a.durum <> 'onaylandi' then
    raise exception 'aday onaylanmamis (durum: %)', a.durum;
  end if;
  if a.ilan_id is not null then
    return a.ilan_id;
  end if;

  insert into public.ilanlar (tip, emlak_turu, durum, baslik, mahalle_id, net_m2, oda,
                              yatak_kapasitesi, fiyat, para_birimi, fiyat_birimi,
                              bolge_medyani, iskonto)
  values (a.tip, coalesce(a.emlak_turu, 'daire'), 'taslak', a.baslik, a.mahalle_id, a.net_m2,
          a.oda, a.yatak_kapasitesi, coalesce(a.fiyat, 1), a.para_birimi,
          coalesce(a.fiyat_birimi, case a.tip when 'satilik' then 'toplam'
                                              when 'gunluk' then 'gecelik'
                                              when 'sezonluk' then 'sezon'
                                              else 'aylik' end),
          a.bolge_medyani, a.iskonto)
  returning id into yeni_id;

  update public.adaylar set ilan_id = yeni_id, updated_at = now() where id = _aday_id;
  return yeni_id;
end $$;

-- KVKK saklama: ilana dönüşmeyen ve 90 günden eski adayların kişisel verisini siler.
-- pg_cron ile günlük: select cron.schedule('adaylari-temizle', '0 3 * * *', 'select public.adaylari_temizle()');
create or replace function public.adaylari_temizle()
returns integer language sql security definer set search_path = public as $$
  with silinen as (
    update public.adaylar
       set telefon = null, sahip_adi = null, notlar = null
     where ilan_id is null
       and updated_at < now() - interval '90 days'
       and (telefon is not null or sahip_adi is not null or notlar is not null)
    returning 1
  )
  select count(*)::int from silinen
$$;

-- ---------- Ev sahibi başvuruları ("Evimi listele / değerle") ----------
create table public.basvurular (
  id uuid primary key default gen_random_uuid(),
  ad_soyad text not null,
  telefon text not null,
  eposta text,
  tip public.ilan_tipi not null,
  mahalle_id int references public.mahalleler(id),
  emlak_turu text,
  mesaj text,
  dil text not null default 'tr',
  kvkk_onay boolean not null check (kvkk_onay),
  iys_onay boolean not null default false,
  durum text not null default 'yeni' check (durum in ('yeni', 'arandi', 'ilgileniyor', 'sozlesme', 'yayinda', 'reddetti')),
  notlar text,
  created_at timestamptz not null default now()
);
alter table public.basvurular enable row level security;
create policy "herkes basvurur" on public.basvurular for insert to anon, authenticated with check (true);
create policy "ekip okur ve yonetir" on public.basvurular for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------- Alıcı / kiracı talepleri ----------
create table public.talepler (
  id uuid primary key default gen_random_uuid(),
  ilan_id uuid references public.ilanlar(id) on delete set null,
  ad_soyad text not null,
  telefon text,
  eposta text,
  mesaj text,
  giris_tarihi date,
  cikis_tarihi date,
  kisi_sayisi smallint,
  dil text not null default 'tr',
  kvkk_onay boolean not null check (kvkk_onay),
  durum text not null default 'yeni' check (durum in ('yeni', 'donuldu', 'gosterim', 'teklif', 'kapandi')),
  created_at timestamptz not null default now(),
  check (telefon is not null or eposta is not null)
);
alter table public.talepler enable row level security;
create policy "herkes talep birakir" on public.talepler for insert to anon, authenticated with check (true);
create policy "ekip okur ve yonetir" on public.talepler for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------- Sesli arama kayıtları (ürün iyileştirme; kişisel veri yok) ----------
create table public.sesli_arama_kayitlari (
  id bigserial primary key,
  metin text not null,
  filtreler jsonb not null,
  dil text,
  sonuc_sayisi integer,
  created_at timestamptz not null default now()
);
alter table public.sesli_arama_kayitlari enable row level security;
create policy "ekip okur" on public.sesli_arama_kayitlari for select to authenticated using (public.is_staff());

-- ---------- Storage ----------
insert into storage.buckets (id, name, public) values ('ilan-fotolari', 'ilan-fotolari', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('gorsel-3d', 'gorsel-3d', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('sozlesmeler', 'sozlesmeler', false)
  on conflict (id) do nothing;

create policy "ekip foto yukler" on storage.objects for all to authenticated
  using (bucket_id in ('ilan-fotolari', 'gorsel-3d', 'sozlesmeler') and public.is_staff())
  with check (bucket_id in ('ilan-fotolari', 'gorsel-3d', 'sozlesmeler') and public.is_staff());

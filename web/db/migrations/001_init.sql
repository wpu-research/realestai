-- RealEstAi — Railway Postgres şeması
-- Kural: sitede yalnızca sahibinin yetki verdiği ilanlar görünür. Yayın şartları CHECK ile
-- veritabanında zorlanır; arayüz bunları atlayamaz. Erişim kontrolü uygulamada (admin/ekip).

create extension if not exists pgcrypto;

create type ilan_tipi as enum ('satilik', 'kiralik', 'sezonluk', 'gunluk');
create type ilan_durum as enum ('taslak', 'yayinda', 'kaldirildi');
create type kullanici_rol as enum ('admin', 'ekip');
create type aday_durum as enum
  ('yeni', 'aranacak', 'ulasilamadi', 'geri_aranacak', 'ilgileniyor', 'onaylandi', 'reddetti', 'emlakci_cikti');

-- ---------- Ekip kullanıcıları ----------
create table kullanicilar (
  id uuid primary key default gen_random_uuid(),
  eposta text not null unique,
  ad text not null,
  sifre_hash text not null,                      -- scrypt: tuz$özet
  rol kullanici_rol not null default 'ekip',
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

create table oturumlar (
  id text primary key,                           -- rastgele 32 bayt, hex
  kullanici_id uuid not null references kullanicilar(id) on delete cascade,
  bitis timestamptz not null,
  created_at timestamptz not null default now()
);
create index oturumlar_bitis_ix on oturumlar (bitis);

-- ---------- Mahalleler ----------
create table mahalleler (
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

-- ---------- İlanlar ----------
create table ilanlar (
  id uuid primary key default gen_random_uuid(),
  ilan_no serial unique,
  tip ilan_tipi not null,
  emlak_turu text not null check (emlak_turu in ('daire', 'villa', 'mustakil', 'rezidans', 'arsa', 'diger')),
  durum ilan_durum not null default 'taslak',
  demo boolean not null default false,

  baslik text not null,
  aciklama text not null default '',
  ceviriler jsonb not null default '{}'::jsonb,   -- {"en": {"baslik","aciklama"}, "ru": …, "de": …}

  mahalle_id int references mahalleler(id),
  lat double precision,
  lng double precision,

  net_m2 numeric(8,1),
  brut_m2 numeric(8,1),
  oda text,
  banyo smallint,
  yatak_kapasitesi smallint,
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

  komisyon_orani numeric(4,3),
  bolge_medyani numeric(14,2),
  iskonto numeric(5,3),
  kirmizi_bayraklar text[] not null default '{}',
  bayraklar_incelendi boolean not null default false,
  zeka_guncellendi_at timestamptz,

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
  constraint yayin_icin_bayrak_incelemesi check (
    durum <> 'yayinda' or cardinality(kirmizi_bayraklar) = 0 or bayraklar_incelendi
  ),
  constraint gunluk_kapasite check (tip not in ('gunluk', 'sezonluk') or yatak_kapasitesi is not null),
  constraint konut_m2 check (tip = 'gunluk' or net_m2 is not null)
);
create index ilanlar_arama_ix on ilanlar (durum, tip, mahalle_id);

create or replace function ilan_guncellendi()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.durum = 'yayinda' and (tg_op = 'INSERT' or old.durum is distinct from 'yayinda') then
    new.yayinlandi_at := now();
  end if;
  return new;
end $$;
create trigger ilanlar_guncellendi before insert or update on ilanlar
  for each row execute function ilan_guncellendi();

-- ---------- Fotoğraflar ----------
create table ilan_fotolari (
  id uuid primary key default gen_random_uuid(),
  ilan_id uuid not null references ilanlar(id) on delete cascade,
  url text not null,
  sira smallint not null default 0,
  oda_etiketi text,
  etiket_kaynagi text check (etiket_kaynagi in ('yz', 'elle')),
  etiket_aciklama text
);
create index ilan_fotolari_ilan_ix on ilan_fotolari (ilan_id, sira);

-- ---------- Temsili 3D ----------
create table gorsel_3d (
  id uuid primary key default gen_random_uuid(),
  ilan_id uuid not null references ilanlar(id) on delete cascade,
  oda text not null,
  yontem text not null check (yontem in ('coklu_goruntu', 'tek_goruntu_derinlik', 'uretken_dunya', 'kat_plani')),
  dosya_url text not null,
  onaylandi boolean not null default false,
  temsili boolean not null default true check (temsili),
  created_at timestamptz not null default now()
);

-- ---------- Adaylar (radarın bulduğu ilanlar; yalnız ekip) ----------
-- KVKK: telefon yalnız arama için tutulur; ilana dönüşmeyen adayın kişisel verisi 90 gün sonra
-- silinir (adaylari_temizle). İlk aramada aydınlatma yapılır (arama_gecmisi.aydinlatma_yapildi).
create table adaylar (
  id uuid primary key default gen_random_uuid(),
  kaynak text not null,
  kaynak_url text,
  kaynak_ilan_no text,
  tip ilan_tipi not null,
  emlak_turu text,
  baslik text not null,
  mahalle_id int references mahalleler(id),
  net_m2 numeric(8,1),
  oda text,
  yatak_kapasitesi smallint,
  fiyat numeric(14,2),
  para_birimi char(3) not null default 'TRY',
  fiyat_birimi text,
  bolge_medyani numeric(14,2),
  iskonto numeric(5,3),
  sahip_olasiligi numeric(4,3),
  oncelik numeric(6,3),
  yayinda_gun integer,
  fiyat_dustu boolean not null default false,
  kirmizi_bayraklar text[] not null default '{}',
  sahip_adi text,
  telefon text,
  durum aday_durum not null default 'yeni',
  atanan uuid references kullanicilar(id),
  geri_arama_at timestamptz,
  notlar text,
  ilan_id uuid references ilanlar(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kaynak, kaynak_ilan_no)
);
create index adaylar_kuyruk_ix on adaylar (durum, oncelik desc nulls last);

create table arama_gecmisi (
  id bigserial primary key,
  aday_id uuid not null references adaylar(id) on delete cascade,
  arayan uuid references kullanicilar(id),
  sonuc aday_durum not null,
  aydinlatma_yapildi boolean not null default false,
  not_metni text,
  created_at timestamptz not null default now(),
  constraint onay_icin_aydinlatma check (sonuc <> 'onaylandi' or aydinlatma_yapildi)
);

create or replace function arama_sonucu_isle()
returns trigger language plpgsql as $$
begin
  update adaylar set durum = new.sonuc, updated_at = now() where id = new.aday_id;
  return new;
end $$;
create trigger arama_gecmisi_eklendi after insert on arama_gecmisi
  for each row execute function arama_sonucu_isle();

create or replace function adayi_ilana_cevir(_aday_id uuid)
returns uuid language plpgsql as $$
declare
  a adaylar;
  yeni_id uuid;
begin
  select * into a from adaylar where id = _aday_id for update;
  if a.id is null then
    raise exception 'aday bulunamadi';
  end if;
  if a.durum <> 'onaylandi' then
    raise exception 'aday onaylanmamis (durum: %)', a.durum;
  end if;
  if a.ilan_id is not null then
    return a.ilan_id;
  end if;

  insert into ilanlar (tip, emlak_turu, durum, baslik, mahalle_id, net_m2, oda,
                       yatak_kapasitesi, fiyat, para_birimi, fiyat_birimi,
                       bolge_medyani, iskonto, kirmizi_bayraklar)
  values (a.tip, coalesce(a.emlak_turu, 'daire'), 'taslak', a.baslik, a.mahalle_id,
          case when a.tip = 'gunluk' then a.net_m2 else coalesce(a.net_m2, 1) end,
          a.oda,
          case when a.tip in ('gunluk', 'sezonluk') then coalesce(a.yatak_kapasitesi, 2) else a.yatak_kapasitesi end,
          coalesce(a.fiyat, 1), a.para_birimi,
          coalesce(a.fiyat_birimi, case a.tip when 'satilik' then 'toplam'
                                              when 'gunluk' then 'gecelik'
                                              when 'sezonluk' then 'sezon'
                                              else 'aylik' end),
          a.bolge_medyani, a.iskonto, a.kirmizi_bayraklar)
  returning id into yeni_id;

  update adaylar set ilan_id = yeni_id, updated_at = now() where id = _aday_id;
  return yeni_id;
end $$;

create or replace function adaylari_temizle()
returns integer language sql as $$
  with silinen as (
    update adaylar
       set telefon = null, sahip_adi = null, notlar = null
     where ilan_id is null
       and updated_at < now() - interval '90 days'
       and (telefon is not null or sahip_adi is not null or notlar is not null)
    returning 1
  )
  select count(*)::int from silinen
$$;

-- ---------- Ev sahibi başvuruları ----------
create table basvurular (
  id uuid primary key default gen_random_uuid(),
  ad_soyad text not null,
  telefon text not null,
  eposta text,
  tip ilan_tipi not null,
  mahalle_id int references mahalleler(id),
  emlak_turu text,
  mesaj text,
  dil text not null default 'tr',
  kvkk_onay boolean not null check (kvkk_onay),
  iys_onay boolean not null default false,
  durum text not null default 'yeni' check (durum in ('yeni', 'arandi', 'ilgileniyor', 'sozlesme', 'yayinda', 'reddetti')),
  notlar text,
  created_at timestamptz not null default now()
);

-- ---------- Alıcı / kiracı talepleri ----------
create table talepler (
  id uuid primary key default gen_random_uuid(),
  ilan_id uuid references ilanlar(id) on delete set null,
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

-- ---------- Ölçüm (kişisel veri yok) ----------
create table sesli_arama_kayitlari (
  id bigserial primary key,
  metin text not null,
  filtreler jsonb not null,
  dil text,
  created_at timestamptz not null default now()
);

create table asistan_oturumlari (
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

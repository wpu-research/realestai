-- 007: Radar tarayıcı eklentisi — ekip üyesi başına anahtar. Anahtarın kendisi saklanmaz, yalnız SHA-256 özeti.
create table if not exists eklenti_anahtarlari (
  id uuid primary key default gen_random_uuid(),
  kullanici_id uuid not null references kullanicilar(id) on delete cascade,
  ad text not null,                       -- "Didem dizüstü" gibi
  ozet text not null unique,
  son_kullanim timestamptz,
  iptal_at timestamptz,
  created_at timestamptz not null default now()
);

alter table adaylar add column if not exists ekleyen uuid references kullanicilar(id);

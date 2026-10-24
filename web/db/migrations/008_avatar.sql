-- 008: Didem avatarı — ayarlar (rıza durumu, mod, bütçe) ve günlük ses kullanımı.
create table if not exists ayarlar (
  anahtar text primary key,
  deger jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists ses_kullanim (
  gun date primary key,
  karakter integer not null default 0,     -- sağlayıcıya gönderilen (önbellekte olmayan) karakter
  istek integer not null default 0,
  onbellek integer not null default 0
);

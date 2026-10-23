-- RealEstAi — Postgres 16 + PostGIS
-- Katmanlar: radar (gozlem) → kanonik ilan → iletisim (aday) → sahip + sozlesme → yayin

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE ilan_tipi AS ENUM ('satilik', 'kiralik', 'sezonluk', 'gunluk');
CREATE TYPE emlak_turu AS ENUM ('daire', 'villa', 'mustakil', 'rezidans', 'arsa', 'tarla', 'diger');
CREATE TYPE tapu_turu AS ENUM ('kat_mulkiyeti', 'kat_irtifaki', 'hisseli', 'mustakil_tapu', 'bilinmiyor');
CREATE TYPE aday_durum AS ENUM ('yeni', 'temas_edildi', 'yanit_verdi', 'ilgileniyor',
                                'sozlesme', 'yayinda', 'reddetti', 'kapandi');

CREATE TABLE mahalle (
    id              serial PRIMARY KEY,
    ilce            text NOT NULL,
    ad              text NOT NULL,
    bolge           text,
    kiyi            boolean NOT NULL DEFAULT false,
    segment         text,
    sinir           geography(MultiPolygon, 4326),
    UNIQUE (ilce, ad)
);

CREATE TABLE kaynak (
    id              serial PRIMARY KEY,
    ad              text NOT NULL UNIQUE,      -- sahibinden, hepsiemlak, emlakjet, fb_grup, tabela, form
    otomatik_izinli boolean NOT NULL DEFAULT false  -- kullanim kosullari otomatik toplamaya izin veriyor mu
);

-- Kanonik ilan: ayni mulkun farkli kaynaklardaki gozlemleri tek kayitta birlesir.
CREATE TABLE ilan (
    id              bigserial PRIMARY KEY,
    tip             ilan_tipi NOT NULL,
    emlak_turu      emlak_turu NOT NULL,
    mahalle_id      int REFERENCES mahalle(id),
    konum           geography(Point, 4326),
    brut_m2         numeric(8,1),
    net_m2          numeric(8,1),
    oda             text,                      -- '2+1'
    yatak_kapasitesi smallint,                 -- sezonluk / gunluk icin kisi
    kat             smallint,
    bina_yasi       smallint,
    site_ici        boolean,
    havuz           text CHECK (havuz IN ('ozel', 'ortak', 'yok')),
    deniz_manzarasi boolean,
    denize_mesafe_m integer,
    tapu            tapu_turu NOT NULL DEFAULT 'bilinmiyor',
    imar_notu       text,
    kirmizi_bayraklar text[] NOT NULL DEFAULT '{}',  -- hisseli, imarsiz, kooperatif, kiyi_kenar...
    ilk_goruldu     timestamptz NOT NULL DEFAULT now(),
    son_goruldu     timestamptz NOT NULL DEFAULT now(),
    aktif           boolean NOT NULL DEFAULT true
);
CREATE INDEX ilan_konum_gix ON ilan USING gist (konum);
CREATE INDEX ilan_grup_ix ON ilan (tip, mahalle_id, emlak_turu) WHERE aktif;

-- Radar gozlemi: bir kaynaktaki bir ilanin bir anlik goruntusu.
-- Telefon SAKLANMAZ; emlakci tespiti icin yalniz tuzlu hash.
CREATE TABLE gozlem (
    id              bigserial PRIMARY KEY,
    ilan_id         bigint NOT NULL REFERENCES ilan(id) ON DELETE CASCADE,
    kaynak_id       int NOT NULL REFERENCES kaynak(id),
    kaynak_ilan_no  text NOT NULL,
    url             text,
    ilan_veren      text CHECK (ilan_veren IN ('sahibinden', 'emlakci', 'insaat_firmasi', 'bilinmiyor')),
    eids_dogrulanmis boolean,
    telefon_hash    bytea,
    foto_phash      bigint[] NOT NULL DEFAULT '{}',
    baslik          text,
    aciklama        text,                       -- 90 gun sonra NULL'lanir (anonimlestirme)
    fiyat           numeric(14,2) NOT NULL,
    para_birimi     char(3) NOT NULL DEFAULT 'TRY',
    fiyat_birimi    text NOT NULL CHECK (fiyat_birimi IN ('toplam', 'aylik', 'sezon', 'gecelik', 'haftalik')),
    sezon_baslangic date,                       -- sezonluk: kira donemi
    sezon_bitis     date,
    gozlem_zamani   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (kaynak_id, kaynak_ilan_no, gozlem_zamani)
);
CREATE INDEX gozlem_ilan_ix ON gozlem (ilan_id, gozlem_zamani DESC);
CREATE INDEX gozlem_telefon_ix ON gozlem (telefon_hash) WHERE telefon_hash IS NOT NULL;

-- Skor: fiyat.py ciktisi. Model versiyonu ile saklanir ki kalibrasyon izlenebilsin.
CREATE TABLE skor (
    ilan_id         bigint NOT NULL REFERENCES ilan(id) ON DELETE CASCADE,
    hesaplandi      timestamptz NOT NULL DEFAULT now(),
    model           text NOT NULL,
    sahip_olasiligi numeric(4,3),               -- 0..1, sahip_tespiti.py
    birim_fiyat     numeric(14,2),              -- TL/m2, TL/m2/ay, TL/kisi/gece
    grup_medyani    numeric(14,2),
    iskonto         numeric(5,3),               -- 0.20 = medyanin %20 altinda
    robust_z        numeric(6,2),
    grup_buyuklugu  integer,
    PRIMARY KEY (ilan_id, hesaplandi)
);

-- Aday: temas edilecek / edilen ilan. Iletisim bilgisi burada YOK.
CREATE TABLE aday (
    id              bigserial PRIMARY KEY,
    ilan_id         bigint NOT NULL REFERENCES ilan(id),
    durum           aday_durum NOT NULL DEFAULT 'yeni',
    sorumlu         text,
    temas_kanali    text,                       -- kaynak_mesaj, telefon, yuz_yuze
    notlar          text,
    guncellendi     timestamptz NOT NULL DEFAULT now()
);

-- Sahip: yalnizca yanit verip riza veren kisi icin olusturulur.
CREATE TABLE sahip (
    id              bigserial PRIMARY KEY,
    ad_soyad        text NOT NULL,
    telefon         text,
    eposta          text,
    tercih_dil      text NOT NULL DEFAULT 'tr',
    kvkk_riza_zamani timestamptz NOT NULL,
    kvkk_metin_versiyon text NOT NULL,
    iys_onay        boolean NOT NULL DEFAULT false
);

CREATE TABLE yetki_sozlesmesi (
    id              bigserial PRIMARY KEY,
    ilan_id         bigint NOT NULL REFERENCES ilan(id),
    sahip_id        bigint NOT NULL REFERENCES sahip(id),
    imza_zamani     timestamptz NOT NULL,
    baslangic       date NOT NULL,
    bitis           date NOT NULL CHECK (bitis > baslangic),
    komisyon_orani  numeric(4,3),
    belge_url       text NOT NULL
);

-- Yayin: sitede gorunen ilan. Sozlesme + rıza olmadan satir girilemez.
CREATE TABLE yayin (
    id              bigserial PRIMARY KEY,
    ilan_id         bigint NOT NULL UNIQUE REFERENCES ilan(id),
    sozlesme_id     bigint NOT NULL REFERENCES yetki_sozlesmesi(id),
    tip             ilan_tipi NOT NULL,
    eids_dogrulama_no text,
    turizm_izin_no  text,                       -- 7464 s. Kanun izin belgesi
    kira_suresi_gun integer,                    -- sezonluk icin
    fiyat           numeric(14,2) NOT NULL,
    para_birimi     char(3) NOT NULL DEFAULT 'TRY',
    diller          text[] NOT NULL DEFAULT '{tr}',
    yayinlandi      timestamptz NOT NULL DEFAULT now(),
    kaldirildi      timestamptz,
    -- Satilik/kiralik: EIDS dogrulamasi sart.
    CONSTRAINT eids_sart CHECK (tip NOT IN ('satilik', 'kiralik') OR eids_dogrulama_no IS NOT NULL),
    -- Gunluk: izin belgesi her zaman; sezonluk: 100 gunu asmiyorsa (ya da sure bilinmiyorsa).
    -- COALESCE: CHECK, NULL sonucu gecerli sayar — sure bilinmiyorsa izin istensin.
    CONSTRAINT turizm_izin_sart CHECK (
        tip = 'gunluk' AND turizm_izin_no IS NOT NULL
        OR tip = 'sezonluk' AND (turizm_izin_no IS NOT NULL OR COALESCE(kira_suresi_gun, 0) > 100)
        OR tip IN ('satilik', 'kiralik')
    )
);

-- Ilan fotograflarindan uretilen temsili 3D gorsel (docs/gorsel-3d.md).
CREATE TABLE gorsel_3d (
    id              bigserial PRIMARY KEY,
    ilan_id         bigint NOT NULL REFERENCES ilan(id) ON DELETE CASCADE,
    oda             text NOT NULL,              -- salon, mutfak, yatak_odasi, banyo, dis_cephe, havuz...
    yontem          text NOT NULL CHECK (yontem IN ('coklu_goruntu', 'tek_goruntu_derinlik',
                                                    'uretken_dunya', 'kat_plani')),
    kaynak_foto     text[] NOT NULL,            -- kullanilan fotograf URL/anahtarlari
    model_versiyon  text NOT NULL,
    dosya_url       text,                       -- .splat / .spz / .glb
    kalite_skoru    numeric(4,3),
    onaylandi       boolean NOT NULL DEFAULT false,
    temsili         boolean NOT NULL DEFAULT true CHECK (temsili),  -- her zaman temsili; uyari kapatilamaz
    uyari_versiyon  text NOT NULL,
    uretildi        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gorsel_3d_ilan_ix ON gorsel_3d (ilan_id) WHERE onaylandi;

-- Huni gorunumu
CREATE VIEW huni AS
SELECT i.tip, m.ad AS mahalle, a.durum, count(*) AS adet
FROM aday a
JOIN ilan i ON i.id = a.ilan_id
LEFT JOIN mahalle m ON m.id = i.mahalle_id
GROUP BY 1, 2, 3;

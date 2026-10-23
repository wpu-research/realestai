-- Mahalleler + DEMO ilanlar. Demo ilanlar uydurmadır, sitede "DEMO" rozetiyle görünür ve
-- canlıya çıkmadan önce silinir:  delete from ilanlar where demo;
-- Koordinatlar mahalle merkezine yaklaşıktır (harita için), ölçüm değildir.

insert into mahalleler (ilce, ad, slug, bolge, kiyi, segment, lat, lng) values
  ('Bodrum', 'Bitez',       'bitez',       'guney',     true,  'orta-ust', 37.033, 27.387),
  ('Bodrum', 'Turgutreis',  'turgutreis',  'bati',      true,  'orta',     37.006, 27.262),
  ('Bodrum', 'Konacık',     'konacik',     'merkez',    false, 'orta',     37.047, 27.403),
  ('Bodrum', 'Gümüşlük',    'gumusluk',    'bati',      true,  'ust',      37.056, 27.232),
  ('Bodrum', 'Yalıkavak',   'yalikavak',   'kuzeybati', true,  'luks',     37.104, 27.292),
  ('Bodrum', 'Gündoğan',    'gundogan',    'kuzey',     true,  'ust',      37.127, 27.340),
  ('Bodrum', 'Göltürkbükü', 'golturkbuku', 'kuzey',     true,  'luks',     37.130, 27.373),
  ('Bodrum', 'Torba',       'torba',       'kuzeydogu', true,  'ust',      37.083, 27.455),
  ('Bodrum', 'Ortakent',    'ortakent',    'guney',     true,  'orta',     37.025, 27.355),
  ('Bodrum', 'Gümbet',      'gumbet',      'guney',     true,  'orta',     37.030, 27.410),
  ('Bodrum', 'Akyarlar',    'akyarlar',    'guneybati', true,  'orta',     36.968, 27.293),
  ('Bodrum', 'Merkez',      'merkez',      'merkez',    true,  'orta-ust', 37.035, 27.430),
  ('Milas',  'Ören',        'oren',        'milas-kiyi',true,  'orta-alt', 37.030, 27.970),
  ('Milas',  'Güllük',      'gulluk',      'milas-kiyi',true,  'orta-alt', 37.240, 27.605),
  ('Didim',  'Altınkum',    'altinkum',    'didim',     true,  'orta-alt', 37.350, 27.265);

-- Demo ilanlar (yayın şartları için yer tutucu belge değerleri)
insert into ilanlar
  (tip, emlak_turu, durum, demo, baslik, aciklama, mahalle_id, net_m2, brut_m2, oda, banyo,
   yatak_kapasitesi, site_ici, havuz, deniz_manzarasi, denize_mesafe_m, esyali, bina_yasi,
   fiyat, para_birimi, fiyat_birimi, sezon_fiyatlari, kira_suresi_gun, min_gece,
   komisyon_orani, bolge_medyani, iskonto,
   yetki_sozlesmesi_url, kvkk_riza_at, eids_no, turizm_izin_no)
values
  ('satilik', 'daire', 'yayinda', true, 'Bitez''de site içinde havuzlu 2+1',
   'Denize 600 m, ortak havuzlu sitede bahçe katı. Sahibinden, doğrulanmış ilan.',
   (select id from mahalleler where slug = 'bitez'), 85, 100, '2+1', 1,
   null, true, 'ortak', false, 600, false, 8,
   9200000, 'TRY', 'toplam', null, null, null,
   0.020, 128000, 0.155, 'demo://sozlesme', now(), 'DEMO-EIDS-1', null),

  ('satilik', 'villa', 'yayinda', true, 'Gümüşlük''te deniz manzaralı müstakil villa',
   'Özel havuz, 450 m² bahçe, gün batımı manzarası.',
   (select id from mahalleler where slug = 'gumusluk'), 210, 240, '4+1', 3,
   null, false, 'ozel', true, 900, true, 12,
   38500000, 'TRY', 'toplam', null, null, null,
   0.020, 215000, 0.148, 'demo://sozlesme', now(), 'DEMO-EIDS-2', null),

  ('satilik', 'daire', 'yayinda', true, 'Turgutreis merkezde denize yürüme mesafesinde 1+1',
   'Marinaya 10 dakika, eşyalı teslim.',
   (select id from mahalleler where slug = 'turgutreis'), 55, 65, '1+1', 1,
   null, true, 'ortak', false, 350, true, 5,
   5400000, 'TRY', 'toplam', null, null, null,
   0.020, 108000, 0.091, 'demo://sozlesme', now(), 'DEMO-EIDS-3', null),

  ('kiralik', 'daire', 'yayinda', true, 'Konacık''ta yıllık kiralık 3+1',
   'Okullara ve hastaneye yakın, doğalgazlı, eşyasız.',
   (select id from mahalleler where slug = 'konacik'), 120, 135, '3+1', 2,
   null, true, 'ortak', false, null, false, 6,
   45000, 'TRY', 'aylik', null, null, null,
   null, 420, 0.107, 'demo://sozlesme', now(), 'DEMO-EIDS-4', null),

  ('kiralik', 'mustakil', 'yayinda', true, 'Ortakent''te bahçeli yıllık kiralık müstakil',
   'Evcil hayvan kabul, 300 m² bahçe.',
   (select id from mahalleler where slug = 'ortakent'), 140, 160, '3+1', 2,
   null, false, 'yok', false, 1200, true, 15,
   60000, 'TRY', 'aylik', null, null, null,
   null, 470, 0.088, 'demo://sozlesme', now(), 'DEMO-EIDS-5', null),

  ('sezonluk', 'villa', 'yayinda', true, 'Yalıkavak''ta Mayıs–Ekim sezonluk villa',
   'Özel havuzlu, 8 kişilik, marinaya 2 km.',
   (select id from mahalleler where slug = 'yalikavak'), 180, 200, '4+1', 3,
   8, false, 'ozel', true, 700, true, 4,
   65000, 'EUR', 'sezon', null, 184, null,
   null, null, null, 'demo://sozlesme', now(), null, 'DEMO-TURIZM-1'),

  ('sezonluk', 'daire', 'yayinda', true, 'Bitez''de Haziran–Eylül sezonluk 2+1',
   'Plaja 300 m, site içi ortak havuz.',
   (select id from mahalleler where slug = 'bitez'), 80, 95, '2+1', 1,
   4, true, 'ortak', true, 300, true, 7,
   480000, 'TRY', 'sezon', null, 122, null,
   null, null, null, 'demo://sozlesme', now(), null, null),

  ('gunluk', 'villa', 'yayinda', true, 'Göltürkbükü''nde günlük kiralık havuzlu villa',
   '10 kişilik, iskeleye yürüme mesafesi. Minimum 5 gece.',
   (select id from mahalleler where slug = 'golturkbuku'), 260, 300, '5+1', 4,
   10, false, 'ozel', true, 250, true, 3,
   42000, 'TRY', 'gecelik', '{"yuksek": 42000, "omuz": 26000, "dusuk": 14000}', null, 5,
   null, null, null, 'demo://sozlesme', now(), null, 'DEMO-TURIZM-2'),

  ('gunluk', 'daire', 'yayinda', true, 'Gümbet''te plaja 100 m günlük kiralık 1+1',
   '4 kişilik, klimalı, balkonlu.',
   (select id from mahalleler where slug = 'gumbet'), 50, 60, '1+1', 1,
   4, true, 'ortak', false, 100, true, 9,
   4500, 'TRY', 'gecelik', '{"yuksek": 4500, "omuz": 3000, "dusuk": 1600}', null, 2,
   null, null, null, 'demo://sozlesme', now(), null, 'DEMO-TURIZM-3'),

  ('gunluk', 'mustakil', 'yayinda', true, 'Akyarlar''da 6 kişilik bahçeli tatil evi',
   'Sakin koy, denize 400 m, mangal alanı.',
   (select id from mahalleler where slug = 'akyarlar'), 110, 125, '3+1', 2,
   6, false, 'yok', true, 400, true, 10,
   7800, 'TRY', 'gecelik', '{"yuksek": 7800, "omuz": 5200, "dusuk": 2800}', null, 3,
   null, null, null, 'demo://sozlesme', now(), null, 'DEMO-TURIZM-4');

-- 005: DEMO ilanların EN/RU/DE çevirileri (gerçek ilanlarda "Yapay zekâ ile doldur" üretir).
create temporary table _ceviri (baslik text, c jsonb) on commit drop;
insert into _ceviri values
('Bitez''de site içinde havuzlu 2+1', '{
  "en": {"baslik": "2-bedroom flat with pool in a complex in Bitez", "aciklama": "600 m to the sea, garden-floor flat in a complex with a shared pool. From the owner, verified listing."},
  "ru": {"baslik": "Квартира 2+1 с бассейном в комплексе, Битез", "aciklama": "600 м до моря, квартира на садовом этаже в комплексе с общим бассейном. От владельца, проверенное объявление."},
  "de": {"baslik": "3-Zimmer-Wohnung mit Pool in einer Anlage in Bitez", "aciklama": "600 m zum Meer, Gartengeschoss in einer Anlage mit Gemeinschaftspool. Vom Eigentümer, geprüftes Angebot."}}'),
('Gümüşlük''te deniz manzaralı müstakil villa', '{
  "en": {"baslik": "Detached sea-view villa in Gümüşlük", "aciklama": "Private pool, 450 m² garden, sunset views."},
  "ru": {"baslik": "Отдельная вилла с видом на море в Гюмюшлюке", "aciklama": "Собственный бассейн, сад 450 м², вид на закат."},
  "de": {"baslik": "Freistehende Villa mit Meerblick in Gümüşlük", "aciklama": "Privater Pool, 450 m² Garten, Sonnenuntergangsblick."}}'),
('Turgutreis merkezde denize yürüme mesafesinde 1+1', '{
  "en": {"baslik": "1-bedroom flat in central Turgutreis, walking distance to the sea", "aciklama": "10 minutes to the marina, sold furnished."},
  "ru": {"baslik": "Квартира 1+1 в центре Тургутрейса, в шаге от моря", "aciklama": "10 минут до марины, продаётся с мебелью."},
  "de": {"baslik": "2-Zimmer-Wohnung im Zentrum von Turgutreis, fußläufig zum Meer", "aciklama": "10 Minuten zur Marina, möbliert."}}'),
('Konacık''ta yıllık kiralık 3+1', '{
  "en": {"baslik": "3-bedroom flat for long-term rent in Konacık", "aciklama": "Close to schools and the hospital, gas heating, unfurnished."},
  "ru": {"baslik": "Квартира 3+1 в долгосрочную аренду, Коначик", "aciklama": "Рядом школы и больница, газовое отопление, без мебели."},
  "de": {"baslik": "4-Zimmer-Wohnung zur Langzeitmiete in Konacık", "aciklama": "Nahe Schulen und Krankenhaus, Gasheizung, unmöbliert."}}'),
('Ortakent''te bahçeli yıllık kiralık müstakil', '{
  "en": {"baslik": "Detached house with garden for long-term rent in Ortakent", "aciklama": "Pets welcome, 300 m² garden."},
  "ru": {"baslik": "Отдельный дом с садом в долгосрочную аренду, Ортакент", "aciklama": "Можно с животными, сад 300 м²."},
  "de": {"baslik": "Einfamilienhaus mit Garten zur Langzeitmiete in Ortakent", "aciklama": "Haustiere willkommen, 300 m² Garten."}}'),
('Yalıkavak''ta Mayıs–Ekim sezonluk villa', '{
  "en": {"baslik": "Seasonal villa in Yalıkavak, May–October", "aciklama": "Private pool, sleeps 8, 2 km to the marina."},
  "ru": {"baslik": "Вилла в Ялыкаваке на сезон, май–октябрь", "aciklama": "Собственный бассейн, на 8 человек, 2 км до марины."},
  "de": {"baslik": "Saisonvilla in Yalıkavak, Mai–Oktober", "aciklama": "Privater Pool, für 8 Personen, 2 km zur Marina."}}'),
('Bitez''de Haziran–Eylül sezonluk 2+1', '{
  "en": {"baslik": "Seasonal 2-bedroom flat in Bitez, June–September", "aciklama": "300 m to the beach, shared pool in the complex."},
  "ru": {"baslik": "Квартира 2+1 на сезон в Битезе, июнь–сентябрь", "aciklama": "300 м до пляжа, общий бассейн в комплексе."},
  "de": {"baslik": "Saisonwohnung (3 Zimmer) in Bitez, Juni–September", "aciklama": "300 m zum Strand, Gemeinschaftspool in der Anlage."}}'),
('Göltürkbükü''nde günlük kiralık havuzlu villa', '{
  "en": {"baslik": "Holiday villa with pool in Göltürkbükü", "aciklama": "Sleeps 10, walking distance to the pier. Minimum 5 nights."},
  "ru": {"baslik": "Вилла с бассейном посуточно в Гёльтюркбюкю", "aciklama": "На 10 человек, в шаге от пирса. Минимум 5 ночей."},
  "de": {"baslik": "Ferienvilla mit Pool in Göltürkbükü", "aciklama": "Für 10 Personen, fußläufig zum Steg. Mindestens 5 Nächte."}}'),
('Gümbet''te plaja 100 m günlük kiralık 1+1', '{
  "en": {"baslik": "Holiday 1-bedroom flat 100 m from the beach in Gümbet", "aciklama": "Sleeps 4, air conditioning, balcony."},
  "ru": {"baslik": "Квартира 1+1 посуточно в 100 м от пляжа, Гюмбет", "aciklama": "На 4 человек, кондиционер, балкон."},
  "de": {"baslik": "Ferienwohnung (2 Zimmer) 100 m vom Strand in Gümbet", "aciklama": "Für 4 Personen, Klimaanlage, Balkon."}}'),
('Akyarlar''da 6 kişilik bahçeli tatil evi', '{
  "en": {"baslik": "Holiday home with garden for 6 in Akyarlar", "aciklama": "Quiet cove, 400 m to the sea, barbecue area."},
  "ru": {"baslik": "Дом для отдыха с садом на 6 человек, Акъярлар", "aciklama": "Тихая бухта, 400 м до моря, зона барбекю."},
  "de": {"baslik": "Ferienhaus mit Garten für 6 Personen in Akyarlar", "aciklama": "Ruhige Bucht, 400 m zum Meer, Grillplatz."}}');

update ilanlar i set ceviriler = i.ceviriler || c.c from _ceviri c where i.demo and i.baslik = c.baslik;

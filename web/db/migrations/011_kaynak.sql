-- Reklam testi: talep ve başvurunun hangi kanaldan geldiği (utm_source / yönlendiren site). Kişisel veri değil.
alter table talepler add column if not exists kaynak text, add column if not exists kampanya text;
alter table basvurular add column if not exists kaynak text, add column if not exists kampanya text;

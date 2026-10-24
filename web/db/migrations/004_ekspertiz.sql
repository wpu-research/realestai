-- 004: Ekspertiz (gayrimenkul değerleme) talepleri talepler tablosunda konu = 'ekspertiz'.
alter table talepler drop constraint if exists talepler_konu_check;
alter table talepler add constraint talepler_konu_check
  check (konu in ('ilan', 'emlakci_bul', 'gercek_kisi', 'ekspertiz'));

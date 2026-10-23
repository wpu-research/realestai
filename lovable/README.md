# Lovable paketi

| Dosya | Ne |
|-------|----|
| `PROMPT.md` | Kurulum + Lovable'a sırayla yapıştırılacak 8 prompt (1–5 temel site, 6–8 ek paket) |
| `supabase/migrations/001_init.sql` | Şema, RLS, yayın kuralları, aday akışı, KVKK temizliği |
| `supabase/migrations/002_zeka_asistan.sql` | Foto etiketi / çeviri / kırmızı bayrak alanları, asistan oturumları |
| `supabase/seed.sql` | 15 mahalle + 10 DEMO ilan (dört tipin hepsinden) |
| `supabase/functions/sesli-arama/index.ts` | Tek cümlelik sesli/yazılı aramayı filtreye çevirir (Claude) |
| `supabase/functions/asistan/index.ts` | Didem avatarının beyni: soru soran, filtre dolduran sohbet (Claude) |
| `supabase/functions/ilan-zeka/index.ts` | Foto oda etiketi (NVIDIA görsel model) + EN/RU/DE çeviri ve kırmızı bayrak (Claude) |
| `data/sihirbaz.json` | Arama sihirbazının soru seti (avatar da aynı kriterleri sorar) |

Didem avatarının rıza, kayıt ve sağlayıcı planı: `../docs/avatar-didem.md`.

## Akış

```
Radar / form / elle giriş ─► adaylar (yeni)
        ─► Didem arar ─► arama_gecmisi (sonuç + KVKK aydınlatması)
        ─► onaylandi ─► adayi_ilana_cevir() ─► ilanlar (taslak)
        ─► "Yapay zekâ ile doldur" (foto etiketi, çeviri, kırmızı bayrak)
        ─► sözleşme + rıza + EİDS / turizm izni + foto ─► yayinda ─► sitede görünür

Ziyaretçi ─► sihirbaz (soru soru) ya da Didem avatarı (konuşarak) ─► filtreler ─► /ara
```

## Doğrulama

- Şema (001 + seed + 002, 002 iki kez) PGlite'ta (Postgres 16) Supabase `auth`/`storage` yer
  tutucularıyla çalıştı; yayın kısıtları, aday akışı ve 90 günlük temizlik test edildi.
  RLS gerçek Supabase'de denenmedi.
- Üç Edge Function `deno check` ile tip kontrolünden geçti. **Gerçek API çağrısı yapılmadı**:
  Claude ve NVIDIA cevapları, NVIDIA'nın görsel boyut sınırı ve model adları canlıda denenmeli.
- 2026-10-22 NVIDIA denemesi (serbest lisanslı villa fotoğrafı): `nemotron-3.5-super-vl` doğru
  etiketledi ("dis_cephe", ~24 sn). `llama-3.2-11b-vision` şablonu geri yazdı, `llama-3.2-90b-vision`
  zaman aşımı. NVIDIA metin modelleri çeviride güvenilmez çıktı ("hisseli tapulu" → "with title
  deed"); çeviri bu yüzden Claude'a taşındı.

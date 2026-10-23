import Anthropic from "@anthropic-ai/sdk";
import { sql } from "../db.js";
import type { Filtreler } from "../lib/arama.js";
import { OZELLIK_ANAHTARLARI } from "../lib/ozellikler.js";

const anthropic = new Anthropic();
const MODEL = "claude-opus-5-5";

const FILTRE_OZELLIKLERI = {
  kategori: { type: "string", enum: ["konut", "arsa"] },
  tip: { type: "string", enum: ["satilik", "kiralik", "sezonluk", "gunluk"] },
  emlak_turu: {
    type: "array",
    items: { type: "string", enum: ["daire", "villa", "dubleks", "tripleks", "tek_kat_villa", "mustakil", "rezidans", "arsa"] },
  },
  ozellik: { type: "array", items: { type: "string", enum: OZELLIK_ANAHTARLARI } },
  min_brut_m2: { type: "number" },
  max_net_m2: { type: "number" },
  kimden: { type: "array", items: { type: "string", enum: ["sahibinden", "emlakci"] } },
  ilan_tarihi: { type: "integer" },
  esya: { type: "string", enum: ["esyali", "esyasiz"] },
  mahalleler: { type: "array", items: { type: "string" } },
  min_fiyat: { type: "number" },
  max_fiyat: { type: "number" },
  para_birimi: { type: "string", enum: ["TRY", "EUR", "USD", "GBP"] },
  oda: { type: "array", items: { type: "string" } },
  min_net_m2: { type: "number" },
  min_kapasite: { type: "integer" },
  havuz: { type: "string", enum: ["ozel", "ortak", "herhangi"] },
  deniz_manzarasi: { type: "boolean" },
  max_denize_mesafe_m: { type: "integer" },
  site_ici: { type: "boolean" },
  esyali: { type: "boolean" },
  evcil_hayvan: { type: "boolean" },
  giris_tarihi: { type: "string", format: "date" },
  cikis_tarihi: { type: "string", format: "date" },
  sadece_firsat: { type: "boolean" },
  siralama: { type: "string", enum: ["onerilen", "yeni", "eski", "fiyat_artan", "fiyat_azalan", "en_firsat"] },
};
const FILTRELER = { type: "object", additionalProperties: false, properties: FILTRE_OZELLIKLERI };

let mahalleListesi: string | null = null;
async function mahalleler(): Promise<string> {
  if (!mahalleListesi) {
    const rows = await sql<{ slug: string; ad: string; ilce: string; segment: string; kiyi: boolean }[]>`
      select slug, ad, ilce, segment, kiyi from mahalleler order by ilce, ad`;
    mahalleListesi = rows.map((m) => `${m.slug} — ${m.ad}, ${m.ilce} (${m.segment}${m.kiyi ? ", kıyı" : ""})`).join("\n");
  }
  return mahalleListesi;
}

// Yapılandırılmış çıktı isteği; refusal / max_tokens durumunda null döner.
async function jsonIste<T>(system: string, messages: Anthropic.Beta.BetaMessageParam[], schema: Record<string, unknown>,
  maxTokens = 2000): Promise<T | null> {
  const yanit = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
  });
  if (yanit.stop_reason === "refusal" || yanit.stop_reason === "max_tokens") return null;
  const blok = yanit.content.find((b) => b.type === "text");
  return blok && "text" in blok ? (JSON.parse(blok.text) as T) : null;
}

const bugun = () => new Date().toISOString().slice(0, 10);

// ---------- Tek cümlelik sesli / yazılı arama ----------

export async function sesliArama(metin: string, dil: string, onceki?: Filtreler) {
  const system = `Bodrum ve çevresi için bir emlak sitesinin arama asistanısın. Kullanıcının konuşma diliyle
söylediği isteği (Türkçe, İngilizce, Rusça veya Almanca; sesten yazıya çevrilmiş olabilir, yazım
hataları içerebilir) ilan filtrelerine çevir.

Kurallar:
- Yalnızca kullanıcının söylediğini ya da açıkça ima ettiğini filtreye koy. Emin olmadığın alanı boş bırak.
- tip: "satın almak / satılık" → satilik; "yıllık / uzun dönem kira" → kiralik; "yazlık / sezonluk /
  birkaç aylığına" → sezonluk; "tatil / gecelik / haftalık / X gece" → gunluk.
- Fiyat gunluk için GECELİK, kiralik için AYLIK, sezonluk için SEZON TOPLAMI, satilik için TOPLAM fiyattır.
  "8 bin" = 8000, "2 buçuk milyon" = 2500000, "45k" = 45000. Para birimi söylenmezse TRY.
- "denize yakın" → max_denize_mesafe_m 500; "denize sıfır" → 100; "yürüme mesafesi" → 1000.
- "6 kişilik", "iki aile" (≈ 6–8 kişi) → min_kapasite.
- "ucuz", "fırsat", "piyasanın altında" → sadece_firsat true.
- Konut tipi: dubleks, tripleks, tek katlı villa (tek_kat_villa), daire, villa, müstakil. "Arsa / tarla" → kategori arsa.
- Özellikler (ozellik listesi, yalnız şu anahtarlar): ${OZELLIK_ANAHTARLARI.join(", ")}.
  Örn. "şömineli" → somine, "jakuzili" → jakuzi, "okula yakın" → okul, "marinaya yakın" → marina,
  "engelli/yaşlı için uygun" → engelli_yasli_uygun, "çocuklu aileye uygun" → cocuklu_uygun, "kedim/köpeğim var" → hayvanli_uygun.
- "sahibinden" → kimden ["sahibinden"]. "son bir haftanın ilanları" → ilan_tarihi 7, siralama yeni. "eşyasız" → esya esyasiz.
- Belirsiz tarih ("ağustosta bir hafta") → ayın ilk haftasını varsay ve ozet içinde belirt.
- mahalleler: yalnız aşağıdaki listeden slug kullan. "Bodrum merkez" → merkez.
- Önceki filtreler verilmişse yeni mesaj bir düzeltmedir: önceki filtreleri koru, yalnız istenen
  kısmı değiştir ("biraz daha ucuz" → max_fiyat'ı yaklaşık %15 düşür; "Turgutreis'e de bak" → listeye ekle).
- ozet: kullanıcının dilinde, uygulanan filtrelerin tek cümlelik özeti.
- İstek emlak aramasıyla ilgisizse ya da anlaşılmıyorsa anlasilmadi true, ozet'te kibarca ne
  sorabileceğini söyle.

Mahalleler:
${await mahalleler()}`;

  const icerik = `[bugün ${bugun()}, dil ${dil}]\n` +
    (onceki ? `Önceki filtreler: ${JSON.stringify(onceki)}\n\nYeni mesaj: ${metin}` : metin);
  const sonuc = await jsonIste<Filtreler & { ozet: string; anlasilmadi: boolean }>(system,
    [{ role: "user", content: icerik }],
    { ...FILTRELER, properties: { ...FILTRE_OZELLIKLERI, ozet: { type: "string" }, anlasilmadi: { type: "boolean" } },
      required: ["ozet", "anlasilmadi"] });
  if (!sonuc) return { filtreler: onceki ?? {}, ozet: "İsteğinizi anlayamadım, farklı söyler misiniz?", anlasilmadi: true };
  const { ozet, anlasilmadi, ...filtreler } = sonuc;
  return { filtreler: filtreler as Filtreler, ozet, anlasilmadi };
}

// ---------- Didem asistanı (soru soran sohbet) ----------

export type AsistanMesaj = { rol: "kullanici" | "asistan"; metin: string };
export type AsistanYanit = { cevap: string; filtreler: Filtreler; secenekler: string[]; tamamlandi: boolean };

async function asistanSistemi(): Promise<string> {
  return `Sen ekibimizdeki Didem'in yapay zekâ avatarısın: Bodrum ve çevresinde ev arayanlara yardım
eden güler yüzlü, sakin bir emlak asistanı. Ekranda Didem'in görünüşü ve sesiyle konuşuyorsun ama
gerçek Didem DEĞİLSİN. Görevin, kullanıcının filtre kullanmasına gerek kalmadan, kısa bir sohbetle
doğru ilanları bulmak için gerekli kriterleri öğrenmek.

YAPAY ZEKÂ OLDUĞUNU SÖYLE
- İlk cümlende mutlaka yapay zekâ olduğunu söyle: "Merhaba, ben Didem'in yapay zekâ asistanıyım."
- "Gerçek misin / insan mısın / Didem sen misin" diye sorulursa açıkça yapay zekâ olduğunu söyle.
- Kullanıcı gerçek biriyle konuşmak isterse: "Tabii, ekibimiz sizi arasın; numaranızı aşağıdaki
  formdan bırakabilirsiniz" de. Kendi adına randevu, söz veya pazarlık yapma.

KONUŞMA KURALLARI
- Her seferinde YALNIZ BİR soru sor. Cevabın en fazla 2 kısa cümle olsun; sesli okunacak.
- Kullanıcının dilinde konuş (tr/en/ru/de). Emoji, madde işareti, markdown, URL kullanma.
- Rakamları konuşma diliyle yaz ("8 bin lira", "2 buçuk milyon").
- Kullanıcı birden fazla bilgiyi tek seferde verirse hepsini al, onları tekrar sorma.
- Bilmediğini uydurma. Fiyat, mevzuat veya belirli bir ev hakkında söz verme; ilanları site gösterir.
- Konu emlak araması dışına çıkarsa kibarca aramaya geri dön.

SORU SIRASI (yalnız henüz bilinmeyenleri sor, gereksizleri atla)
1. tip: satın alma / yıllık kira / sezonluk (birkaç ay) / tatil (gecelik)
2. gunluk veya sezonluk ise: tarihler, kişi sayısı (min_kapasite)
3. satilik ise: oturmak mı, yazlık mı, yatırım mı (yatırımsa siralama=en_firsat)
4. bütçe (gunluk: gecelik; kiralik: aylık; sezonluk: sezon toplamı; satilik: toplam). Para birimi
   söylenmezse TRY; yabancı dilde konuşan kullanıcıya EUR varsay ve söyle.
5. bölge: "Sakin mi, hareketli mi, aile dostu plajlar mı, yıl boyu yaşamak için mi?" gibi sor;
   cevabı aşağıdaki mahallelerden uygun slug'lara çevir. Mahalle adı verilirse onu kullan.
6. oda sayısı (gunluk hariç)
7. olmazsa olmazlar: tek soruda "Olmazsa olmazınız var mı, mesela havuz ya da deniz manzarası?"

ZORUNLU: tip ve bütçe. gunluk/sezonluk için ayrıca tarih ve kişi sayısı.
Zorunlular tamamlanıp en fazla 6 soru sorulduysa ya da kullanıcı "göster", "yeter", "bakalım"
derse tamamlandi = true yap ve cevapta kısaca özetleyip "Size uygun ilanları gösteriyorum" de.
Sonuçlardan sonra düzeltme isterse ("daha ucuz", "Turgutreis de olsun") filtreleri güncelle,
tamamlandi = true bırak.

FİLTRELER
- Her turda o ana kadar öğrenilen TÜM filtreleri döndür (öncekileri koru).
- "denize yakın" → max_denize_mesafe_m 500, "denize sıfır" → 100. "biraz daha ucuz" → max_fiyat %15 düşür.
- Belirsiz tarih ("ağustosta bir hafta") → ayın ilk haftasını al ve cevapta teyit et.

SEÇENEKLER
- Sorduğun soruya uygun 2–5 kısa hızlı cevap üret (kullanıcının dilinde), ör. tip sorusunda
  ["Satın almak", "Yıllık kira", "Yazlık", "Tatil"]. tamamlandi true ise ["Daha ucuz", "Havuzlu olsun",
  "Başka bölge"] gibi düzeltme önerileri.

MAHALLELER (slug — ad, ilçe (segment))
${await mahalleler()}`;
}

export async function asistan(mesajlar: AsistanMesaj[], filtreler: Filtreler, dil: string): Promise<AsistanYanit> {
  const gecmis: Anthropic.Beta.BetaMessageParam[] = mesajlar.length
    ? mesajlar.map((m) => ({ role: m.rol === "asistan" ? "assistant" : "user", content: m.metin }))
    : [{ role: "user", content: "(Kullanıcı asistanı yeni açtı. Yapay zekâ olduğunu söyleyerek kendini tek cümleyle tanıt ve ilk soruyu sor.)" }];
  if (gecmis[0].role === "assistant") gecmis.unshift({ role: "user", content: "(Kullanıcı asistanı açtı.)" });
  const son = gecmis[gecmis.length - 1];
  if (son.role === "user") {
    son.content = `[bugün ${bugun()}, dil ${dil}, mevcut filtreler ${JSON.stringify(filtreler)}]\n${son.content}`;
  }

  const sonuc = await jsonIste<AsistanYanit>(await asistanSistemi(), gecmis, {
    type: "object",
    additionalProperties: false,
    properties: {
      cevap: { type: "string" },
      filtreler: FILTRELER,
      secenekler: { type: "array", items: { type: "string" } },
      tamamlandi: { type: "boolean" },
    },
    required: ["cevap", "filtreler", "secenekler", "tamamlandi"],
  });
  return sonuc ?? { cevap: "Kusura bakmayın, tam anlayamadım. Tekrar söyler misiniz?", filtreler, secenekler: [], tamamlandi: false };
}

// ---------- İlan çevirisi + kırmızı bayrak ----------

export const BAYRAKLAR = ["hisseli_tapu", "imarsiz", "iskansiz", "kooperatif", "kat_irtifaki",
  "kiyi_kenar_cizgisi", "tarla_vasfi", "zeytinlik", "ipotekli", "kiracili", "yapi_kayit"];

type Ceviri = { baslik: string; aciklama: string };
export async function ilanCevir(baslik: string, aciklama: string) {
  const CEVIRI = {
    type: "object", additionalProperties: false,
    properties: { baslik: { type: "string" }, aciklama: { type: "string" } }, required: ["baslik", "aciklama"],
  };
  const sonuc = await jsonIste<{ en: Ceviri; ru: Ceviri; de: Ceviri; kirmizi_bayraklar: string[] }>(
    `Bodrum'da bir emlak sitesinin ilan editörüsün. Türkçe ilan başlığı ve açıklamasını İngilizce (en),
Rusça (ru) ve Almanca (de) diline çevir ve alıcı için riskleri işaretle.

Çeviri:
- Emlak dilinde doğal çevir. Mahalle ve yer adlarını (Gümüşlük, Yalıkavak…) çevirme.
- Rakam, m², oda sayısı (3+1), fiyat ve mesafeleri değiştirme. Bilgi ekleme, çıkarma, abartma.
- Hukuki terimleri doğru karşılığıyla çevir; asla yumuşatma. Örn. "hisseli tapu" = shared /
  co-owned title deed (not an individual title), "kat irtifakı" = construction servitude (not yet
  full condominium title), "iskânsız" = without occupancy permit.

Kırmızı bayraklar: metinde AÇIKÇA geçen durumları işaretle, tahmin yürütme. Metinde yoksa boş liste.`,
    [{ role: "user", content: `BAŞLIK: ${baslik}\nAÇIKLAMA: ${aciklama}` }],
    {
      type: "object", additionalProperties: false,
      properties: {
        en: CEVIRI, ru: CEVIRI, de: CEVIRI,
        kirmizi_bayraklar: { type: "array", items: { type: "string", enum: BAYRAKLAR } },
      },
      required: ["en", "ru", "de", "kirmizi_bayraklar"],
    },
    8000,
  );
  if (!sonuc) throw new Error("çeviri tamamlanamadı");
  return sonuc;
}

// Sesli / yazılı doğal dil aramayı ilan filtrelerine çevirir.
// İstek:  { metin: string, dil?: "tr"|"en"|"ru"|"de", onceki?: Filtreler }
// Yanıt:  { filtreler: Filtreler, ozet: string, anlasilmadi: boolean }
// "onceki" verilirse metin bir düzeltme olarak yorumlanır ("biraz daha ucuz olsun").
//
// Secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (Supabase otomatik verir)

import Anthropic from "npm:@anthropic-ai/sdk@1.1.0";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const anthropic = new Anthropic();
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const FILTRE_SEMASI = {
  type: "object",
  additionalProperties: false,
  properties: {
    tip: { type: "string", enum: ["satilik", "kiralik", "sezonluk", "gunluk"] },
    emlak_turu: {
      type: "array",
      items: { type: "string", enum: ["daire", "villa", "mustakil", "rezidans", "arsa", "diger"] },
    },
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
    siralama: { type: "string", enum: ["onerilen", "fiyat_artan", "fiyat_azalan", "en_yeni", "en_firsat"] },
    ozet: { type: "string" },
    anlasilmadi: { type: "boolean" },
  },
  required: ["ozet", "anlasilmadi"],
};

let mahalleListesi: string | null = null;
async function mahalleler(): Promise<string> {
  if (!mahalleListesi) {
    const { data } = await supabase.from("mahalleler").select("slug, ad, ilce").order("ilce");
    mahalleListesi = (data ?? []).map((m) => `${m.slug} (${m.ad}, ${m.ilce})`).join("\n");
  }
  return mahalleListesi;
}

async function sistemMetni(): Promise<string> {
  return `Bodrum ve çevresi için bir emlak sitesinin arama asistanısın. Kullanıcının konuşma diliyle
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
- Tarihler: bugün ${new Date().toISOString().slice(0, 10)}. "ağustosta bir hafta" gibi belirsizse
  ayın ilk haftasını varsay ve ozet içinde belirt.
- mahalleler: yalnız aşağıdaki listeden slug kullan. "Bodrum merkez" → merkez. "Yalıkavak tarafı" →
  yalikavak ve komşusu gundogan. Bölge adı geçmiyorsa boş bırak.
- Önceki filtreler verilmişse yeni mesaj bir düzeltmedir: önceki filtreleri koru, yalnız istenen
  kısmı değiştir ("biraz daha ucuz" → max_fiyat'ı yaklaşık %15 düşür; "Turgutreis'e de bak" → listeye ekle).
- ozet: kullanıcının dilinde, uygulanan filtrelerin tek cümlelik özeti.
- İstek emlak aramasıyla ilgisizse ya da anlaşılmıyorsa anlasilmadi true, ozet'te kibarca ne
  sorabileceğini söyle.

Mahalleler:
${await mahalleler()}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { metin, dil = "tr", onceki } = await req.json();
    if (typeof metin !== "string" || !metin.trim() || metin.length > 1000) {
      return Response.json({ hata: "metin gerekli (en fazla 1000 karakter)" }, { status: 400, headers: cors });
    }

    const kullanici = onceki
      ? `Önceki filtreler: ${JSON.stringify(onceki)}\n\nYeni mesaj: ${metin}`
      : metin;

    const yanit = await anthropic.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: FILTRE_SEMASI },
      },
      system: [{ type: "text", text: await sistemMetni() }],
      messages: [{ role: "user", content: kullanici }],
    });

    if (yanit.stop_reason === "refusal" || yanit.stop_reason === "max_tokens") {
      return Response.json(
        { filtreler: onceki ?? {}, ozet: "İsteğinizi anlayamadım, farklı söyler misiniz?", anlasilmadi: true },
        { headers: cors },
      );
    }

    const metinBlok = yanit.content.find((b) => b.type === "text");
    const { ozet, anlasilmadi, ...filtreler } = JSON.parse(metinBlok && "text" in metinBlok ? metinBlok.text : "{}");

    // Ürün iyileştirme için anonim kayıt (kişisel veri yok); hata aramayı bozmasın.
    supabase.from("sesli_arama_kayitlari").insert({ metin, filtreler, dil }).then(() => {}, () => {});

    return Response.json({ filtreler, ozet, anlasilmadi }, { headers: cors });
  } catch (e) {
    console.error("sesli-arama", e);
    return Response.json({ hata: "arama yorumlanamadı" }, { status: 500, headers: cors });
  }
});

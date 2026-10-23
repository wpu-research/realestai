// İlan zekası: fotoğraflara oda etiketi (NVIDIA görsel model), EN/RU/DE çeviri ve kırmızı bayrak
// tespiti (Claude). Yalnız ekip (admin / ekip rolü) çağırabilir.
//
// İstek:  { ilan_id: string, is: "foto" | "ceviri" }
// Yanıt:  foto   → { etiketlenen, hatali, kalan }   kalan > 0 ise istemci tekrar çağırır
//         ceviri → { diller, kirmizi_bayraklar }
//
// Fotoğraf başına ~25 sn sürdüğü için her çağrı en fazla FOTO_PARTI fotoğrafı paralel işler;
// böylece Edge Function süre sınırına takılmaz.
//
// Secrets: NVIDIA_API_KEY, ANTHROPIC_API_KEY (zorunlu), NVIDIA_VISION_MODEL (isteğe bağlı)

import Anthropic from "npm:@anthropic-ai/sdk@1.1.0";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
// 2026-10-22 denemesi: nemotron-3.5-super-vl dış cephe/havuz fotoğrafını doğru etiketledi (~24 sn);
// llama-3.2-11b-vision şablonu geri yazdı, llama-3.2-90b-vision zaman aşımına uğradı.
const VISION_MODEL = Deno.env.get("NVIDIA_VISION_MODEL") ?? "nvidia/nemotron-3.5-super-vl-120b-a12b";
const FOTO_PARTI = 4;

const ODALAR = ["salon", "mutfak", "yatak_odasi", "banyo", "dis_cephe", "havuz", "bahce", "manzara",
  "teras", "koridor", "kat_plani", "diger"];
const BAYRAKLAR = ["hisseli_tapu", "imarsiz", "iskansiz", "kooperatif", "kat_irtifaki",
  "kiyi_kenar_cizgisi", "tarla_vasfi", "zeytinlik", "ipotekli", "kiracili", "yapi_kayit"];

const servis = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const anthropic = new Anthropic();

// Model JSON'u bazen ```json bloğu ya da ek metinle döndürür; ilk {...} bloğunu al.
function jsonAyikla<T>(metin: string): T | null {
  const bas = metin.indexOf("{");
  const son = metin.lastIndexOf("}");
  if (bas < 0 || son <= bas) return null;
  try {
    return JSON.parse(metin.slice(bas, son + 1)) as T;
  } catch {
    return null;
  }
}

// NVIDIA satır içi görsellerde boyut sınırı var: 768 px'e küçültüp JPEG olarak gönder.
async function kucukJpegBase64(url: string): Promise<string> {
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`foto indirilemedi ${r.status}`);
  const img = await Image.decode(new Uint8Array(await r.arrayBuffer()));
  if (img.width > img.height) img.resize(768, Image.RESIZE_AUTO);
  else img.resize(Image.RESIZE_AUTO, 768);
  const jpeg = await img.encodeJPEG(75);
  let ikili = "";
  for (let i = 0; i < jpeg.length; i += 0x8000) ikili += String.fromCharCode(...jpeg.subarray(i, i + 0x8000));
  return btoa(ikili);
}

async function fotoEtiketi(url: string): Promise<{ oda: string; aciklama: string | null }> {
  const b64 = await kucukJpegBase64(url);
  const r = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("NVIDIA_API_KEY")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      // Akıl yürüten model: düşünme payı için yüksek max_tokens gerekiyor.
      max_tokens: 2500,
      temperature: 0.1,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `Bu bir emlak ilanı fotoğrafı. Yalnız JSON döndür, başka metin yazma:
{"oda": "${ODALAR.join("|")}" değerlerinden biri, "aciklama": "en fazla 12 kelimelik Türkçe açıklama"}`,
          },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
        ],
      }],
    }),
    signal: AbortSignal.timeout(100_000),
  });
  if (!r.ok) throw new Error(`NVIDIA ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const icerik: string = (await r.json()).choices?.[0]?.message?.content ?? "";
  const j = jsonAyikla<{ oda?: string; aciklama?: string }>(icerik);
  if (!j) throw new Error("NVIDIA cevabı JSON değil");
  return { oda: j.oda && ODALAR.includes(j.oda) ? j.oda : "diger", aciklama: j.aciklama ?? null };
}

async function fotolariEtiketle(ilanId: string) {
  // Henüz etiketlenmemiş (ne YZ ne elle) fotoğraflar; elle verilen etikete dokunulmaz.
  const { data: bekleyen } = await servis
    .from("ilan_fotolari")
    .select("id, url")
    .eq("ilan_id", ilanId)
    .is("etiket_kaynagi", null)
    .order("sira");
  const parti = (bekleyen ?? []).slice(0, FOTO_PARTI);

  const sonuclar = await Promise.allSettled(parti.map(async (f) => {
    const { oda, aciklama } = await fotoEtiketi(f.url);
    await servis.from("ilan_fotolari")
      .update({ oda_etiketi: oda, etiket_kaynagi: "yz", etiket_aciklama: aciklama })
      .eq("id", f.id);
  }));
  sonuclar.forEach((s, i) => s.status === "rejected" && console.error("foto", parti[i].id, s.reason));

  const etiketlenen = sonuclar.filter((s) => s.status === "fulfilled").length;
  return {
    etiketlenen,
    hatali: sonuclar.length - etiketlenen,
    kalan: (bekleyen?.length ?? 0) - etiketlenen,
  };
}

const CEVIRI = {
  type: "object",
  additionalProperties: false,
  properties: { baslik: { type: "string" }, aciklama: { type: "string" } },
  required: ["baslik", "aciklama"],
};
const CEVIRI_SEMASI = {
  type: "object",
  additionalProperties: false,
  properties: {
    en: CEVIRI,
    ru: CEVIRI,
    de: CEVIRI,
    kirmizi_bayraklar: { type: "array", items: { type: "string", enum: BAYRAKLAR } },
  },
  required: ["en", "ru", "de", "kirmizi_bayraklar"],
};

async function cevirVeDenetle(ilanId: string) {
  const { data: ilan } = await servis
    .from("ilanlar").select("baslik, aciklama, ceviriler").eq("id", ilanId).single();
  if (!ilan) throw new Error("ilan bulunamadı");

  const yanit = await anthropic.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: CEVIRI_SEMASI } },
    system: `Bodrum'da bir emlak sitesinin ilan editörüsün. Türkçe ilan başlığı ve açıklamasını
İngilizce (en), Rusça (ru) ve Almanca (de) diline çevir ve alıcı için riskleri işaretle.

Çeviri:
- Emlak dilinde doğal çevir. Mahalle ve yer adlarını (Gümüşlük, Yalıkavak…) çevirme.
- Rakam, m², oda sayısı (3+1), fiyat ve mesafeleri değiştirme. Bilgi ekleme, çıkarma, abartma.
- Hukuki terimleri doğru karşılığıyla çevir; asla yumuşatma. Örn. "hisseli tapu" = shared /
  co-owned title deed (not an individual title), "kat irtifakı" = construction servitude
  (not yet full condominium title), "iskânsız" = without occupancy permit.

Kırmızı bayraklar: metinde AÇIKÇA geçen durumları işaretle, tahmin yürütme. Metinde yoksa boş liste.`,
    messages: [{ role: "user", content: `BAŞLIK: ${ilan.baslik}\nAÇIKLAMA: ${ilan.aciklama}` }],
  });
  if (yanit.stop_reason === "refusal" || yanit.stop_reason === "max_tokens") {
    throw new Error(`çeviri tamamlanamadı (${yanit.stop_reason})`);
  }
  const blok = yanit.content.find((b) => b.type === "text");
  const j = JSON.parse(blok && "text" in blok ? blok.text : "{}");

  const ceviriler = { ...(ilan.ceviriler ?? {}), en: j.en, ru: j.ru, de: j.de };
  const bayraklar: string[] = (j.kirmizi_bayraklar ?? []).filter((b: string) => BAYRAKLAR.includes(b));
  await servis.from("ilanlar")
    .update({ ceviriler, kirmizi_bayraklar: bayraklar, zeka_guncellendi_at: new Date().toISOString() })
    .eq("id", ilanId);
  return { diller: ["en", "ru", "de"], kirmizi_bayraklar: bayraklar };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Çağıranın ekip üyesi olduğunu kendi oturumuyla doğrula.
  const kullanici = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: yetkili } = await kullanici.rpc("is_staff");
  if (!yetkili) return Response.json({ hata: "yetkisiz" }, { status: 403, headers: cors });

  try {
    const { ilan_id, is } = await req.json();
    if (typeof ilan_id !== "string" || !["foto", "ceviri"].includes(is)) {
      return Response.json({ hata: 'ilan_id ve is ("foto" | "ceviri") gerekli' }, { status: 400, headers: cors });
    }
    const sonuc = is === "foto" ? await fotolariEtiketle(ilan_id) : await cevirVeDenetle(ilan_id);
    return Response.json(sonuc, { headers: cors });
  } catch (e) {
    console.error("ilan-zeka", e);
    return Response.json({ hata: String(e instanceof Error ? e.message : e) }, { status: 500, headers: cors });
  }
});

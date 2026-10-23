import sharp from "sharp";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
// 2026-10-22 denemesi: nemotron-3.5-super-vl dış cephe/havuz fotoğrafını doğru etiketledi (~24 sn);
// llama-3.2-11b-vision şablonu geri yazdı, llama-3.2-90b-vision zaman aşımına uğradı.
const MODEL = process.env.NVIDIA_VISION_MODEL ?? "nvidia/nemotron-3.5-super-vl-120b-a12b";

export const ODALAR = ["salon", "mutfak", "yatak_odasi", "banyo", "dis_cephe", "havuz", "bahce", "manzara",
  "teras", "koridor", "kat_plani", "diger"];

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

// Fotoğraf baytlarından oda etiketi. NVIDIA satır içi görsel sınırı için 768 px JPEG'e küçültülür.
export async function fotoEtiketi(foto: Buffer): Promise<{ oda: string; aciklama: string | null }> {
  const anahtar = process.env.NVIDIA_API_KEY;
  if (!anahtar) throw new Error("NVIDIA_API_KEY tanımlı değil");
  const kucuk = await sharp(foto).rotate().resize(768, 768, { fit: "inside" }).jpeg({ quality: 75 }).toBuffer();

  const r = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${anahtar}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2500,   // akıl yürüten model: düşünme payı gerekiyor
      temperature: 0.1,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `Bu bir emlak ilanı fotoğrafı. Yalnız JSON döndür, başka metin yazma:
{"oda": "${ODALAR.join("|")}" değerlerinden biri, "aciklama": "en fazla 12 kelimelik Türkçe açıklama"}`,
          },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${kucuk.toString("base64")}` } },
        ],
      }],
    }),
    signal: AbortSignal.timeout(100_000),
  });
  if (!r.ok) throw new Error(`NVIDIA ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const icerik: string = (await r.json()).choices?.[0]?.message?.content ?? "";
  const j = jsonAyikla<{ oda?: string; aciklama?: string }>(icerik);
  if (!j) throw new Error("NVIDIA cevabı JSON değil");
  return { oda: j.oda && ODALAR.includes(j.oda) ? j.oda : "diger", aciklama: j.aciklama ?? null };
}

// Konuşan arama asistanı (avatar): kullanıcıya sırayla soru sorup filtreleri doldurur.
// Durumsuz: her turda tüm konuşma + mevcut filtreler istemciden gelir.
// İstek:  { mesajlar: {rol: "kullanici"|"asistan", metin: string}[], filtreler?: Filtreler,
//           dil?: "tr"|"en"|"ru"|"de", oturum_id?: string }
// Yanıt:  { cevap, filtreler, secenekler, tamamlandi, oturum_id }
//   cevap      → avatarın sesli söyleyeceği kısa metin (TTS)
//   secenekler → ekranda dokunulabilir hızlı cevap çipleri
//   tamamlandi → true ise istemci sonuçları gösterir
//
// Secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import Anthropic from "npm:@anthropic-ai/sdk@1.1.0";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const anthropic = new Anthropic();
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const FILTRELER = {
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
  },
};

const YANIT_SEMASI = {
  type: "object",
  additionalProperties: false,
  properties: {
    cevap: { type: "string" },
    filtreler: FILTRELER,
    secenekler: { type: "array", items: { type: "string" } },
    tamamlandi: { type: "boolean" },
  },
  required: ["cevap", "filtreler", "secenekler", "tamamlandi"],
};

let mahalleListesi: string | null = null;
async function mahalleler(): Promise<string> {
  if (!mahalleListesi) {
    const { data } = await supabase.from("mahalleler").select("slug, ad, ilce, segment, kiyi").order("ilce");
    mahalleListesi = (data ?? [])
      .map((m) => `${m.slug} — ${m.ad}, ${m.ilce} (${m.segment}${m.kiyi ? ", kıyı" : ""})`)
      .join("\n");
  }
  return mahalleListesi;
}

// Sistem metni sabit kalsın ki önbelleğe alınabilsin; tarih ve dil kullanıcı mesajına eklenir.
async function sistemMetni(): Promise<string> {
  return `Sen ekibimizdeki Didem'in yapay zekâ avatarısın: Bodrum ve çevresinde ev arayanlara yardım
eden güler yüzlü, sakin bir emlak asistanı. Ekranda Didem'in görünüşü ve sesiyle konuşuyorsun ama
gerçek Didem DEĞİLSİN. Görevin, kullanıcının filtre kullanmasına gerek kalmadan, kısa bir sohbetle
doğru ilanları bulmak için gerekli kriterleri öğrenmek.

YAPAY ZEKÂ OLDUĞUNU SÖYLE
- İlk cümlende mutlaka yapay zekâ olduğunu söyle: "Merhaba, ben Didem'in yapay zekâ asistanıyım."
- "Gerçek misin / insan mısın / Didem sen misin" diye sorulursa açıkça yapay zekâ olduğunu söyle.
- Kullanıcı gerçek biriyle konuşmak isterse: "Tabii, ekibimiz sizi arasın; numaranızı ilan
  sayfasındaki formdan bırakabilirsiniz" de. Kendi adına randevu, söz veya pazarlık yapma.

KONUŞMA KURALLARI
- Her seferinde YALNIZ BİR soru sor. Cevabın en fazla 2 kısa cümle olsun; sesli okunacak.
- Kullanıcının dilinde konuş (tr/en/ru/de). Emoji, madde işareti, markdown, URL kullanma.
- Rakamları konuşma diliyle yaz ("8 bin lira", "2 buçuk milyon").
- Kullanıcı birden fazla bilgiyi tek seferde verirse hepsini al, onları tekrar sorma.
- Bilmediğini uydurma. Fiyat, mevzuat veya belirli bir ev hakkında söz verme; ilanları sen değil
  site gösterir.
- Konu emlak araması dışına çıkarsa kibarca aramaya geri dön.

SORU SIRASI (yalnız henüz bilinmeyenleri sor, gereksizleri atla)
1. tip: satın alma / yıllık kira / sezonluk (birkaç ay) / tatil (gecelik)
2. gunluk veya sezonluk ise: tarihler, kişi sayısı (min_kapasite)
3. satilik ise: oturmak mı, yazlık mı, yatırım mı (yatırımsa siralama=en_firsat, sadece_firsat önerebilirsin)
4. bütçe (gunluk: gecelik; kiralik: aylık; sezonluk: sezon toplamı; satilik: toplam). Para birimi
   söylenmezse TRY; yabancı konuşan kullanıcıya EUR varsay ve söyle.
5. bölge: "Sakin mi, hareketli mi, aile dostu plajlar mı, yıl boyu yaşamak için mi?" gibi sor;
   cevabı aşağıdaki mahallelerden uygun slug'lara çevir. Kullanıcı mahalle adı verirse onu kullan.
6. oda sayısı (gunluk hariç)
7. olmazsa olmazlar: havuz, deniz manzarası, denize yakınlık, site, eşyalı, evcil hayvan — tek
   soruda "Olmazsa olmazınız var mı, mesela havuz ya da deniz manzarası?" diye sor.

ZORUNLU: tip ve bütçe. gunluk/sezonluk için ayrıca tarih ve kişi sayısı.
Zorunlular tamamlanıp en fazla 6 soru sorulduysa ya da kullanıcı "göster", "yeter", "bakalım"
derse tamamlandi = true yap ve cevapta kısaca özetleyip "Size uygun ilanları gösteriyorum" de.
Sonuçlar gösterildikten sonra kullanıcı düzeltme isterse ("daha ucuz", "Turgutreis de olsun")
filtreleri güncelle ve tamamlandi = true bırak.

FİLTRELER
- Her turda o ana kadar öğrenilen TÜM filtreleri döndür (öncekileri koru).
- "denize yakın" → max_denize_mesafe_m 500, "denize sıfır" → 100.
- "biraz daha ucuz" → max_fiyat'ı yaklaşık %15 düşür.
- Belirsiz tarih ("ağustosta bir hafta") → ayın ilk haftasını al ve cevapta teyit et.

SEÇENEKLER
- Sorduğun soruya uygun 2–5 kısa hızlı cevap üret (kullanıcının dilinde), ör. tip sorusunda
  ["Satın almak", "Yıllık kira", "Yazlık", "Tatil"]. Bütçede tipe uygun 3–4 aralık. tamamlandi
  true ise ["Daha ucuz", "Havuzlu olsun", "Başka bölge"] gibi düzeltme önerileri.

MAHALLELER (slug — ad, ilçe (segment))
${await mahalleler()}`;
}

type Mesaj = { rol: "kullanici" | "asistan"; metin: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { mesajlar = [], filtreler = {}, dil = "tr", oturum_id } = await req.json() as {
      mesajlar?: Mesaj[]; filtreler?: Record<string, unknown>; dil?: string; oturum_id?: string;
    };
    if (!Array.isArray(mesajlar) || mesajlar.length > 40 || mesajlar.some((m) => (m.metin ?? "").length > 1000)) {
      return Response.json({ hata: "geçersiz konuşma" }, { status: 400, headers: cors });
    }

    // İlk tur: kullanıcı henüz konuşmadıysa asistan selamlayıp ilk soruyu sorar.
    const gecmis = mesajlar.length
      ? mesajlar.map((m) => ({ role: m.rol === "asistan" ? "assistant" as const : "user" as const, content: m.metin }))
      : [{ role: "user" as const, content: "(Kullanıcı asistanı yeni açtı. Yapay zekâ olduğunu söyleyerek kendini tek cümleyle tanıt ve ilk soruyu sor.)" }];
    if (gecmis[0].role === "assistant") gecmis.unshift({ role: "user", content: "(Kullanıcı asistanı açtı.)" });

    const son = gecmis[gecmis.length - 1];
    if (son.role === "user") {
      son.content = `[bugün ${new Date().toISOString().slice(0, 10)}, dil ${dil}, mevcut filtreler ${JSON.stringify(filtreler)}]\n${son.content}`;
    }

    const yanit = await anthropic.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: YANIT_SEMASI } },
      system: [{ type: "text", text: await sistemMetni(), cache_control: { type: "ephemeral" } }],
      messages: gecmis,
    });

    let sonuc: { cevap: string; filtreler: Record<string, unknown>; secenekler: string[]; tamamlandi: boolean };
    const blok = yanit.content.find((b) => b.type === "text");
    if (yanit.stop_reason === "refusal" || yanit.stop_reason === "max_tokens" || !blok || !("text" in blok)) {
      sonuc = { cevap: "Kusura bakmayın, tam anlayamadım. Tekrar söyler misiniz?", filtreler, secenekler: [], tamamlandi: false };
    } else {
      sonuc = JSON.parse(blok.text);
    }

    // Oturum ölçümü (kişisel veri yok); hata konuşmayı bozmasın.
    let id = oturum_id;
    try {
      if (!id) {
        const { data } = await supabase.from("asistan_oturumlari")
          .insert({ kanal: "avatar", dil, filtreler: sonuc.filtreler, tamamlandi: sonuc.tamamlandi, adim_sayisi: 1 })
          .select("id").single();
        id = data?.id;
      } else {
        await supabase.from("asistan_oturumlari").update({
          filtreler: sonuc.filtreler, tamamlandi: sonuc.tamamlandi,
          adim_sayisi: Math.ceil(mesajlar.length / 2) + 1, updated_at: new Date().toISOString(),
        }).eq("id", id);
      }
    } catch (e) {
      console.error("oturum kaydi", e);
    }

    return Response.json({ ...sonuc, oturum_id: id }, { headers: cors });
  } catch (e) {
    console.error("asistan", e);
    return Response.json({ hata: "asistan şu an yanıt veremiyor" }, { status: 500, headers: cors });
  }
});

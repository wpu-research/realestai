// Didem'in sahip aramaları için adım adım rehber. Adayın verisine (fiyat, süre, tip, sahip olasılığı)
// göre ipuçları üretir; aramadan sonra gönderilecek WhatsApp mesajını hazırlar.
import { para, TIP_ETIKET } from "./bicim.js";

export type RehberAday = {
  tip: string; kaynak: string; mahalle: string | null; sahip_adi: string | null; telefon: string | null;
  fiyat: number | null; para_birimi: string; iskonto: number | null; sahip_olasiligi: number | null;
  yayinda_gun: number | null; fiyat_dustu: boolean;
};
export type RehberAdim = { baslik: string; soyle?: string; maddeler: string[] };

const KAYNAK_ADI: Record<string, string> = { sahibinden: "sahibinden.com", emlakjet: "Emlakjet", hepsiemlak: "Hepsiemlak" };

export function aramaRehberi(a: RehberAday, arayan: string, sirket: string, siteAdi: string): RehberAdim[] {
  const ilan = `${KAYNAK_ADI[a.kaynak] ?? a.kaynak}'taki ${a.mahalle ? `${a.mahalle} ` : ""}${(TIP_ETIKET[a.tip] ?? "").toLocaleLowerCase("tr")} ilanınız`;
  const ipuclari: string[] = [];
  if (a.sahip_olasiligi != null && a.sahip_olasiligi < 0.5) ipuclari.push(`Radar bu ilanın emlakçı ilanı olabileceğini düşünüyor (sahibinden olasılığı %${Math.round(a.sahip_olasiligi * 100)}); 2. adımı atlamayın.`);
  if (a.iskonto != null && a.iskonto >= 0.1) {
    ipuclari.push(`Fiyat bölge ortancasının %${Math.round(a.iskonto * 100)} altında. Ücretsiz bölge fiyat analizini öne çıkarın ve fiyatın piyasanın altında olabileceğini açıkça söyleyin — sahibin çıkarına olan budur.`);
  }
  if (a.fiyat_dustu) ipuclari.push("İlanın fiyatı düşürülmüş: satma/kiralama acelesi olabilir. Ne zamana kadar sonuçlanmasını istediğini sorun.");
  if (a.yayinda_gun != null && a.yayinda_gun >= 60) ipuclari.push(`İlan ${a.yayinda_gun} gündür yayında. Neden henüz sonuçlanmadığını nazikçe sorun (fiyat, fotoğraf, ulaşılan kitle).`);

  const belge = a.tip === "gunluk"
    ? "Günlük kiralama için Kültür ve Turizm Bakanlığı izin belgesi gerekiyor (7464 sayılı Kanun). Belgesi var mı, numarasını sorun; yoksa yayınlayamayız."
    : a.tip === "sezonluk"
      ? "100 günden kısa sezonluk kirada da turizm izin belgesi gerekir; süreyi ve belge durumunu sorun."
      : "Yayın için Elektronik İlan Doğrulama Sistemi (EİDS) onayı gerekecek: sahip e-Devlet'ten yetkiyi onaylar. Bunu önceden söyleyin.";

  return [
    {
      baslik: "1. Açılış",
      soyle: `Merhaba${a.sahip_adi ? ` ${a.sahip_adi}` : ""}, ben ${arayan}, ${siteAdi}'dan arıyorum. ${ilan} için aramıştım, iki dakikanız var mı?`,
      maddeler: ["Uygun değilse ne zaman arayabileceğinizi sorun ve sonucu \"Geri aranacak\" olarak kaydedin."],
    },
    {
      baslik: "2. Sahibi mi?",
      soyle: "İlanın sahibi siz misiniz? Evi şu an bir emlakçıyla yetki sözleşmesiyle mi satıyorsunuz?",
      maddeler: [
        "Emlakçıysa ya da başka bir ofisle münhasır sözleşmesi varsa teşekkür edip kapatın; sonucu \"Emlakçı çıktı\" kaydedin.",
      ],
    },
    {
      baslik: "3. KVKK aydınlatması (okuyun)",
      soyle: `Numaranızı yayındaki ilanınızdan aldık. Adınız ve telefonunuz ${sirket || "şirketimiz"} tarafından yalnız bu ilanla ilgili sizinle görüşmek için kullanılıyor; anlaşmazsak en geç 90 gün içinde siliniyor, isterseniz hemen siliyorum. Ayrıntılı metin sitemizde KVKK sayfasında.`,
      maddeler: ["Okuduktan sonra \"KVKK aydınlatması yapıldı\" kutusunu işaretleyin.", "\"Silin\" derse sayfanın altındaki \"Kişisel veriyi şimdi sil\" düğmesini kullanın."],
    },
    {
      baslik: "4. Teklif",
      soyle: "Evinizi sitemizde Türkçe, İngilizce, Rusça ve Almanca yayınlıyoruz; yerli ve yabancı alıcılara ulaştırıyoruz. Size ücretsiz bir bölge fiyat analizi de gönderebiliriz.",
      maddeler: ipuclari.length ? ipuclari : ["Bu ilan için özel bir işaret yok; değer önerisini anlatın."],
    },
    {
      baslik: "5. Sık itirazlar",
      maddeler: [
        "\"Ücreti ne?\" — Ücret/komisyon koşulları henüz yazılı değil: rakam söylemeyin, \"koşulları size yazılı ileteceğim\" deyin.",
        "\"Numaramı nereden buldunuz?\" — Yayındaki ilanınızdan; yalnız bu ilan için, isterseniz hemen siliyoruz.",
        "\"Yabancı alıcı gerçekten var mı?\" — Site dört dilde yayın yapıyor; alıcı ya da satış garantisi vermeyin.",
        "\"Başka emlakçılarla da çalışıyorum\" — Münhasır değilse sorun değil; yetki sözleşmesinin kapsamını birlikte netleştireceğinizi söyleyin.",
      ],
    },
    {
      baslik: "6. Kapanış",
      maddeler: [
        "İlgileniyorsa: yetki sözleşmesi ve yazılı KVKK onayı için buluşma ya da e-imza zamanı belirleyin; fotoğraf çekimini planlayın.",
        belge,
        "Bilgileri WhatsApp'tan göndermemi ister misiniz? — \"Evet\" derse aşağıdaki düğmeyle gönderin. Kampanya/duyuru mesajı için ayrıca İYS onayı gerekir; bu aramada istemeyin.",
        `Fiyat bilgisi: ilanda ${a.fiyat ? para(a.fiyat, a.para_birimi) : "fiyat yok"}. Sahibin beklediği fiyatı not edin.`,
      ],
    },
  ];
}

// wa.me için uluslararası biçim: 0532… / 532… / +90532… → 90532…
export function waNumara(telefon: string | null): string | null {
  if (!telefon) return null;
  let d = telefon.replace(/\D/g, "");
  if (d.startsWith("0")) d = "90" + d.slice(1);
  else if (d.length === 10 && d.startsWith("5")) d = "90" + d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

export function takipMesaji(a: RehberAday, arayan: string, siteAdi: string, kok: string): string {
  return [
    `Merhaba${a.sahip_adi ? ` ${a.sahip_adi}` : ""}, ben ${arayan} (${siteAdi}).`,
    `Az önce konuştuğumuz ${a.mahalle ? `${a.mahalle} ` : ""}ilanınız için bilgileri gönderiyorum:`,
    `${kok}/evimi-listele`,
    `Kişisel verilerinizle ilgili bilgilendirme: ${kok}/yasal/kvkk`,
  ].join("\n");
}

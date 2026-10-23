// Görüntüleme yardımcıları: fiyat, etiketler.

export const TIP_ETIKET: Record<string, string> = {
  satilik: "Satılık", kiralik: "Kiralık", sezonluk: "Sezonluk", gunluk: "Günlük",
};
export const TUR_ETIKET: Record<string, string> = {
  daire: "Daire", villa: "Villa", mustakil: "Müstakil", rezidans: "Rezidans", arsa: "Arsa", diger: "Diğer",
};
export const BIRIM_EK: Record<string, string> = {
  toplam: "", aylik: " / ay", sezon: " / sezon", gecelik: " / gece",
};
export const BAYRAK_ETIKET: Record<string, string> = {
  hisseli_tapu: "Hisseli tapu", imarsiz: "İmarsız", iskansiz: "İskânsız", kooperatif: "Kooperatif",
  kat_irtifaki: "Kat irtifakı", kiyi_kenar_cizgisi: "Kıyı kenar çizgisi", tarla_vasfi: "Tarla vasfı",
  zeytinlik: "Zeytinlik", ipotekli: "İpotekli", kiracili: "Kiracılı", yapi_kayit: "Yapı kayıt belgeli",
};
export const ADAY_DURUM_ETIKET: Record<string, string> = {
  yeni: "Yeni", aranacak: "Aranacak", ulasilamadi: "Ulaşılamadı", geri_aranacak: "Geri aranacak",
  ilgileniyor: "İlgileniyor", onaylandi: "Onayladı", reddetti: "Reddetti", emlakci_cikti: "Emlakçı çıktı",
};
export const ODA_ETIKET: Record<string, string> = {
  salon: "Salon", mutfak: "Mutfak", yatak_odasi: "Yatak odası", banyo: "Banyo", dis_cephe: "Dış cephe",
  havuz: "Havuz", bahce: "Bahçe", manzara: "Manzara", teras: "Teras", koridor: "Koridor",
  kat_plani: "Kat planı", diger: "Diğer",
};

const SEMBOL: Record<string, string> = { TRY: "₺", EUR: "€", USD: "$", GBP: "£" };

export function para(tutar: number | null | undefined, birim = "TRY"): string {
  if (tutar == null) return "—";
  const s = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(tutar);
  return birim === "TRY" ? `${s} ₺` : `${SEMBOL[birim] ?? birim}${s}`;
}

export function fiyatMetni(i: { fiyat: number; para_birimi: string; fiyat_birimi: string }): string {
  return para(i.fiyat, i.para_birimi) + (BIRIM_EK[i.fiyat_birimi] ?? "");
}

export function yuzde(x: number | null | undefined): string {
  return x == null ? "—" : `%${Math.round(x * 100)}`;
}

export function tarih(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
}

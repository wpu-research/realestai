// Şirket ve yayın ayarları (Admin → Yayına hazırlık). Şablonlar eşzamanlı okuduğu için bellekte tutulur;
// açılışta ve her kayıtta yenilenir.
import { sql } from "../db.js";

export type SiteAyar = {
  unvan: string; adres: string; mersis: string; vergi: string; yetki_belgesi_no: string;
  telefon: string; eposta: string; kep: string; whatsapp: string; instagram: string; facebook: string;
  demo_gizle: boolean;        // yayına çıkınca DEMO ilanlar sitede görünmez (silinmez)
  hukuk_onayli: boolean;      // yasal metinler avukattan geçti: "TASLAK" uyarısı kalkar
};
export const BOS: SiteAyar = {
  unvan: "", adres: "", mersis: "", vergi: "", yetki_belgesi_no: "", telefon: "", eposta: "", kep: "",
  whatsapp: "", instagram: "", facebook: "", demo_gizle: false, hukuk_onayli: false,
};
let ayar: SiteAyar = { ...BOS };

export const siteAyar = () => ayar;
export async function siteAyarYukle() {
  const [r] = await sql`select deger from ayarlar where anahtar = 'site'`;
  ayar = { ...BOS, ...(r?.deger ?? {}) };
}
export async function siteAyarKaydet(yeni: Partial<SiteAyar>) {
  ayar = { ...ayar, ...yeni };
  await sql`insert into ayarlar (anahtar, deger) values ('site', ${sql.json(ayar as any)})
    on conflict (anahtar) do update set deger = excluded.deger, updated_at = now()`;
}

// Herkese açık ilan sorgularına eklenir (ilanlar tablosu "i" takma adıyla).
export const demoKosulu = () => (ayar.demo_gizle ? sql`and not i.demo` : sql``);

// Yasal metinlerdeki yer tutucular; boş alan "[…]" olarak kalır ki eksik olduğu görülsün.
export function yerTutucu(metin: string): string {
  return metin
    .replaceAll("[ŞİRKET UNVANI]", ayar.unvan || "[ŞİRKET UNVANI]")
    .replaceAll("[e-posta]", ayar.eposta || "[e-posta]");
}
export const SIRKET_ZORUNLU: (keyof SiteAyar)[] = ["unvan", "adres", "mersis", "yetki_belgesi_no", "telefon", "eposta"];

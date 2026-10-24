import { sql } from "../db.js";
import { KUR } from "./arama.js";
import { firsatMi, fiyatPuanla, oncelik, sahipOlasiligi, type Gozlem } from "./puanlama.js";

const tl = (fiyat: number | null, pb: string | null) => (fiyat == null ? null : fiyat * (KUR[pb ?? "TRY"] ?? 1));
const BIRIM_ADI: Record<string, string> = { satilik: "₺/m²", kiralik: "₺/m²/ay", sezonluk: "₺/m²/ay", gunluk: "₺/kişi/gece" };

// Tüm adayları ve yayındaki ilanları piyasa gözlemi olarak kullanıp adayları yeniden puanlar.
export async function radarPuanla(): Promise<{ aday: number; puanlanan: number; firsat: number; ilan: number }> {
  const adaylar = await sql`
    select a.id, a.tip::text as tip, a.emlak_turu, a.oda, a.net_m2, a.yatak_kapasitesi, a.fiyat, a.para_birimi, a.fiyat_birimi,
           a.sezon_ay, a.baslik, a.aciklama, a.ilan_veren, a.yayinda_gun, a.fiyat_dustu, a.kirmizi_bayraklar, a.elle_puan,
           a.iskonto as eski_iskonto, a.sahip_olasiligi as eski_sahip, m.ad as mahalle,
           nullif(regexp_replace(coalesce(a.telefon, ''), '\\D', '', 'g'), '') as tel
    from adaylar a left join mahalleler m on m.id = a.mahalle_id`;
  const ilanlar = await sql`
    select i.id, i.tip::text as tip, i.emlak_turu, i.oda, i.net_m2, i.yatak_kapasitesi, i.fiyat, i.para_birimi, i.fiyat_birimi,
           i.kira_suresi_gun, m.ad as mahalle
    from ilanlar i left join mahalleler m on m.id = i.mahalle_id where i.durum = 'yayinda'`;

  const gozlemler: Gozlem[] = [
    ...adaylar.map((a) => ({
      id: `a:${a.id}`, kaynak: "aday" as const, tip: a.tip, mahalle: a.mahalle, emlak_turu: a.emlak_turu, oda: a.oda,
      net_m2: a.net_m2, yatak_kapasitesi: a.yatak_kapasitesi, fiyat: tl(a.fiyat, a.para_birimi),
      fiyat_birimi: a.fiyat_birimi ?? ({ satilik: "toplam", gunluk: "gecelik", sezonluk: "sezon" } as Record<string, string>)[a.tip] ?? "aylik",
      sezon_ay: a.sezon_ay,
    })),
    ...ilanlar.map((i) => ({
      id: `i:${i.id}`, kaynak: "ilan" as const, tip: i.tip, mahalle: i.mahalle, emlak_turu: i.emlak_turu, oda: i.oda,
      net_m2: i.net_m2, yatak_kapasitesi: i.yatak_kapasitesi, fiyat: tl(i.fiyat, i.para_birimi), fiyat_birimi: i.fiyat_birimi,
      sezon_ay: i.kira_suresi_gun ? i.kira_suresi_gun / 30.4 : null,
    })),
  ];
  const puan = fiyatPuanla(gozlemler);

  // Aynı telefon kaç adayda geçiyor (emlakçı göstergesi)
  const telSayisi = new Map<string, number>();
  for (const a of adaylar) if (a.tel) telSayisi.set(a.tel, (telSayisi.get(a.tel) ?? 0) + 1);

  let puanlanan = 0, firsatSayisi = 0, ilanSayisi = 0;
  await sql.begin(async (tx) => {
    for (const a of adaylar) {
      const f = puan.get(`a:${a.id}`);
      const s = sahipOlasiligi(a as any, a.tel ? telSayisi.get(a.tel)! : null);
      const bayrak = (a.kirmizi_bayraklar ?? []).length;
      // Elle/CSV ile verilmiş değerler, hesap yapılamadıysa korunur.
      const iskonto = f ? f.iskonto : a.elle_puan ? a.eski_iskonto : null;
      const sahip = a.elle_puan && a.eski_sahip != null && !a.aciklama ? a.eski_sahip : s.olasilik;
      const firsat = firsatMi(f?.iskonto ?? null, f?.z ?? null, bayrak);
      const birim = BIRIM_ADI[a.tip] ?? "";
      const fiyatGerekce = f
        ? [`${f.grupAdi} grubunda ${f.grupBuyuklugu} ilan`, `grup ortancası ${Math.round(f.medyan).toLocaleString("tr-TR")} ${birim}`,
           `bu ilan ${Math.round(f.birim).toLocaleString("tr-TR")} ${birim} (${f.iskonto >= 0 ? `%${Math.round(f.iskonto * 100)} altında` : `%${Math.round(-f.iskonto * 100)} üstünde`}, z=${f.z.toFixed(1)})`]
        : [a.fiyat ? `karşılaştırma için yeterli benzer ilan yok (en az 5 gerekir)` : "fiyat ya da m² eksik"];
      if ((a.yayinda_gun ?? 0) >= 60) fiyatGerekce.push(`${a.yayinda_gun} gündür yayında (pazarlığa açık olabilir)`);
      if (a.fiyat_dustu) fiyatGerekce.push("fiyatı düşmüş");
      if (bayrak) fiyatGerekce.push(`${bayrak} kırmızı bayrak — öncelik yarıya indirildi`);
      await tx`update adaylar set
          birim_fiyat = ${f?.birim ?? null}, bolge_medyani = ${f ? f.medyan : a.elle_puan ? sql`bolge_medyani` : null},
          iskonto = ${iskonto}, robust_z = ${f?.z ?? null}, grup_buyuklugu = ${f?.grupBuyuklugu ?? null}, grup_adi = ${f?.grupAdi ?? null},
          sahip_olasiligi = ${sahip},
          oncelik = ${oncelik({ sahip, iskonto, yayindaGun: a.yayinda_gun, fiyatDustu: a.fiyat_dustu, bayrakSayisi: bayrak })},
          firsat = ${firsat}, puan_gerekce = ${sql.json({ fiyat: fiyatGerekce, sahip: s.gerekce })}, puanlandi_at = now()
        where id = ${a.id}`;
      if (f) puanlanan++;
      if (firsat) firsatSayisi++;
    }
    // Yayındaki ilanların bölge karşılaştırması (sitedeki "bölge ortalamasının altında" rozeti)
    for (const i of ilanlar) {
      const f = puan.get(`i:${i.id}`);
      if (!f) continue;
      await tx`update ilanlar set bolge_medyani = ${f.medyan}, iskonto = ${f.iskonto} where id = ${i.id}`;
      ilanSayisi++;
    }
  });
  return { aday: adaylar.length, puanlanan, firsat: firsatSayisi, ilan: ilanSayisi };
}

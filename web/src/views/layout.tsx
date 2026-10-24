import type { Child } from "hono/jsx";
import { raw } from "hono/html";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE_ADI } from "../config.js";
import { siteAyar } from "../lib/site-ayar.js";
import { KUR, type IlanKart } from "../lib/arama.js";
import { para, TIP_ETIKET } from "../lib/bicim.js";
import { Alan, Kisi, Menu, Yatak } from "./ikon.js";
import { dil, dilAdresi, DILLER, istek, istemciCevirileri, SES_DILI, t } from "../lib/dil.js";
import { ISTEMCI_METINLERI } from "../lib/istemci-metinleri.js";

type SayfaProps = {
  baslik?: string;
  aciklama?: string;
  children: Child;
  harita?: boolean;
  scriptler?: string[];
  resim?: string;        // paylaşım önizlemesi (göreli ya da tam adres)
  noindex?: boolean;     // arama motorlarına kapalı sayfalar (DEMO ilan, kişisel sayfalar)
  jsonld?: object;       // schema.org yapılandırılmış veri
};
const OG_YEREL = { tr: "tr_TR", en: "en_GB", ru: "ru_RU", de: "de_DE" } as const;

const KALP = "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z";

export function Sayfa({ baslik, aciklama, children, harita, scriptler = [], resim, noindex, jsonld }: SayfaProps) {
  const a = siteAyar();
  const { kok } = istek();
  const tamBaslik = baslik ? `${baslik} · ${SITE_ADI}` : `${SITE_ADI} · ${t("Bodrum'da ev, sahibinden")}`;
  const tamAciklama = aciklama ?? t("Bodrum ve çevresinde sahibinin yetki verdiği, doğrulanmış satılık, kiralık, sezonluk ve günlük evler.");
  const ogResim = resim ? (resim.startsWith("http") ? resim : kok + resim) : null;
  return (
    <html lang={dil()} data-ses-dili={SES_DILI[dil()]}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{tamBaslik}</title>
        <meta name="description" content={tamAciklama} />
        {noindex && <meta name="robots" content="noindex" />}
        <link rel="canonical" href={dilAdresi(dil())} />
        {DILLER.map((d) => <link rel="alternate" hreflang={d} href={dilAdresi(d)} />)}
        <link rel="alternate" hreflang="x-default" href={dilAdresi("tr")} />
        <meta property="og:site_name" content={SITE_ADI} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={baslik ?? tamBaslik} />
        <meta property="og:description" content={tamAciklama} />
        <meta property="og:url" content={dilAdresi(dil())} />
        <meta property="og:locale" content={OG_YEREL[dil()]} />
        {ogResim && <meta property="og:image" content={ogResim} />}
        <meta name="twitter:card" content={ogResim ? "summary_large_image" : "summary"} />
        {jsonld && <script type="application/ld+json">{json(jsonld)}</script>}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
        {harita && <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />}
        <link rel="stylesheet" href="/css/site.css" />
      </head>
      <body>
        <header class="ust">
          <div class="kap ust-ic">
            <a href="/" class="logo">{SITE_ADI}</a>
            <nav class="ust-nav" data-menu>
              <a href="/ara">{t("İlanlar")}</a>
              <a href="/evimi-listele">{t("Evinizi listeleyin")}</a>
            </nav>
            <div class="ust-sag">
              <a href="/kaydedilenler" class="kayit-link" aria-label={t("Kaydedilenler")} title={t("Kaydedilenler")}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d={KALP} /></svg>
                <span class="rozet-sayi" data-kayit-sayi hidden></span>
              </a>
              <select class="ust-secim" aria-label={t("Dil")} data-dil>
                {["tr", "en", "ru", "de"].map((d) => <option value={d} selected={dil() === d}>{d.toUpperCase()}</option>)}
              </select>
              <select class="ust-secim" aria-label={t("Para birimi")} data-para-birimi>
                {["TRY", "EUR", "USD", "GBP"].map((p) => <option value={p}>{p}</option>)}
              </select>
              <button type="button" class="menu-dugme" aria-label={t("Menü")} onclick="document.querySelector('[data-menu]').classList.toggle('acik')"><Menu boyut={22} /></button>
            </div>
          </div>
        </header>
        <main>{children}</main>
        <footer class="alt">
          <div class="kap alt-ic">
            <div>
              <a href="/" class="logo">{SITE_ADI}</a>
              <p>Bodrum · Milas · Didim</p>
              {a.yetki_belgesi_no && <p class="kucuk">{t("Taşınmaz Ticareti Yetki Belgesi No")}: {a.yetki_belgesi_no}</p>}
              {a.unvan && <p class="kucuk">{a.unvan}{a.mersis && <> · MERSİS {a.mersis}</>}</p>}
              <p class="alt-araclar">
                <a href="/endeks">{t("Emlak endeksi")}</a> · <a href="/kredi">{t("Kredi hesapla")}</a> · <a href="/emlakci-bul">{t("Bana emlakçı bul")}</a> · <a href="/ekspertiz">{t("Ekspertiz")}</a> ·{" "}
                <a href="/rehber/alirken">{t("Alırken")}</a> · <a href="/rehber/satarken">{t("Satarken")}</a> · <a href="/rehber/kiralarken">{t("Kiralarken")}</a> ·{" "}
                <a href="/sihirbaz">{t("Adım adım ara")}</a> · <a href="/asistan">{t("Didem'le konuş")}</a>
              </p>
            </div>
            <div class="alt-sutun">
              <strong>{t("Yasal")}</strong>
              <a href="/yasal/kvkk">{t("KVKK Aydınlatma Metni")}</a>
              <a href="/yasal/acik-riza">{t("Açık Rıza Metni")}</a>
              <a href="/yasal/cerez">{t("Çerez Politikası")}</a>
              <a href="/yasal/kullanim">{t("Kullanım Koşulları")}</a>
              <a href="/yasal/iys">{t("Ticari İleti Onay Metni")}</a>
            </div>
            <div class="alt-sutun">
              <strong>{t("İletişim")}</strong>
              {a.telefon && <a href={`tel:${a.telefon.replace(/[^\d+]/g, "")}`}>{a.telefon}</a>}
              {a.eposta && <a href={`mailto:${a.eposta}`}>{a.eposta}</a>}
              {a.adres && <span>{a.adres}</span>}
              {a.whatsapp && <a href={`https://wa.me/${a.whatsapp.replace(/\D/g, "")}`} rel="noopener">WhatsApp</a>}
              {a.instagram && <a href={a.instagram} rel="noopener">Instagram</a>}
              {a.facebook && <a href={a.facebook} rel="noopener">Facebook</a>}
            </div>
          </div>
        </footer>
        <div class="cerez-bandi" data-cerez hidden>
          <p>{t("Sitemiz yalnızca çalışması için zorunlu çerezleri kullanır. Ayrıntılar çerez politikamızda.")} <a href="/yasal/cerez">{t("Çerez politikası")}</a></p>
          <button type="button" class="dugme" data-cerez-tamam>{t("Anladım")}</button>
        </div>
        <script id="kurlar" type="application/json">{json(KUR)}</script>
        <script id="ceviri" type="application/json">{json(istemciCevirileri(ISTEMCI_METINLERI))}</script>
        {harita && <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>}
        {[...new Set([...scriptler, "/js/kaydet.js", "/js/genel.js"])].map((s) => <script type="module" src={s}></script>)}
      </body>
    </html>
  );
}

// Üretilmiş temsili görseller (public/img/mahalle/<slug>.jpg, public/img/ilan/demo-<no>-<k>.jpg).
// Açılışta bir kez taranır; olmayan için Lovable'ın 4 örnek görseline düşülür.
const imgKok = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "img");
const dosyalar = (alt: string) => { try { return new Set(readdirSync(join(imgKok, alt))); } catch { return new Set<string>(); } };
const MAHALLE_GORSEL = dosyalar("mahalle");
const ILAN_GORSEL = dosyalar("ilan");

export const ornekGorsel = (n: number) => `/img/ph-${(((n % 4) + 4) % 4) + 1}.jpg`;
export const mahalleGorseli = (slug: string, k: number) =>
  MAHALLE_GORSEL.has(`${slug}.jpg`) ? `/img/mahalle/${slug}.jpg` : ornekGorsel(k);
// DEMO ilan için k. temsili görsel (yoksa null)
export const demoGorseli = (no: number, k: number) =>
  ILAN_GORSEL.has(`demo-${no}-${k}.jpg`) ? `/img/ilan/demo-${no}-${k}.jpg` : null;
// DEMO görselin derinlik haritası (temsili 3D için; scripts/demo-derinlik.py üretir)
export const demoDerinligi = (no: number, k: number) =>
  ILAN_GORSEL.has(`demo-${no}-${k}-derinlik.jpg`) ? `/img/ilan/demo-${no}-${k}-derinlik.jpg` : null;
export const demoGorselleri = (no: number) =>
  [0, 1, 2, 3].map((k) => demoGorseli(no, k)).filter((x): x is string => !!x);

const BIRIM: Record<string, string> = { toplam: "", aylik: " /ay", sezon: " sezon toplamı", gecelik: " /gece" };

// İlan başlık/açıklaması: seçili dilde çeviri varsa o, yoksa Türkçe.
export function ilanMetni(i: { baslik: string; aciklama?: string; ceviriler?: Record<string, { baslik?: string; aciklama?: string }> }) {
  const c = dil() === "tr" ? undefined : i.ceviriler?.[dil()];
  return { baslik: c?.baslik || i.baslik, aciklama: c?.aciklama || i.aciklama || "" };
}

// Fiyat: sunucu ilanın kendi para biriminde yazar; üstteki para birimi seçimine göre tarayıcı çevirir.
export function Fiyat({ tutar, pb, ek = "", sinif }: { tutar: number; pb: string; ek?: string; sinif?: string }) {
  return <span class={sinif} data-tutar={tutar} data-pb={pb} data-ek={ek}>{para(tutar, pb)}{ek}</span>;
}

export function IlanKarti({ i }: { i: IlanKart }) {
  const kapak = i.kapak ?? (i.demo ? demoGorseli(i.ilan_no, 0) ?? ornekGorsel(i.ilan_no) : null);
  const fiyat = i.fiyat_birimi === "gecelik" ? i.donem_fiyati : i.fiyat;
  return (
    <a href={`/ilan/${i.ilan_no}`} class="kart">
      <div class="kart-gorsel">
        {kapak ? <img src={kapak} alt="" loading="lazy" /> : <div class="gorsel-yok"></div>}
        <span class="rozet rozet-tip">{t(TIP_ETIKET[i.tip])}</span>
        {i.demo && <span class="rozet rozet-demo">DEMO</span>}
        <button type="button" class="kalp" data-kaydet-ilan={i.ilan_no} aria-label={t("Kaydet")} aria-pressed="false">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2"><path d={KALP} /></svg>
        </button>
        {i.iskonto != null && i.iskonto >= 0.15 && (
          <span class="rozet rozet-firsat">{t("Bölge ortalamasının %{n} altında", { n: Math.round(i.iskonto * 100) })}</span>
        )}
      </div>
      <div class="kart-govde">
        <h3>{ilanMetni(i).baslik}</h3>
        <div class="kart-yer">{i.mahalle ?? "Bodrum"}, {i.ilce ?? "Bodrum"}{i.mesafe_km != null && ` · ${i.mesafe_km < 1 ? "<1" : Math.round(i.mesafe_km)} km`}</div>
        <div class="kart-ozellik">
          {i.oda && <span><Yatak boyut={14} />{i.oda}</span>}
          {i.net_m2 && <span><Alan boyut={14} />{i.net_m2} m²</span>}
          {i.yatak_kapasitesi && <span><Kisi boyut={14} />{i.yatak_kapasitesi} {t("kişi")}</span>}
        </div>
        <div class="kart-fiyat"><Fiyat tutar={fiyat} pb={i.para_birimi} ek={t(BIRIM[i.fiyat_birimi])} /></div>
        {i.tip === "satilik" && i.net_m2 && <div class="kart-m2"><Fiyat tutar={Math.round(i.fiyat / i.net_m2)} pb={i.para_birimi} ek=" / m²" /></div>}
      </div>
    </a>
  );
}

export const json = (x: unknown) => raw(JSON.stringify(x).replace(/</g, "\\u003c"));

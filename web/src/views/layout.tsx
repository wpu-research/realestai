import type { Child } from "hono/jsx";
import { raw } from "hono/html";
import { SITE_ADI } from "../config.js";
import type { IlanKart } from "../lib/arama.js";
import { para, TIP_ETIKET } from "../lib/bicim.js";
import { Alan, Kisi, Menu, Yatak } from "./ikon.js";

type SayfaProps = {
  baslik?: string;
  aciklama?: string;
  children: Child;
  harita?: boolean;
  scriptler?: string[];
  asistanDugmesi?: boolean;
  seffafUst?: boolean;
};

export function Sayfa({ baslik, aciklama, children, harita, scriptler = [], asistanDugmesi = true }: SayfaProps) {
  return (
    <html lang="tr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{baslik ? `${baslik} · ${SITE_ADI}` : `${SITE_ADI} · Bodrum'da ev, sahibinden`}</title>
        <meta name="description" content={aciklama ?? "Bodrum ve çevresinde sahibinin yetki verdiği, doğrulanmış satılık, kiralık, sezonluk ve günlük evler."} />
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
              <a href="/ara">İlanlar</a>
              <a href="/evimi-listele">Evinizi listeleyin</a>
              <a href="/sihirbaz">Adım adım ara</a>
              <a href="/asistan">Didem'le konuş</a>
            </nav>
            <button type="button" class="menu-dugme" aria-label="Menü" onclick="document.querySelector('[data-menu]').classList.toggle('acik')"><Menu boyut={22} /></button>
          </div>
        </header>
        <main>{children}</main>
        <footer class="alt">
          <div class="kap alt-ic">
            <div>
              <a href="/" class="logo">{SITE_ADI}</a>
              <p>Bodrum · Milas · Didim</p>
              <p class="kucuk">Taşınmaz Ticareti Yetki Belgesi No: [doldurulacak]</p>
            </div>
            <div class="alt-sutun">
              <strong>Yasal</strong>
              <a href="/yasal/kvkk">KVKK Aydınlatma Metni</a>
              <a href="/yasal/cerez">Çerez Politikası</a>
              <a href="/yasal/kullanim">Kullanım Koşulları</a>
            </div>
            <div class="alt-sutun">
              <strong>İletişim</strong>
              <span>[telefon — doldurulacak]</span>
              <span>[e-posta — doldurulacak]</span>
              <a href="/admin">Ekip girişi</a>
            </div>
          </div>
        </footer>
        {asistanDugmesi && (
          <a href="/asistan" class="asistan-balon" aria-label="Didem'le konuşarak ara">
            <img src="/img/didem.svg" alt="" />
            <span>Didem'le konuşarak ara</span>
          </a>
        )}
        {harita && <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>}
        {scriptler.map((s) => <script type="module" src={s}></script>)}
      </body>
    </html>
  );
}

// Fotoğrafı olmayan (yalnız DEMO) ilanlar için Lovable tasarımındaki örnek görseller.
export const ornekGorsel = (n: number) => `/img/ph-${(n % 4) + 1}.jpg`;

const BIRIM: Record<string, string> = { toplam: "", aylik: " /ay", sezon: " sezon toplamı", gecelik: " /gece" };

export function IlanKarti({ i }: { i: IlanKart }) {
  const kapak = i.kapak ?? (i.demo ? ornekGorsel(i.ilan_no) : null);
  const fiyat = i.fiyat_birimi === "gecelik" ? i.donem_fiyati : i.fiyat;
  return (
    <a href={`/ilan/${i.ilan_no}`} class="kart">
      <div class="kart-gorsel">
        {kapak ? <img src={kapak} alt="" loading="lazy" /> : <div class="gorsel-yok"></div>}
        <span class="rozet rozet-tip">{TIP_ETIKET[i.tip]}</span>
        {i.demo && <span class="rozet rozet-demo">DEMO</span>}
        {i.iskonto != null && i.iskonto >= 0.15 && (
          <span class="rozet rozet-firsat">Bölge ortalamasının %{Math.round(i.iskonto * 100)} altında</span>
        )}
      </div>
      <div class="kart-govde">
        <h3>{i.baslik}</h3>
        <div class="kart-yer">{i.mahalle ?? "Bodrum"}, {i.ilce ?? "Bodrum"}</div>
        <div class="kart-ozellik">
          {i.oda && <span><Yatak boyut={14} />{i.oda}</span>}
          {i.net_m2 && <span><Alan boyut={14} />{i.net_m2} m²</span>}
          {i.yatak_kapasitesi && <span><Kisi boyut={14} />{i.yatak_kapasitesi} kişi</span>}
        </div>
        <div class="kart-fiyat">{para(fiyat, i.para_birimi)}{BIRIM[i.fiyat_birimi]}</div>
        {i.tip === "satilik" && i.net_m2 && <div class="kart-m2">{para(Math.round(i.fiyat / i.net_m2), i.para_birimi)} / m²</div>}
      </div>
    </a>
  );
}

export const json = (x: unknown) => raw(JSON.stringify(x).replace(/</g, "\\u003c"));

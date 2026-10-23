import type { Child } from "hono/jsx";
import { raw } from "hono/html";
import { SITE_ADI } from "../config.js";
import type { IlanKart } from "../lib/arama.js";
import { fiyatMetni, para, TIP_ETIKET, TUR_ETIKET } from "../lib/bicim.js";

type SayfaProps = {
  baslik?: string;
  aciklama?: string;
  children: Child;
  harita?: boolean;
  scriptler?: string[];
  asistanDugmesi?: boolean;
};

export function Sayfa({ baslik, aciklama, children, harita, scriptler = [], asistanDugmesi = true }: SayfaProps) {
  return (
    <html lang="tr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{baslik ? `${baslik} · ${SITE_ADI}` : `${SITE_ADI} · Bodrum'da sahibinden ev`}</title>
        <meta name="description" content={aciklama ?? "Bodrum ve çevresinde sahibinden, doğrulanmış satılık, kiralık, sezonluk ve günlük evler."} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet" />
        {harita && <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />}
        <link rel="stylesheet" href="/css/site.css" />
      </head>
      <body>
        <header class="ust">
          <div class="kap ust-ic">
            <a href="/" class="logo">{SITE_ADI}<span>Bodrum</span></a>
            <nav class="ust-nav">
              <a href="/ara?tip=satilik">Satılık</a>
              <a href="/ara?tip=kiralik">Kiralık</a>
              <a href="/ara?tip=sezonluk">Sezonluk</a>
              <a href="/ara?tip=gunluk">Tatil</a>
              <a href="/evimi-listele" class="vurgu-link">Evimi listele</a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer class="alt">
          <div class="kap alt-ic">
            <div>
              <strong>{SITE_ADI}</strong>
              <p>Bodrum ve çevresinde yalnız sahibinin yetki verdiği, doğrulanmış ilanlar.</p>
              <p class="kucuk">Taşınmaz Ticareti Yetki Belgesi No: [doldurulacak]</p>
            </div>
            <div class="alt-linkler">
              <a href="/yasal/kvkk">KVKK Aydınlatma Metni</a>
              <a href="/yasal/cerez">Çerez Politikası</a>
              <a href="/yasal/kullanim">Kullanım Koşulları</a>
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

export function IlanKarti({ i }: { i: IlanKart }) {
  const ozellik = [
    i.oda,
    i.net_m2 ? `${i.net_m2} m²` : null,
    i.yatak_kapasitesi ? `${i.yatak_kapasitesi} kişi` : null,
    i.havuz !== "yok" ? (i.havuz === "ozel" ? "Özel havuz" : "Havuz") : null,
  ].filter(Boolean);
  return (
    <a href={`/ilan/${i.ilan_no}`} class="kart">
      <div class="kart-gorsel" style={i.kapak ? `background-image:url('${i.kapak}')` : undefined}>
        {!i.kapak && <div class="gorsel-yok">{TUR_ETIKET[i.emlak_turu]}</div>}
        <span class={`rozet tip-${i.tip}`}>{TIP_ETIKET[i.tip]}</span>
        {i.demo && <span class="rozet demo">DEMO</span>}
        {i.iskonto != null && i.iskonto >= 0.15 && (
          <span class="rozet firsat">Bölge ortancasının %{Math.round(i.iskonto * 100)} altında</span>
        )}
      </div>
      <div class="kart-govde">
        <div class="kart-yer">{i.mahalle ?? "Bodrum"}</div>
        <h3>{i.baslik}</h3>
        <div class="kart-ozellik">{ozellik.join(" · ")}</div>
        <div class="kart-fiyat">
          {i.fiyat_birimi === "gecelik" && i.donem_fiyati !== i.fiyat
            ? `${para(i.donem_fiyati, i.para_birimi)} / gece`
            : fiyatMetni(i)}
        </div>
      </div>
    </a>
  );
}

export const json = (x: unknown) => raw(JSON.stringify(x).replace(/</g, "\\u003c"));

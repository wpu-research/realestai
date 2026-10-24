import { Hono } from "hono";
import { dil, t } from "../lib/dil.js";
import { sql } from "../db.js";
import { filtreOku, filtreUrl, gevsetmeOnerisi, ilanAra, type Filtreler, type IlanKart } from "../lib/arama.js";
import { fiyatMetni, kisaFiyat, TIP_ETIKET } from "../lib/bicim.js";
import {
  BANYO, BINA_YASI, BULUNDUGU_KAT, CEPHE, ILAN_TARIHI, ISITMA, KAT_SAYISI, KIMDEN, KONUT_TIPLERI, MUTFAK,
  ODA, OZELLIK_GRUPLARI, TAPU, YAPI_DURUMU, type Secenek,
} from "../lib/ozellikler.js";
import { Ara, Ayar, Konum, Mikrofon } from "../views/ikon.js";
import { IlanKarti, json, Sayfa } from "../views/layout.js";

export const ara = new Hono();

type Mahalle = { slug: string; ad: string; ilce: string; il: string };

// Fiyat kaydırıcısının üst sınırı ilan tipine göre (TL).
const FIYAT_UST: Record<string, [number, number]> = {
  satilik: [100_000_000, 250_000], kiralik: [300_000, 5_000], sezonluk: [3_000_000, 10_000],
  gunluk: [60_000, 500], "": [100_000_000, 250_000],
};

const SIRALAMA: { k: string; e: string }[] = [
  { k: "onerilen", e: "Önerilen" }, { k: "eski", e: "Eski ilan" }, { k: "fiyat_artan", e: "Fiyat (artan)" },
  { k: "fiyat_azalan", e: "Fiyat (azalan)" }, { k: "en_firsat", e: "Bölge ortalamasının en altında" },
];
const YENI_ALT = [{ gun: 7, e: "1 hafta içinde" }, { gun: 21, e: "3 hafta içinde" }, { gun: 30, e: "1 ay içinde" }];

// Varsayılan dışında seçilmiş filtre sayısı (Filtrele düğmesindeki rozet).
function etkinFiltreSayisi(f: Filtreler): number {
  const disla = new Set(["siralama", "para_birimi", "kelime", "sinir"]);
  return Object.entries(f).filter(([k, v]) => !disla.has(k) && v != null && v !== false && !(Array.isArray(v) && !v.length)).length;
}

ara.get("/", async (c) => {
  const q = new URL(c.req.url).searchParams;
  const f = filtreOku(q);
  const [sonuclar, mh] = await Promise.all([
    ilanAra(f) as Promise<IlanKart[]>,
    sql<Mahalle[]>`select slug, ad, ilce, il from mahalleler order by il, ilce, ad`,
  ]);
  const oneri = sonuclar.length === 0 ? await gevsetmeOnerisi(f) : null;
  const dizide = (k: keyof Filtreler, v: string) => ((f[k] as string[] | undefined) ?? []).includes(v);
  const iller = [...new Set(mh.map((m) => m.il))];
  const ilceler = [...new Set(mh.filter((m) => !f.il || m.il === f.il).map((m) => m.ilce))];
  const [fiyatUst, fiyatAdim] = FIYAT_UST[f.tip ?? ""];
  const etkin = etkinFiltreSayisi(f);
  const siralamaLink = (ek: Partial<Filtreler>) => `/ara?${filtreUrl({ ...f, ilan_tarihi: undefined, ...ek })}`;
  const siraEtiketi = f.siralama === "yeni"
    ? `${t("Yeni ilan")}${f.ilan_tarihi ? ` · ${t(YENI_ALT.find((y) => y.gun === f.ilan_tarihi)?.e ?? "")}` : ""}`
    : f.siralama === "yakin" ? t("En yakın") : t(SIRALAMA.find((s) => s.k === (f.siralama ?? "onerilen"))?.e ?? "Önerilen");

  const Cip = ({ ad, deger, etiket, secili, radyo }: { ad: string; deger: string; etiket: string; secili: boolean; radyo?: boolean }) => (
    <label class="filtre-cip"><input type={radyo ? "radio" : "checkbox"} name={ad} value={deger} checked={secili} />{t(etiket)}</label>
  );
  const Cipler = ({ ad, liste, tek }: { ad: keyof Filtreler; liste: Secenek[]; tek?: boolean }) => (
    <div class="cipler">
      {tek && <Cip ad={ad} deger="" etiket="Fark etmez" secili={!f[ad]} radyo />}
      {liste.map((o) => <Cip ad={ad} deger={o.k} etiket={o.e} secili={tek ? f[ad] === o.k : dizide(ad, o.k)} radyo={tek} />)}
    </div>
  );
  const Evet = ({ ad, etiket }: { ad: keyof Filtreler; etiket: string }) => (
    <label class="filtre-cip"><input type="checkbox" name={ad} value="1" checked={!!f[ad]} />{t(etiket)}</label>
  );
  // Bölüm: içinde seçili filtre varsa açık başlar.
  const Bolum = ({ baslik, acik, children }: { baslik: string; acik?: boolean; children: any }) => (
    <details class="filtre-bolum" open={acik}><summary>{t(baslik)}</summary><div class="filtre-bolum-ic">{children}</div></details>
  );
  const var_ = (...k: (keyof Filtreler)[]) => k.some((x) => f[x] != null && !(Array.isArray(f[x]) && !(f[x] as unknown[]).length));

  return c.html(
    <Sayfa baslik={t("İlanlar")} harita scriptler={["/js/sesli-arama.js", "/js/ara.js", "/js/kaydet.js"]}>
      <div class="ara-sayfa">
        <form class="filtre-panel" id="filtreler-form" method="get" action="/ara" data-filtre-panel>
          <div class="panel-bas"><span class="ust-etiket">{t("Filtrele")}</span><button type="button" data-filtre-kapat aria-label={t("Kapat")}>✕</button></div>

          <Bolum baslik="Kategori" acik>
            <div class="cipler">
              <Cip ad="kategori" deger="" etiket="Tümü" secili={!f.kategori} radyo />
              <Cip ad="kategori" deger="konut" etiket="Konut" secili={f.kategori === "konut"} radyo />
              <Cip ad="kategori" deger="arsa" etiket="Arsa" secili={f.kategori === "arsa"} radyo />
            </div>
            <div class="cipler">
              <Cip ad="tip" deger="" etiket="Hepsi" secili={!f.tip} radyo />
              {Object.entries(TIP_ETIKET).map(([k, v]) => <Cip ad="tip" deger={k} etiket={v} secili={f.tip === k} radyo />)}
            </div>
            <h4>{t("Konut tipi")}</h4>
            <Cipler ad="emlak_turu" liste={KONUT_TIPLERI} />
          </Bolum>

          <Bolum baslik="Arama seçenekleri" acik>
            <div class="arama-secenek">
              <button type="button" class="secenek-dugme" data-haritada-ara><Konum boyut={16} /> {t("Haritada ara")}</button>
              <button type="button" class="secenek-dugme" data-yakinimda>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="8" /></svg>
                {f.yakin ? t("Yakınımda (açık)") : t("Yakınımda ara")}
              </button>
            </div>
            {f.yakin && (
              <label>{t("Yarıçap")}
                <select name="yaricap_km">{[1, 3, 5, 10, 20].map((km) => <option value={km} selected={(f.yaricap_km ?? 5) === km}>{km} km</option>)}</select>
              </label>
            )}
            <input type="hidden" name="yakin" value={f.yakin?.join(",") ?? ""} data-yakin-gizli />
            <div class="yakin-durum" data-yakin-durum></div>
            <h4>{t("Adres bilgileri")}</h4>
            <div class="uc-adres">
              <label>{t("İl")}<select name="il" data-il><option value="">{t("Tümü")}</option>{iller.map((x) => <option selected={f.il === x}>{x}</option>)}</select></label>
              <label>{t("İlçe")}<select name="ilce" data-ilce><option value="">{t("Tümü")}</option>{ilceler.map((x) => <option selected={f.ilce === x}>{x}</option>)}</select></label>
            </div>
            <h4>{t("Mahalle")}</h4>
            <div class="cipler" data-mahalle-cipler>
              {mh.map((m) => (
                <label class="filtre-cip" data-ilce-adi={m.ilce} data-il-adi={m.il}>
                  <input type="checkbox" name="mahalleler" value={m.slug} checked={dizide("mahalleler", m.slug)} />{m.ad}
                </label>
              ))}
            </div>
          </Bolum>

          <Bolum baslik={`${t("Fiyat")} (${f.para_birimi ?? "TRY"})`} acik>
            <div class="iki">
              <label>{t("Min")}<input type="number" name="min_fiyat" value={f.min_fiyat ?? ""} min="0" step={fiyatAdim} data-fiyat-min placeholder="0" /></label>
              <label>{t("Max")}<input type="number" name="max_fiyat" value={f.max_fiyat ?? ""} min="0" step={fiyatAdim} data-fiyat-max placeholder={t("Sınırsız")} /></label>
            </div>
            <div class="cift-kaydirici" data-kaydirici data-ust={fiyatUst} data-adim={fiyatAdim}>
              <div class="kaydirici-iz"><div class="kaydirici-dolu" data-dolu></div></div>
              <input type="range" min="0" max={fiyatUst} step={fiyatAdim} value={Math.min(f.min_fiyat ?? 0, fiyatUst)} data-aralik-min aria-label={t("En az fiyat")} />
              <input type="range" min="0" max={fiyatUst} step={fiyatAdim} value={Math.min(f.max_fiyat ?? fiyatUst, fiyatUst)} data-aralik-max aria-label={t("En çok fiyat")} />
            </div>
            <div class="kaydirici-etiket"><span data-etiket-min></span><span data-etiket-max></span></div>
            <input type="hidden" name="para_birimi" value={f.para_birimi ?? ""} />
          </Bolum>

          <Bolum baslik="m²" acik={var_("min_brut_m2", "max_brut_m2", "min_net_m2", "max_net_m2")}>
            <h4>{t("Brüt m²")}</h4>
            <div class="iki">
              <input type="number" name="min_brut_m2" value={f.min_brut_m2 ?? ""} min="0" placeholder={t("Min")} aria-label={t("En az brüt m²")} />
              <input type="number" name="max_brut_m2" value={f.max_brut_m2 ?? ""} min="0" placeholder={t("Max")} aria-label={t("En çok brüt m²")} />
            </div>
            <h4>{t("Net m²")}</h4>
            <div class="iki">
              <input type="number" name="min_net_m2" value={f.min_net_m2 ?? ""} min="0" placeholder={t("Min")} aria-label={t("En az net m²")} />
              <input type="number" name="max_net_m2" value={f.max_net_m2 ?? ""} min="0" placeholder={t("Max")} aria-label={t("En çok net m²")} />
            </div>
          </Bolum>

          <Bolum baslik="Konut özellikleri" acik={var_("oda", "bina_yasi", "kat_sayisi", "kat", "ara_kat", "isitma", "banyo", "mutfak",
            "balkon", "asansor", "otopark", "esya", "yapi_durumu", "site_ici", "ozel_alan", "tapu", "kimden", "ilan_tarihi", "fotolu",
            "videolu", "haritali", "cephe")}>
            <h4>{t("Oda sayısı")}</h4>
            <Cipler ad="oda" liste={ODA.map((o) => ({ k: o, e: o === "6+1" ? "6+1 ve üzeri" : o }))} />
            <h4>{t("Bina yaşı")}</h4><Cipler ad="bina_yasi" liste={BINA_YASI} />
            <h4>{t("Kat sayısı")}</h4><Cipler ad="kat_sayisi" liste={KAT_SAYISI} />
            <h4>{t("Bulunduğu kat")}</h4>
            <div class="cipler">
              {BULUNDUGU_KAT.map((o) => <Cip ad="kat" deger={o.k} etiket={o.e} secili={dizide("kat", o.k)} />)}
              <Evet ad="ara_kat" etiket="Ara kat" />
            </div>
            <h4>{t("Isıtma")}</h4><Cipler ad="isitma" liste={ISITMA} />
            <h4>{t("Banyo sayısı")}</h4><Cipler ad="banyo" liste={BANYO} />
            <h4>{t("Mutfak")}</h4><Cipler ad="mutfak" liste={MUTFAK} />
            <h4>{t("Donanım")}</h4>
            <div class="cipler">
              <Evet ad="balkon" etiket="Balkon" /><Evet ad="asansor" etiket="Asansör" /><Evet ad="otopark" etiket="Otopark" />
            </div>
            <h4>{t("Eşya")}</h4>
            <div class="cipler">
              <Cip ad="esya" deger="" etiket="Fark etmez" secili={!f.esya} radyo />
              <Cip ad="esya" deger="esyali" etiket="Eşyalı" secili={f.esya === "esyali"} radyo />
              <Cip ad="esya" deger="esyasiz" etiket="Eşyasız" secili={f.esya === "esyasiz"} radyo />
            </div>
            <h4>{t("Kullanım durumu")}</h4><Cipler ad="yapi_durumu" liste={YAPI_DURUMU} />
            <h4>{t("Konum tipi")}</h4>
            <div class="cipler"><Evet ad="site_ici" etiket="Site içerisinde" /><Evet ad="ozel_alan" etiket="Özel alanı bulunan" /></div>
            <h4>{t("Tapu durumu")}</h4><Cipler ad="tapu" liste={TAPU} />
            <h4>{t("Kimden")}</h4><Cipler ad="kimden" liste={KIMDEN} />
            <h4>{t("İlan tarihi")}</h4>
            <div class="cipler">
              <Cip ad="ilan_tarihi" deger="" etiket="Fark etmez" secili={!f.ilan_tarihi} radyo />
              {ILAN_TARIHI.map((o) => <Cip ad="ilan_tarihi" deger={o.k} etiket={o.e} secili={String(f.ilan_tarihi ?? "") === o.k} radyo />)}
            </div>
            <h4>{t("İlan içeriği")}</h4>
            <div class="cipler"><Evet ad="fotolu" etiket="Fotoğraflı" /><Evet ad="videolu" etiket="Videolu" /><Evet ad="haritali" etiket="Haritada konumu belli" /></div>
            <h4>{t("Cephe")}</h4><Cipler ad="cephe" liste={CEPHE} />
          </Bolum>

          {OZELLIK_GRUPLARI.map((g) => (
            <Bolum baslik={g.baslik} acik={g.secenekler.some((o) => dizide("ozellik", o.k)) || (g.ad === "dis" && !!f.havuz)}>
              {g.ad === "dis" && (
                <>
                  <h4>{t("Havuz")}</h4>
                  <div class="cipler">
                    <Cip ad="havuz" deger="" etiket="Fark etmez" secili={!f.havuz} radyo />
                    <Cip ad="havuz" deger="herhangi" etiket="Havuzlu" secili={f.havuz === "herhangi"} radyo />
                    <Cip ad="havuz" deger="ozel" etiket="Özel havuz" secili={f.havuz === "ozel"} radyo />
                    <Cip ad="havuz" deger="ortak" etiket="Ortak havuz" secili={f.havuz === "ortak"} radyo />
                  </div>
                  <h4>{t("Diğer")}</h4>
                </>
              )}
              <Cipler ad="ozellik" liste={g.secenekler} />
            </Bolum>
          ))}

          <input type="hidden" name="siralama" value={f.siralama ?? ""} />
          <input type="hidden" name="sinir" value={f.sinir?.join(",") ?? ""} data-sinir-gizli />
          <div class="panel-alt">
            <button class="dugme tam">{t("Sonuçları göster")}</button>
            <a href="/ara" class="temizle">{t("Filtreleri temizle")}</a>
          </div>
        </form>

        <section class="ara-orta">
          <div class="kum-kutu">
            <div class="arama-kutu" data-sesli-arama data-kelime-arama>
              <span class="arama-ikon"><Ara boyut={18} /></span>
              <input name="kelime" form="filtreler-form" value={f.kelime ?? ""} placeholder={t("Kelime ile ara: mahalle, site adı, özellik…")} autocomplete="off" />
              <button type="button" class="sesli-arama-dugme" data-mikrofon hidden><Mikrofon boyut={18} /><span>{t("Detaylı sesli arama")}</span></button>
              <button type="submit" form="filtreler-form" class="ara-dugme">{t("Ara")}</button>
              <div class="arama-durum" data-durum></div>
            </div>
            <div class="ara-ozet" data-ozet hidden></div>
          </div>

          <div class="sonuc-bas">
            <span data-sonuc-sayi>{t("{n} ilan", { n: sonuclar.length })}{f.sinir ? ` · ${t("harita alanında")}` : ""}{f.yakin ? ` · ${t("{km} km içinde", { km: f.yaricap_km ?? 5 })}` : ""}</span>
            <div class="sonuc-sag">
              <button type="button" class="filtre-ac" data-filtre-ac><Ayar boyut={16} /> Filtrele{etkin > 0 && <span class="rozet-sayi">{etkin}</span>}</button>
              <details class="sirala" data-sirala>
                <summary>{t("Sırala:")} <strong>{siraEtiketi}</strong></summary>
                <div class="sirala-menu">
                  <a href={siralamaLink({ siralama: undefined })} class={!f.siralama ? "secili" : ""}>{t("Önerilen")}</a>
                  <details class="sirala-alt" open={f.siralama === "yeni"}>
                    <summary class={f.siralama === "yeni" ? "secili" : ""}>{t("Yeni ilan")}</summary>
                    <a href={siralamaLink({ siralama: "yeni" })} class={f.siralama === "yeni" && !f.ilan_tarihi ? "secili" : ""}>{t("Tüm yeni ilanlar")}</a>
                    {YENI_ALT.map((y) => (
                      <a href={siralamaLink({ siralama: "yeni", ilan_tarihi: y.gun })} class={f.siralama === "yeni" && f.ilan_tarihi === y.gun ? "secili" : ""}>{t(y.e)}</a>
                    ))}
                  </details>
                  {SIRALAMA.slice(1).map((s) => <a href={siralamaLink({ siralama: s.k as Filtreler["siralama"] })} class={f.siralama === s.k ? "secili" : ""}>{t(s.e)}</a>)}
                  {f.yakin && <a href={siralamaLink({ siralama: "yakin" })} class={f.siralama === "yakin" ? "secili" : ""}>{t("En yakın")}</a>}
                </div>
              </details>
              <button type="button" class="dugme ikincil kucuk-dugme" data-arama-kaydet>{t("♡ Aramayı kaydet")}</button>
            </div>
          </div>

          <div class="harita-kart mobil-harita" data-mobil-harita><HaritaUstu /><div class="harita" data-harita></div></div>
          <div data-sonuc-alani>
            {sonuclar.length === 0 && (
              <div class="bos">
                <p>{t("Bu kriterlere uyan ilan yok.")}</p>
                {oneri && <p><strong>{oneri.alan}</strong> kriterini gevşetirseniz {oneri.sayi} ilan çıkıyor.</p>}
                {f.kelime && <p><button type="button" class="dugme ikincil" data-detayli-dene={f.kelime}>"{f.kelime}" için detaylı aramayı dene</button></p>}
                <a href="/sihirbaz" class="dugme ikincil">{t("Sihirbazla yeniden dene")}</a>
              </div>
            )}
            <div class="kartlar iki-sutun">{sonuclar.map((i) => <IlanKarti i={i} />)}</div>
            <script type="application/json" data-noktalar>{json(sonuclar.filter((i) => i.lat).map((i) => ({
              lat: i.lat, lng: i.lng, no: i.ilan_no, baslik: i.baslik, fiyat: fiyatMetni(i),
              kisa: kisaFiyat(i.fiyat_birimi === "gecelik" ? i.donem_fiyati : i.fiyat, i.para_birimi),
            })))}</script>
          </div>
        </section>

        <aside class="ara-harita">
          <div class="harita-kart"><HaritaUstu /><div class="harita" data-harita></div></div>
        </aside>
      </div>
      <script id="filtreler" type="application/json">{json(f)}</script>
    </Sayfa>,
  );
});

// Airbnb gibi: haritayı kaydırınca/yakınlaştırınca liste görünen alana göre yenilenir.
function HaritaUstu() {
  return (
    <div class="harita-ustu">
      <label class="harita-secim"><input type="checkbox" data-kaydirinca-ara checked />{t("Haritayı kaydırınca ara")}</label>
      <button type="button" class="harita-bu-alan" data-bu-alanda-ara hidden>{t("Bu alanda ara")}</button>
    </div>
  );
}

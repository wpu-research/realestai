"""Piyasa altı fiyat skoru — dört ilan tipi için.

Birim fiyat:
  satilik   TL / net m²
  kiralik   TL / net m² / ay
  sezonluk  TL / net m² / ay   (sezon toplamı kira süresine bölünür)
  gunluk    TL / kişi / gece   (karşılaştırma aynı sezon bandı içinde)

Karşılaştırma grubu küçükse kademeli olarak genişletilir. Skor: grup medyanına göre iskonto
ve MAD tabanlı robust z. Fiyatlar TRY'ye çevrilmiş varsayılır (kur dönüşümü radarda).
LightGBM hedonik modeli veri biriktikçe bu medyan tabanlı sürümün yerine geçecek.
"""

from collections import defaultdict
from dataclasses import dataclass
from statistics import median

from .model import Ilan

MIN_GRUP = 5
FIRSAT_ISKONTO = 0.15
FIRSAT_Z = -1.0
PAZARLIK_GUN = 60

# Bodrum sezon bantları (ay → bant). Mayıs ve Ekim tatil kirasında omuz sezon sayılır.
SEZON_BANDI = {7: "yuksek", 8: "yuksek", 5: "omuz", 6: "omuz", 9: "omuz", 10: "omuz"}


def sezon_bandi(ay: int) -> str:
    return SEZON_BANDI.get(ay, "dusuk")


def birim_fiyat(ilan: Ilan) -> float | None:
    if ilan.tip == "gunluk":
        if not ilan.yatak_kapasitesi:
            return None
        gecelik = ilan.fiyat / 7 if ilan.fiyat_birimi == "haftalik" else ilan.fiyat
        return gecelik / ilan.yatak_kapasitesi

    if not ilan.net_m2:
        return None
    if ilan.tip == "satilik":
        return ilan.fiyat / ilan.net_m2
    if ilan.fiyat_birimi == "sezon":
        if not (ilan.sezon_baslangic and ilan.sezon_bitis):
            return None
        ay = (ilan.sezon_bitis - ilan.sezon_baslangic).days / 30.4
        if ay <= 0:
            return None
        return ilan.fiyat / ay / ilan.net_m2
    return ilan.fiyat / ilan.net_m2


def _boyut(ilan: Ilan) -> str:
    if ilan.tip == "gunluk":
        k = ilan.yatak_kapasitesi or 0
        return "k<=4" if k <= 4 else "k5-8" if k <= 8 else "k9+"
    return ilan.oda or "?"


def grup_anahtarlari(ilan: Ilan) -> list[tuple]:
    """En dardan en genişe karşılaştırma grupları."""
    bant = sezon_bandi(ilan.tarih.month) if ilan.tip == "gunluk" and ilan.tarih else "-"
    return [
        (ilan.tip, bant, ilan.mahalle, ilan.emlak_turu, _boyut(ilan)),
        (ilan.tip, bant, ilan.mahalle, ilan.emlak_turu),
        (ilan.tip, bant, ilan.emlak_turu),
    ]


@dataclass
class Skor:
    ilan: Ilan
    birim_fiyat: float
    grup: tuple
    grup_buyuklugu: int
    grup_medyani: float
    iskonto: float
    robust_z: float

    @property
    def pazarlik_sinyali(self) -> bool:
        return self.ilan.yayinda_gun >= PAZARLIK_GUN or self.ilan.fiyat_dusus_sayisi > 0

    @property
    def firsat(self) -> bool:
        return (
            self.iskonto >= FIRSAT_ISKONTO
            and self.robust_z <= FIRSAT_Z
            and not self.ilan.kirmizi_bayraklar
        )


def skorla(ilanlar: list[Ilan]) -> list[Skor]:
    birimler = {id(i): birim_fiyat(i) for i in ilanlar}
    gruplar: dict[tuple, list[float]] = defaultdict(list)
    for i in ilanlar:
        b = birimler[id(i)]
        if b is None:
            continue
        for anahtar in grup_anahtarlari(i):
            gruplar[anahtar].append(b)

    sonuc = []
    for i in ilanlar:
        b = birimler[id(i)]
        if b is None:
            continue
        for anahtar in grup_anahtarlari(i):
            degerler = gruplar[anahtar]
            if len(degerler) >= MIN_GRUP:
                break
        else:
            continue  # en geniş grupta bile yeterli karşılaştırma yok
        med = median(degerler)
        mad = median(abs(v - med) for v in degerler) * 1.4826
        z = (b - med) / mad if mad else 0.0
        sonuc.append(Skor(i, b, anahtar, len(degerler), med, 1 - b / med, z))
    return sonuc


def firsat_listesi(skorlar: list[Skor], sahip_olasiliklari: dict[int, float],
                   min_sahip: float = 0.6) -> list[Skor]:
    """Temas sırası: sahip olasılığı × iskonto, pazarlık sinyali olanlara %20 öncelik."""
    adaylar = [s for s in skorlar
               if s.firsat and sahip_olasiliklari.get(id(s.ilan), 0) >= min_sahip]

    def oncelik(s: Skor) -> float:
        return sahip_olasiliklari[id(s.ilan)] * s.iskonto * (1.2 if s.pazarlik_sinyali else 1.0)

    return sorted(adaylar, key=oncelik, reverse=True)

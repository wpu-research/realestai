from dataclasses import dataclass, field
from datetime import date
from typing import Literal

IlanTipi = Literal["satilik", "kiralik", "sezonluk", "gunluk"]


@dataclass
class Ilan:
    """Radarın normalize ettiği tek ilan gözlemi (db: ilan + son gozlem)."""

    tip: IlanTipi
    mahalle: str
    emlak_turu: str
    fiyat: float
    fiyat_birimi: Literal["toplam", "aylik", "sezon", "gecelik", "haftalik"]
    net_m2: float | None = None
    oda: str | None = None
    yatak_kapasitesi: int | None = None
    sezon_baslangic: date | None = None
    sezon_bitis: date | None = None
    tarih: date | None = None               # gecelik fiyatın geçerli olduğu tarih
    ilan_veren: str = "bilinmiyor"
    eids_dogrulanmis: bool | None = None
    telefon_hash: str | None = None
    foto_phash: list[int] = field(default_factory=list)
    baslik: str = ""
    aciklama: str = ""
    yayinda_gun: int = 0
    fiyat_dusus_sayisi: int = 0
    kirmizi_bayraklar: list[str] = field(default_factory=list)

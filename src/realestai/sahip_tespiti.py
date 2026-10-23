"""'Sahibinden' etiketli ilanın gerçekten mülk sahibinden olma olasılığı.

Kural tabanlı ilk sürüm. Etiketli veri biriktikçe (temas sonrası gerçek durum) ağırlıklar
lojistik regresyonla yeniden öğrenilecek.
"""

import math
import re
from collections import Counter

from .model import Ilan

# Emlakçı/ofis dili. Küçük harfe çevrilmiş metinde aranır.
EMLAKCI_KALIPLARI = [
    r"portf[öo]y",
    r"ofis(imiz|imize)",
    r"gayrimenkul",
    r"emlak (ofisi|danışman)",
    r"danışman(ımız|ınız)",
    r"yetkili (satış|kiralama)",
    r"komisyon",
    r"randevu (alarak|ile) gösterilir",
    r"yatırımlık fırsat",
    r"kaçırılmayacak",
    r"\bremax\b|\bre/max\b|coldwell|century 21|turyap|\bera\b",
]
SAHIP_KALIPLARI = [
    r"aracı(sız)? istemiyorum|emlakçı(lar)? aramasın|emlakçılar rahatsız etmesin",
    r"sahibinden",
    r"kendi evim|evimizi|dairemizi|villamızı",
    r"acil (satılık|kiralık)",
]

# Log-odds ağırlıkları (başlangıç tahmini).
SABIT = 0.4
W_EMLAKCI_KALIP = -0.9          # her eşleşme, en fazla 3
W_SAHIP_KALIP = 0.6             # her eşleşme, en fazla 2
W_TELEFON_COK_ILAN = -1.2       # aynı numara ≥ 4 aktif ilanda
W_TELEFON_TEK_ILAN = 0.5
W_FOTO_BASKA_ILANDA = -1.0      # fotoğraf başka telefonla verilmiş ilanda da var
W_EIDS_SAHIP = 1.5              # EİDS rozeti ilan verenin sahip olduğunu gösteriyorsa
W_ETIKET_EMLAKCI = -3.0


def _sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def _kucuk_harf(metin: str) -> str:
    # str.lower() "İ"yi "i̇" (noktalı + birleşik) yapar; Türkçe eşlemeyi önce elle yap.
    return metin.replace("İ", "i").replace("I", "ı").lower()


def _eslesme(kaliplar: list[str], metin: str) -> int:
    return sum(1 for k in kaliplar if re.search(k, metin))


def telefon_sayaci(ilanlar: list[Ilan]) -> Counter:
    return Counter(i.telefon_hash for i in ilanlar if i.telefon_hash)


def foto_cakismalari(ilan: Ilan, ilanlar: list[Ilan], esik: int = 6) -> int:
    """Başka telefonla verilmiş ilanlarda görülen (Hamming ≤ esik) fotoğraf sayısı."""
    sayi = 0
    for h in ilan.foto_phash:
        for diger in ilanlar:
            if diger is ilan or diger.telefon_hash == ilan.telefon_hash:
                continue
            if any(bin(h ^ d).count("1") <= esik for d in diger.foto_phash):
                sayi += 1
                break
    return sayi


def sahip_olasiligi(ilan: Ilan, tel_sayaci: Counter, foto_cakisma: int = 0) -> float:
    if ilan.ilan_veren == "emlakci":
        return _sigmoid(SABIT + W_ETIKET_EMLAKCI)

    metin = _kucuk_harf(f"{ilan.baslik} {ilan.aciklama}")
    x = SABIT
    x += W_EMLAKCI_KALIP * min(_eslesme(EMLAKCI_KALIPLARI, metin), 3)
    x += W_SAHIP_KALIP * min(_eslesme(SAHIP_KALIPLARI, metin), 2)

    if ilan.telefon_hash:
        adet = tel_sayaci.get(ilan.telefon_hash, 0)
        if adet >= 4:
            x += W_TELEFON_COK_ILAN
        elif adet == 1:
            x += W_TELEFON_TEK_ILAN

    if foto_cakisma:
        x += W_FOTO_BASKA_ILANDA
    if ilan.eids_dogrulanmis:
        x += W_EIDS_SAHIP
    return _sigmoid(x)

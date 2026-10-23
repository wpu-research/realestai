from realestai.model import Ilan
from realestai.sahip_tespiti import foto_cakismalari, sahip_olasiligi, telefon_sayaci


def ilan(baslik="", aciklama="", tel=None, foto=(), **kw):
    return Ilan("satilik", "Bitez", "daire", 1e7, "toplam", net_m2=100, baslik=baslik,
                aciklama=aciklama, telefon_hash=tel, foto_phash=list(foto), **kw)


def test_emlakci_dili_dusurur():
    sahip = ilan("Sahibinden 2+1", "Kendi evim, emlakçılar aramasın", tel="a")
    ofis = ilan("Yatırımlık fırsat", "Portföyümüzdeki daire, ofisimize bekleriz", tel="b")
    sayac = telefon_sayaci([sahip, ofis])
    assert sahip_olasiligi(sahip, sayac) > 0.8
    assert sahip_olasiligi(ofis, sayac) < 0.3


def test_turkce_buyuk_harf():
    i = ilan("PORTFÖYÜMÜZDE", "OFİSİMİZE BEKLERİZ", tel="x")
    assert sahip_olasiligi(i, telefon_sayaci([i])) < 0.5


def test_marka_kalibi_kelime_icinde_eslesmez():
    i = ilan("Kameralı güvenlik", "", tel="x")
    j = ilan("ERA Gayrimenkul", "", tel="y")
    sayac = telefon_sayaci([i, j])
    assert sahip_olasiligi(i, sayac) > sahip_olasiligi(j, sayac)


def test_cok_ilanli_telefon():
    ilanlar = [ilan(tel="ayni") for _ in range(5)]
    tek = ilan(tel="tek")
    sayac = telefon_sayaci(ilanlar + [tek])
    assert sahip_olasiligi(ilanlar[0], sayac) < sahip_olasiligi(tek, sayac)


def test_foto_baska_telefonda():
    a = ilan(tel="a", foto=[0b1010_1010])
    b = ilan(tel="b", foto=[0b1010_1011])   # 1 bit fark
    c = ilan(tel="c", foto=[0xFFFF_0000])
    assert foto_cakismalari(a, [a, b, c]) == 1
    assert foto_cakismalari(c, [a, b, c]) == 0


def test_etiket_emlakci_ise_dusuk():
    i = ilan("Sahibinden", tel="z", ilan_veren="emlakci")
    assert sahip_olasiligi(i, telefon_sayaci([i])) < 0.1

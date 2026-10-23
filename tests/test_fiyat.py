from datetime import date

from realestai.fiyat import birim_fiyat, firsat_listesi, sezon_bandi, skorla
from realestai.model import Ilan


def satilik(fiyat, m2=100, oda="2+1", mahalle="Bitez", **kw):
    return Ilan("satilik", mahalle, "daire", fiyat, "toplam", net_m2=m2, oda=oda, **kw)


def test_birim_fiyat_tipler():
    assert birim_fiyat(satilik(10_000_000)) == 100_000
    kira = Ilan("kiralik", "Konacik", "daire", 40_000, "aylik", net_m2=80)
    assert birim_fiyat(kira) == 500
    sezon = Ilan("sezonluk", "Bitez", "villa", 912_000, "sezon", net_m2=150,
                 sezon_baslangic=date(2027, 5, 1), sezon_bitis=date(2027, 10, 31))
    assert round(birim_fiyat(sezon)) == round(912_000 / (183 / 30.4) / 150)
    gunluk = Ilan("gunluk", "Gumbet", "daire", 42_000, "haftalik", yatak_kapasitesi=4)
    assert birim_fiyat(gunluk) == 1500
    assert birim_fiyat(Ilan("satilik", "Bitez", "daire", 1, "toplam")) is None


def test_sezon_bandi():
    assert sezon_bandi(8) == "yuksek"
    assert sezon_bandi(10) == "omuz"
    assert sezon_bandi(1) == "dusuk"


def test_ucuz_ilan_firsat_olarak_isaretlenir():
    ilanlar = [satilik(f) for f in (10.0e6, 10.5e6, 9.8e6, 11.0e6, 10.2e6, 9.9e6)]
    ucuz = satilik(7.5e6)
    ilanlar.append(ucuz)
    skorlar = {id(s.ilan): s for s in skorla(ilanlar)}
    assert skorlar[id(ucuz)].firsat
    assert skorlar[id(ucuz)].iskonto > 0.2
    assert not any(s.firsat for k, s in skorlar.items() if k != id(ucuz))


def test_kirmizi_bayrak_firsati_engeller():
    ilanlar = [satilik(f) for f in (10.0e6, 10.5e6, 9.8e6, 11.0e6, 10.2e6)]
    hisseli = satilik(6e6, kirmizi_bayraklar=["hisseli"])
    ilanlar.append(hisseli)
    skor = next(s for s in skorla(ilanlar) if s.ilan is hisseli)
    assert skor.iskonto > 0.3 and not skor.firsat


def test_kucuk_grupta_genis_gruba_duser():
    # 3+1 tek başına; mahalle + tür grubuna düşmeli
    ilanlar = [satilik(f) for f in (10.0e6, 10.5e6, 9.8e6, 11.0e6)]
    tek = satilik(14e6, m2=140, oda="3+1")
    ilanlar.append(tek)
    skor = next(s for s in skorla(ilanlar) if s.ilan is tek)
    assert skor.grup == ("satilik", "-", "Bitez", "daire")


def test_gunluk_sezon_bandlari_karismaz():
    agustos = [Ilan("gunluk", "Gumbet", "daire", f, "gecelik", yatak_kapasitesi=4,
                    tarih=date(2027, 8, 10)) for f in (8000, 8400, 7800, 8200, 8100)]
    ocak = [Ilan("gunluk", "Gumbet", "daire", f, "gecelik", yatak_kapasitesi=4,
                 tarih=date(2027, 1, 10)) for f in (2000, 2100, 1900, 2050, 1950)]
    skorlar = skorla(agustos + ocak)
    # ocak fiyatları ağustosa göre ucuz görünmemeli
    assert not any(s.firsat for s in skorlar)


def test_firsat_listesi_sahip_esigi_ve_sira():
    ilanlar = [satilik(f) for f in (10.0e6, 10.5e6, 9.8e6, 11.0e6, 10.2e6, 9.9e6)]
    a = satilik(7.0e6)
    b = satilik(7.5e6, yayinda_gun=90)
    c = satilik(7.0e6)
    ilanlar += [a, b, c]
    olasilik = {id(i): 0.9 for i in ilanlar}
    olasilik[id(c)] = 0.3
    liste = [id(s.ilan) for s in firsat_listesi(skorla(ilanlar), olasilik)]
    assert id(c) not in liste
    assert id(a) in liste and id(b) in liste

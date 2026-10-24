import { deflateRawSync } from "node:zlib";

// Küçük bir ZIP yazıcı (eklenti paketini indirmek için); bağımlılık eklememek adına.
const TABLO = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = TABLO[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

export function zip(dosyalar: { ad: string; veri: Buffer }[]): Buffer {
  const parcalar: Buffer[] = [];
  const merkez: Buffer[] = [];
  let ofset = 0;
  for (const { ad, veri } of dosyalar) {
    const isim = Buffer.from(ad, "utf8");
    const sikisik = deflateRawSync(veri);
    const crc = crc32(veri);
    const yerel = Buffer.alloc(30);
    yerel.writeUInt32LE(0x04034b50, 0); yerel.writeUInt16LE(20, 4); yerel.writeUInt16LE(0x0800, 6);
    yerel.writeUInt16LE(8, 8); yerel.writeUInt32LE(0, 10); yerel.writeUInt32LE(crc, 14);
    yerel.writeUInt32LE(sikisik.length, 18); yerel.writeUInt32LE(veri.length, 22); yerel.writeUInt16LE(isim.length, 26);
    const m = Buffer.alloc(46);
    m.writeUInt32LE(0x02014b50, 0); m.writeUInt16LE(20, 4); m.writeUInt16LE(20, 6); m.writeUInt16LE(0x0800, 8);
    m.writeUInt16LE(8, 10); m.writeUInt32LE(0, 12); m.writeUInt32LE(crc, 16); m.writeUInt32LE(sikisik.length, 20);
    m.writeUInt32LE(veri.length, 24); m.writeUInt16LE(isim.length, 28); m.writeUInt32LE(ofset, 42);
    parcalar.push(yerel, isim, sikisik);
    merkez.push(m, isim);
    ofset += yerel.length + isim.length + sikisik.length;
  }
  const merkezBoyut = merkez.reduce((t, b) => t + b.length, 0);
  const son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50, 0); son.writeUInt16LE(dosyalar.length, 8); son.writeUInt16LE(dosyalar.length, 10);
  son.writeUInt32LE(merkezBoyut, 12); son.writeUInt32LE(ofset, 16);
  return Buffer.concat([...parcalar, ...merkez, son]);
}

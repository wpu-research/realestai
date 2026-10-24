// Bellekte basit kayan pencere sayacı (tek süreçli servis). Giriş denemeleri ve herkese açık formlar için.
const kovalar = new Map<string, { n: number; bas: number }>();

export function say(anahtar: string, ms: number): number {
  const simdi = Date.now();
  const k = kovalar.get(anahtar);
  if (!k || simdi - k.bas > ms) { kovalar.set(anahtar, { n: 1, bas: simdi }); return 1; }
  return ++k.n;
}
export function sayi(anahtar: string, ms: number): number {
  const k = kovalar.get(anahtar);
  return k && Date.now() - k.bas <= ms ? k.n : 0;
}
export const sifirla = (anahtar: string) => kovalar.delete(anahtar);

// Bellek şişmesin: süresi geçmiş kovalar saatte bir atılır.
setInterval(() => {
  const simdi = Date.now();
  for (const [a, k] of kovalar) if (simdi - k.bas > 3600_000) kovalar.delete(a);
}, 600_000).unref();

export const istemciIp = (h: (ad: string) => string | undefined) => h("x-forwarded-for")?.split(",")[0].trim() || "yerel";

// PDF dosyası gerçekten PDF mi (tarayıcının bildirdiği türe güvenilmez).
export const pdfMi = (veri: Buffer) => veri.subarray(0, 5).toString("latin1") === "%PDF-";

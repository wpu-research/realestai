import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export const sql = postgres(process.env.DATABASE_URL ?? "postgres://localhost:5432/realestai", {
  max: 10,
  idle_timeout: 30,
  // numeric kolonları sayı olarak al (fiyat, m², iskonto…); hassasiyet kaybı bu ölçeklerde önemsiz.
  types: { numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) } },
  onnotice: () => {},
});

// db/migrations/*.sql dosyalarını ad sırasıyla bir kez çalıştırır.
export async function migrate(dizin: string) {
  await sql`create table if not exists _migrations (ad text primary key, at timestamptz not null default now())`;
  const yapilan = new Set((await sql<{ ad: string }[]>`select ad from _migrations`).map((r) => r.ad));
  const dosyalar = (await readdir(dizin)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of dosyalar) {
    if (yapilan.has(f)) continue;
    const icerik = await readFile(join(dizin, f), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(icerik);
      await tx`insert into _migrations (ad) values (${f})`;
    });
    console.log(`migration: ${f}`);
  }
}

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';
import 'dotenv/config';

const databaseUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Configure DIRECT_DATABASE_URL ou DATABASE_URL antes de rodar migrations.');
}

const sql = postgres(databaseUrl, {
  max: 1,
  ssl: 'require',
  prepare: false,
});

try {
  const migrationsDir = join(process.cwd(), 'server', 'migrations');
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    const migration = await readFile(join(migrationsDir, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(migration);
    });
  }

  await sql.end();
  process.stdout.write('Migrations aplicadas com sucesso.\n');
} catch (error) {
  await sql.end();
  throw error;
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../migrations');

try {
  // Bootstrap the migration ledger before querying it. This is required for a
  // completely fresh database where schema_migrations does not yet exist.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version varchar(50) PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await fs.readdir(migrationsDir))
    .filter(name => /^\d+_.*\.sql$/.test(name))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    const exists = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE version = $1',
      [version]
    );
    if (exists.rowCount) {
      console.log(`Skip migration: ${version}`);
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    await pool.query(sql);
    // 001_init.sql records its own version inside the same transaction.
    // For future migrations, the script also remains safe because the ledger
    // insert is idempotent when a migration SQL file omits its own ledger row.
    await pool.query(
      'INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
      [version]
    );
    console.log(`Applied migration: ${version}`);
  }

  console.log('Migration completed.');
} catch (error) {
  console.error('Migration failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}

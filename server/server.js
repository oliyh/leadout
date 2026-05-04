import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createApp } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env if present (no dotenv dependency needed)
try {
    const env = readFileSync(join(__dirname, '.env'), 'utf8');
    for (const line of env.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] ??= m[2].trim();
    }
} catch {}

let store;
if (process.env.DB_URL) {
    const { PostgresStore } = await import('./src/store/postgres.js');
    store = await PostgresStore.create(process.env.DB_URL);
    console.log('Using PostgreSQL store');
} else {
    const { SqliteStore } = await import('./src/store/sqlite.js');
    store = new SqliteStore();
    console.log('Using SQLite store');
}

const app  = createApp(store);
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Leadout server on http://localhost:${port}`));

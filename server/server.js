import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createApp } from './app.js';
import { SqliteStore } from './src/store/sqlite.js';

// Load .env if present (no dotenv dependency needed)
try {
    const env = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '.env'), 'utf8');
    for (const line of env.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] ??= m[2].trim();
    }
} catch {}

const store = new SqliteStore();
const app   = createApp(store);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Leadout server on http://localhost:${port}`));

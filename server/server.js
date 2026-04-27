import { createApp } from './app.js';
import { SqliteStore } from './src/store/sqlite.js';

const store = new SqliteStore();
const app   = createApp(store);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Leadout server on http://localhost:${port}`));

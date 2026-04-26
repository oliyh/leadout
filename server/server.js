import { createApp } from './app.js';
import { DomainStore } from './src/store/domain.js';

const store = new DomainStore();
const app   = createApp(store);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Leadout server on http://localhost:${port}`));

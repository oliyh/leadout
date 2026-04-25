const express = require('express');
const path = require('path');
const { ProgrammeStore } = require('./src/storage/in-memory');

const app = express();
const store = new ProgrammeStore();

app.use(express.json());

// ── Public API (watch) ────────────────────────────────────────────────────────

app.get('/api/public/programme/latest', async (_req, res) => {
    const prog = await store.findToday();
    prog ? res.json(prog) : res.status(404).json({ error: 'No programme for today' });
});

// ── Private API (UI — auth goes here later) ───────────────────────────────────

const priv = express.Router();

priv.get('/programmes', async (_req, res) => {
    res.json(await store.list());
});

priv.post('/programmes', async (req, res) => {
    res.status(201).json(await store.create(req.body));
});

priv.get('/programmes/:id', async (req, res) => {
    const doc = await store.get(req.params.id);
    doc ? res.json(doc) : res.status(404).end();
});

priv.put('/programmes/:id', async (req, res) => {
    const doc = await store.put(req.params.id, req.body);
    doc ? res.json(doc) : res.status(404).end();
});

priv.delete('/programmes/:id', async (req, res) => {
    (await store.remove(req.params.id)) ? res.status(204).end() : res.status(404).end();
});

app.use('/api/private', priv);
app.use(express.static(path.join(__dirname, 'public')));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Leadout server on http://localhost:${port}`));

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── In-memory store ───────────────────────────────────────────────────────────

const programmes = new Map(); // id → programme

// ── Utilities ─────────────────────────────────────────────────────────────────

function uuid() { return crypto.randomUUID(); }
function today() { return new Date().toISOString().slice(0, 10); }

function json(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
}

function noContent(res) { res.writeHead(204); res.end(); }
function notFound(res) { res.writeHead(404); res.end('Not found'); }

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
        req.on('error', reject);
    });
}

const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };

function serveStatic(res, pathname) {
    const file = pathname === '/' ? path.join(PUBLIC, 'index.html') : path.join(PUBLIC, pathname);
    try {
        const content = fs.readFileSync(file);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
        res.end(content);
    } catch { notFound(res); }
}

// ── Domain helpers ────────────────────────────────────────────────────────────

function makeSegment(data, position) {
    return {
        id: uuid(),
        name: data.name || 'Segment',
        position,
        kind: data.kind || 'time',
        duration: Number(data.duration) || 60,
        target_pace: data.target_pace ? Number(data.target_pace) : null,
    };
}

function makeBlock(data, position) {
    const segments = (data.segments || []).map((s, i) => makeSegment(s, i));
    return { id: uuid(), name: data.name || 'Block', position, segments };
}

function deepClone(source, newDate) {
    return {
        id: uuid(),
        name: source.name,
        scheduled_date: newDate,
        pace_assumption: source.pace_assumption,
        published_at: new Date().toISOString(),
        blocks: source.blocks.map((b, bi) => ({
            id: uuid(),
            name: b.name,
            position: bi,
            segments: b.segments.map((s, si) => ({ ...s, id: uuid(), position: si })),
        })),
    };
}

// ── Watch endpoint ────────────────────────────────────────────────────────────

function latestProgramme(res) {
    const t = today();
    const prog = [...programmes.values()].find(p => p.scheduled_date === t);
    prog ? json(res, 200, prog) : json(res, 404, { error: 'No programme for today' });
}

// ── API handlers ──────────────────────────────────────────────────────────────

async function handleApi(req, res, method, parts) {
    // GET /api/programmes
    if (method === 'GET' && parts.length === 1 && parts[0] === 'programmes') {
        const list = [...programmes.values()].sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date));
        return json(res, 200, list);
    }

    // POST /api/programmes
    if (method === 'POST' && parts.length === 1 && parts[0] === 'programmes') {
        const body = await readBody(req);
        const prog = {
            id: uuid(),
            name: body.name || 'Untitled',
            scheduled_date: body.scheduled_date || today(),
            pace_assumption: Number(body.pace_assumption) || 330,
            published_at: new Date().toISOString(),
            blocks: [],
        };
        programmes.set(prog.id, prog);
        return json(res, 201, prog);
    }

    // GET /api/programmes/:id
    if (method === 'GET' && parts.length === 2 && parts[0] === 'programmes') {
        const prog = programmes.get(parts[1]);
        return prog ? json(res, 200, prog) : notFound(res);
    }

    // PUT /api/programmes/:id
    if (method === 'PUT' && parts.length === 2 && parts[0] === 'programmes') {
        const prog = programmes.get(parts[1]);
        if (!prog) return notFound(res);
        const body = await readBody(req);
        if (body.name !== undefined) prog.name = body.name;
        if (body.scheduled_date !== undefined) prog.scheduled_date = body.scheduled_date;
        if (body.pace_assumption !== undefined) prog.pace_assumption = Number(body.pace_assumption);
        return json(res, 200, prog);
    }

    // DELETE /api/programmes/:id
    if (method === 'DELETE' && parts.length === 2 && parts[0] === 'programmes') {
        if (!programmes.has(parts[1])) return notFound(res);
        programmes.delete(parts[1]);
        return noContent(res);
    }

    // POST /api/programmes/:id/clone
    if (method === 'POST' && parts.length === 3 && parts[0] === 'programmes' && parts[2] === 'clone') {
        const source = programmes.get(parts[1]);
        if (!source) return notFound(res);
        const body = await readBody(req);
        const clone = deepClone(source, body.scheduled_date || today());
        programmes.set(clone.id, clone);
        return json(res, 201, clone);
    }

    // POST /api/programmes/:id/blocks
    if (method === 'POST' && parts.length === 3 && parts[0] === 'programmes' && parts[2] === 'blocks') {
        const prog = programmes.get(parts[1]);
        if (!prog) return notFound(res);
        const body = await readBody(req);
        const block = makeBlock(body, prog.blocks.length);
        prog.blocks.push(block);
        return json(res, 201, block);
    }

    // PUT /api/programmes/:id/blocks/:blockId
    if (method === 'PUT' && parts.length === 4 && parts[0] === 'programmes' && parts[2] === 'blocks') {
        const prog = programmes.get(parts[1]);
        if (!prog) return notFound(res);
        const block = prog.blocks.find(b => b.id === parts[3]);
        if (!block) return notFound(res);
        const body = await readBody(req);
        if (body.name !== undefined) block.name = body.name;
        if (body.position !== undefined) {
            const pos = Math.max(0, Math.min(prog.blocks.length - 1, Number(body.position)));
            prog.blocks.splice(prog.blocks.indexOf(block), 1);
            prog.blocks.splice(pos, 0, block);
            prog.blocks.forEach((b, i) => b.position = i);
        }
        return json(res, 200, block);
    }

    // DELETE /api/programmes/:id/blocks/:blockId
    if (method === 'DELETE' && parts.length === 4 && parts[0] === 'programmes' && parts[2] === 'blocks') {
        const prog = programmes.get(parts[1]);
        if (!prog) return notFound(res);
        const idx = prog.blocks.findIndex(b => b.id === parts[3]);
        if (idx === -1) return notFound(res);
        prog.blocks.splice(idx, 1);
        prog.blocks.forEach((b, i) => b.position = i);
        return noContent(res);
    }

    // POST /api/programmes/:id/blocks/:blockId/segments
    if (method === 'POST' && parts.length === 5 && parts[0] === 'programmes' && parts[2] === 'blocks' && parts[4] === 'segments') {
        const prog = programmes.get(parts[1]);
        if (!prog) return notFound(res);
        const block = prog.blocks.find(b => b.id === parts[3]);
        if (!block) return notFound(res);
        const body = await readBody(req);
        const seg = makeSegment(body, block.segments.length);
        block.segments.push(seg);
        return json(res, 201, seg);
    }

    // PUT /api/programmes/:id/blocks/:blockId/segments/:segId
    if (method === 'PUT' && parts.length === 6 && parts[0] === 'programmes' && parts[2] === 'blocks' && parts[4] === 'segments') {
        const prog = programmes.get(parts[1]);
        if (!prog) return notFound(res);
        const block = prog.blocks.find(b => b.id === parts[3]);
        if (!block) return notFound(res);
        const seg = block.segments.find(s => s.id === parts[5]);
        if (!seg) return notFound(res);
        const body = await readBody(req);
        if (body.name !== undefined) seg.name = body.name;
        if (body.duration !== undefined) seg.duration = Number(body.duration);
        if (body.target_pace !== undefined) seg.target_pace = body.target_pace ? Number(body.target_pace) : null;
        if (body.position !== undefined) {
            const pos = Math.max(0, Math.min(block.segments.length - 1, Number(body.position)));
            block.segments.splice(block.segments.indexOf(seg), 1);
            block.segments.splice(pos, 0, seg);
            block.segments.forEach((s, i) => s.position = i);
        }
        return json(res, 200, seg);
    }

    // DELETE /api/programmes/:id/blocks/:blockId/segments/:segId
    if (method === 'DELETE' && parts.length === 6 && parts[0] === 'programmes' && parts[2] === 'blocks' && parts[4] === 'segments') {
        const prog = programmes.get(parts[1]);
        if (!prog) return notFound(res);
        const block = prog.blocks.find(b => b.id === parts[3]);
        if (!block) return notFound(res);
        const idx = block.segments.findIndex(s => s.id === parts[5]);
        if (idx === -1) return notFound(res);
        block.segments.splice(idx, 1);
        block.segments.forEach((s, i) => s.position = i);
        return noContent(res);
    }

    notFound(res);
}

// ── Router ────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
    const { method } = req;
    const pathname = req.url.split('?')[0];

    if (method === 'GET' && pathname === '/programme/latest') return latestProgramme(res);

    if (pathname.startsWith('/api/')) {
        const parts = pathname.slice(5).split('/').filter(Boolean);
        try { return await handleApi(req, res, method, parts); }
        catch (e) { return json(res, 400, { error: e.message }); }
    }

    if (method === 'GET') return serveStatic(res, pathname);

    notFound(res);
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Leadout server running on port ${port}`));

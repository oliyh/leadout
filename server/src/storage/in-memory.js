const crypto = require('crypto');

function uuid() { return crypto.randomUUID(); }
function today() { return new Date().toISOString().slice(0, 10); }

class ProgrammeStore {
    #docs = new Map();

    async list() {
        return [...this.#docs.values()]
            .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date));
    }

    async findToday() {
        const t = today();
        return [...this.#docs.values()].find(p => p.scheduled_date === t) ?? null;
    }

    async get(id) {
        return this.#docs.get(id) ?? null;
    }

    async create(data) {
        const doc = {
            ...data,
            id: uuid(),
            published_at: new Date().toISOString(),
            scheduled_date: data.scheduled_date || today(),
            blocks: data.blocks || [],
        };
        this.#docs.set(doc.id, doc);
        return doc;
    }

    async put(id, data) {
        if (!this.#docs.has(id)) return null;
        const doc = { ...data, id };
        this.#docs.set(id, doc);
        return doc;
    }

    async remove(id) {
        return this.#docs.delete(id);
    }
}

module.exports = { ProgrammeStore };

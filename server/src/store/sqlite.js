import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', '..', 'leadout.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    google_id TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    device_code TEXT UNIQUE NOT NULL,
    registered_at TEXT NOT NULL,
    last_synced_at TEXT
);

CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    instructor_oauth_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS programmes (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id),
    name TEXT NOT NULL,
    scheduled_date TEXT NOT NULL,
    pace_assumption TEXT NOT NULL DEFAULT '{}',
    blocks TEXT NOT NULL DEFAULT '[]',
    published_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    channel_id TEXT NOT NULL REFERENCES channels(id),
    UNIQUE(account_id, channel_id)
);

CREATE TABLE IF NOT EXISTS sync_records (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices(id),
    programme_id TEXT NOT NULL REFERENCES programmes(id),
    synced_at TEXT NOT NULL,
    programme_version TEXT NOT NULL,
    UNIQUE(device_id, programme_id)
);

CREATE TABLE IF NOT EXISTS participations (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices(id),
    programme_id TEXT NOT NULL REFERENCES programmes(id),
    started_at TEXT NOT NULL,
    UNIQUE(device_id, programme_id)
);
`;

function parseProg(row) {
    if (!row) return null;
    return {
        ...row,
        pace_assumption: JSON.parse(row.pace_assumption),
        blocks: JSON.parse(row.blocks),
    };
}

export class SqliteStore {
    constructor(dbPath = DB_PATH) {
        this._db = new Database(dbPath);
        this._db.pragma('journal_mode = WAL');
        this._db.pragma('foreign_keys = ON');
        this._db.exec(SCHEMA);
        // Migrations for columns added after initial schema
        try { this._db.exec('ALTER TABLE devices ADD COLUMN model_name TEXT'); } catch {}
        try { this._db.exec('ALTER TABLE devices ADD COLUMN app_version TEXT'); } catch {}
        try { this._db.exec('ALTER TABLE devices ADD COLUMN distance_units TEXT'); } catch {}
    }

    // ── Accounts ──────────────────────────────────────────────────────────────

    async findOrCreateAccount(google_id) {
        const existing = this._db.prepare('SELECT * FROM accounts WHERE google_id = ?').get(google_id);
        if (existing) return existing;
        const account = { id: randomUUID(), google_id, created_at: new Date().toISOString() };
        this._db.prepare('INSERT INTO accounts (id, google_id, created_at) VALUES (?, ?, ?)').run(account.id, account.google_id, account.created_at);
        return account;
    }

    async getAccount(id) {
        return this._db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) ?? null;
    }

    async getAllAccounts() {
        return this._db.prepare('SELECT * FROM accounts ORDER BY created_at').all();
    }

    // ── Devices ───────────────────────────────────────────────────────────────

    async findDeviceByCode(device_code) {
        return this._db.prepare('SELECT * FROM devices WHERE device_code = ?').get(device_code) ?? null;
    }

    async createDevice(data) {
        const device = { ...data, id: randomUUID() };
        this._db.prepare(
            'INSERT INTO devices (id, account_id, device_code, registered_at) VALUES (?, ?, ?, ?)'
        ).run(device.id, device.account_id, device.device_code, device.registered_at);
        return device;
    }

    async getDevice(id) {
        return this._db.prepare('SELECT * FROM devices WHERE id = ?').get(id) ?? null;
    }

    async deleteDevice(id) {
        return this._db.transaction(() => {
            this._db.prepare('DELETE FROM sync_records WHERE device_id = ?').run(id);
            this._db.prepare('DELETE FROM participations WHERE device_id = ?').run(id);
            return this._db.prepare('DELETE FROM devices WHERE id = ?').run(id).changes > 0;
        })();
    }

    async updateDevice(id, updates) {
        const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        this._db.prepare(`UPDATE devices SET ${sets} WHERE id = ?`).run(...Object.values(updates), id);
        return this._db.prepare('SELECT * FROM devices WHERE id = ?').get(id) ?? null;
    }

    async findDevicesByAccount(account_id) {
        return this._db.prepare('SELECT * FROM devices WHERE account_id = ?').all(account_id);
    }

    // ── Channels ──────────────────────────────────────────────────────────────

    async createChannel(data) {
        const channel = { ...data, id: randomUUID() };
        this._db.prepare(
            'INSERT INTO channels (id, instructor_oauth_id, name, created_at) VALUES (?, ?, ?, ?)'
        ).run(channel.id, channel.instructor_oauth_id, channel.name, channel.created_at);
        return channel;
    }

    async getChannel(id) {
        return this._db.prepare('SELECT * FROM channels WHERE id = ?').get(id) ?? null;
    }

    async getAllChannels() {
        return this._db.prepare('SELECT * FROM channels ORDER BY created_at').all();
    }

    async updateChannel(id, updates) {
        const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        this._db.prepare(`UPDATE channels SET ${sets} WHERE id = ?`).run(...Object.values(updates), id);
        return this._db.prepare('SELECT * FROM channels WHERE id = ?').get(id) ?? null;
    }

    async findChannelsByInstructor(instructor_oauth_id) {
        return this._db.prepare('SELECT * FROM channels WHERE instructor_oauth_id = ? ORDER BY created_at').all(instructor_oauth_id);
    }

    // ── Programmes ────────────────────────────────────────────────────────────

    async createProgramme(data) {
        const prog = { ...data, id: randomUUID() };
        this._db.prepare(
            'INSERT INTO programmes (id, channel_id, name, scheduled_date, pace_assumption, blocks, published_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(prog.id, prog.channel_id, prog.name, prog.scheduled_date, JSON.stringify(prog.pace_assumption ?? {}), JSON.stringify(prog.blocks ?? []), prog.published_at, prog.updated_at);
        return prog;
    }

    async getProgramme(id) {
        return parseProg(this._db.prepare('SELECT * FROM programmes WHERE id = ?').get(id));
    }

    async updateProgramme(id, updates) {
        const { pace_assumption, blocks, ...rest } = updates;
        const data = { ...rest };
        if (pace_assumption !== undefined) data.pace_assumption = JSON.stringify(pace_assumption);
        if (blocks !== undefined) data.blocks = JSON.stringify(blocks);
        const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
        this._db.prepare(`UPDATE programmes SET ${sets} WHERE id = ?`).run(...Object.values(data), id);
        return this.getProgramme(id);
    }

    async findProgrammesByChannel(channel_id) {
        return this._db.prepare('SELECT * FROM programmes WHERE channel_id = ? ORDER BY scheduled_date').all(channel_id).map(parseProg);
    }

    async deleteProgramme(id) {
        const result = this._db.prepare('DELETE FROM programmes WHERE id = ?').run(id);
        return result.changes > 0;
    }

    // ── Subscriptions ─────────────────────────────────────────────────────────

    async findSubscription(account_id, channel_id) {
        return this._db.prepare('SELECT * FROM subscriptions WHERE account_id = ? AND channel_id = ?').get(account_id, channel_id) ?? null;
    }

    async createSubscription(data) {
        const sub = { ...data, id: randomUUID() };
        this._db.prepare('INSERT INTO subscriptions (id, account_id, channel_id) VALUES (?, ?, ?)').run(sub.id, sub.account_id, sub.channel_id);
        return sub;
    }

    async findSubscriptionsByAccount(account_id) {
        return this._db.prepare('SELECT * FROM subscriptions WHERE account_id = ?').all(account_id);
    }

    async findSubscriptionsByChannel(channel_id) {
        return this._db.prepare('SELECT * FROM subscriptions WHERE channel_id = ?').all(channel_id);
    }

    async deleteSubscription(account_id, channel_id) {
        const result = this._db.prepare('DELETE FROM subscriptions WHERE account_id = ? AND channel_id = ?').run(account_id, channel_id);
        return result.changes > 0;
    }

    // ── Sync records ──────────────────────────────────────────────────────────

    async upsertSyncRecord({ device_id, programme_id, synced_at, programme_version }) {
        this._db.prepare(`
            INSERT INTO sync_records (id, device_id, programme_id, synced_at, programme_version)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(device_id, programme_id) DO UPDATE SET synced_at = excluded.synced_at, programme_version = excluded.programme_version
        `).run(randomUUID(), device_id, programme_id, synced_at, programme_version);
        return this._db.prepare('SELECT * FROM sync_records WHERE device_id = ? AND programme_id = ?').get(device_id, programme_id);
    }

    async findSyncRecordsByProgramme(programme_id) {
        return this._db.prepare('SELECT * FROM sync_records WHERE programme_id = ?').all(programme_id);
    }

    // ── Participations ────────────────────────────────────────────────────────

    async findParticipation(device_id, programme_id) {
        return this._db.prepare('SELECT * FROM participations WHERE device_id = ? AND programme_id = ?').get(device_id, programme_id) ?? null;
    }

    async createParticipation({ device_id, programme_id, started_at }) {
        const part = { id: randomUUID(), device_id, programme_id, started_at };
        this._db.prepare('INSERT OR IGNORE INTO participations (id, device_id, programme_id, started_at) VALUES (?, ?, ?, ?)').run(part.id, part.device_id, part.programme_id, part.started_at);
        return this._db.prepare('SELECT * FROM participations WHERE device_id = ? AND programme_id = ?').get(device_id, programme_id);
    }

    async findParticipationsByProgramme(programme_id) {
        return this._db.prepare('SELECT * FROM participations WHERE programme_id = ?').all(programme_id);
    }
}

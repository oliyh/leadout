import pg from 'pg';
import { randomUUID } from 'crypto';

const { Pool } = pg;

// Schema is identical to SQLite; new columns included from the start so no
// ADD COLUMN migration is needed on fresh databases.
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
    last_synced_at TEXT,
    model_name TEXT,
    app_version TEXT,
    distance_units TEXT
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

// Column whitelists for UPDATE statements. Prevents SQL injection if an
// unexpected object is passed to an update method.
const DEVICE_COLS    = new Set(['last_synced_at', 'model_name', 'app_version', 'distance_units']);
const CHANNEL_COLS   = new Set(['name']);
const PROGRAMME_COLS = new Set(['name', 'scheduled_date', 'pace_assumption', 'blocks', 'updated_at']);

function assertCols(updates, allowed) {
    for (const key of Object.keys(updates)) {
        if (!allowed.has(key)) throw new Error(`Column not in allowlist: ${key}`);
    }
}

// Builds "col = $N, ..." fragments for UPDATE SET clauses.
// Returns { sets, values } where N starts at startAt (default 1).
function setClause(updates, startAt = 1) {
    const keys = Object.keys(updates);
    return {
        sets:   keys.map((k, i) => `${k} = $${startAt + i}`).join(', '),
        values: Object.values(updates),
    };
}

export class PostgresStore {
    constructor(pool) {
        this._pool = pool;
    }

    static async create(connectionString) {
        const pool = new Pool({ connectionString });
        await pool.query(SCHEMA);
        // Idempotent migrations — add columns if this is an existing database
        await pool.query('ALTER TABLE devices ADD COLUMN IF NOT EXISTS model_name TEXT');
        await pool.query('ALTER TABLE devices ADD COLUMN IF NOT EXISTS app_version TEXT');
        await pool.query('ALTER TABLE devices ADD COLUMN IF NOT EXISTS distance_units TEXT');
        return new PostgresStore(pool);
    }

    // ── Accounts ──────────────────────────────────────────────────────────────

    async findOrCreateAccount(google_id) {
        const existing = (await this._pool.query(
            'SELECT * FROM accounts WHERE google_id = $1', [google_id]
        )).rows[0];
        if (existing) return existing;
        const account = { id: randomUUID(), google_id, created_at: new Date().toISOString() };
        await this._pool.query(
            'INSERT INTO accounts (id, google_id, created_at) VALUES ($1, $2, $3)',
            [account.id, account.google_id, account.created_at]
        );
        return account;
    }

    async getAccount(id) {
        return (await this._pool.query('SELECT * FROM accounts WHERE id = $1', [id])).rows[0] ?? null;
    }

    async getAllAccounts() {
        return (await this._pool.query('SELECT * FROM accounts ORDER BY created_at')).rows;
    }

    // ── Devices ───────────────────────────────────────────────────────────────

    async findDeviceByCode(device_code) {
        return (await this._pool.query(
            'SELECT * FROM devices WHERE device_code = $1', [device_code]
        )).rows[0] ?? null;
    }

    async createDevice(data) {
        const device = { ...data, id: randomUUID() };
        await this._pool.query(
            'INSERT INTO devices (id, account_id, device_code, registered_at) VALUES ($1, $2, $3, $4)',
            [device.id, device.account_id, device.device_code, device.registered_at]
        );
        return device;
    }

    async getDevice(id) {
        return (await this._pool.query('SELECT * FROM devices WHERE id = $1', [id])).rows[0] ?? null;
    }

    async deleteDevice(id) {
        const client = await this._pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM sync_records WHERE device_id = $1', [id]);
            await client.query('DELETE FROM participations WHERE device_id = $1', [id]);
            const res = await client.query('DELETE FROM devices WHERE id = $1', [id]);
            await client.query('COMMIT');
            return res.rowCount > 0;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    async updateDevice(id, updates) {
        assertCols(updates, DEVICE_COLS);
        const { sets, values } = setClause(updates);
        await this._pool.query(
            `UPDATE devices SET ${sets} WHERE id = $${values.length + 1}`,
            [...values, id]
        );
        return (await this._pool.query('SELECT * FROM devices WHERE id = $1', [id])).rows[0] ?? null;
    }

    async findDevicesByAccount(account_id) {
        return (await this._pool.query(
            'SELECT * FROM devices WHERE account_id = $1', [account_id]
        )).rows;
    }

    // ── Channels ──────────────────────────────────────────────────────────────

    async createChannel(data) {
        const channel = { ...data, id: randomUUID() };
        await this._pool.query(
            'INSERT INTO channels (id, instructor_oauth_id, name, created_at) VALUES ($1, $2, $3, $4)',
            [channel.id, channel.instructor_oauth_id, channel.name, channel.created_at]
        );
        return channel;
    }

    async getChannel(id) {
        return (await this._pool.query('SELECT * FROM channels WHERE id = $1', [id])).rows[0] ?? null;
    }

    async getAllChannels() {
        return (await this._pool.query('SELECT * FROM channels ORDER BY created_at')).rows;
    }

    async updateChannel(id, updates) {
        assertCols(updates, CHANNEL_COLS);
        const { sets, values } = setClause(updates);
        await this._pool.query(
            `UPDATE channels SET ${sets} WHERE id = $${values.length + 1}`,
            [...values, id]
        );
        return (await this._pool.query('SELECT * FROM channels WHERE id = $1', [id])).rows[0] ?? null;
    }

    async findChannelsByInstructor(instructor_oauth_id) {
        return (await this._pool.query(
            'SELECT * FROM channels WHERE instructor_oauth_id = $1 ORDER BY created_at',
            [instructor_oauth_id]
        )).rows;
    }

    // ── Programmes ────────────────────────────────────────────────────────────

    async createProgramme(data) {
        const prog = { ...data, id: randomUUID() };
        await this._pool.query(
            'INSERT INTO programmes (id, channel_id, name, scheduled_date, pace_assumption, blocks, published_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [prog.id, prog.channel_id, prog.name, prog.scheduled_date,
             JSON.stringify(prog.pace_assumption ?? {}), JSON.stringify(prog.blocks ?? []),
             prog.published_at, prog.updated_at]
        );
        return prog;
    }

    async getProgramme(id) {
        return parseProg(
            (await this._pool.query('SELECT * FROM programmes WHERE id = $1', [id])).rows[0] ?? null
        );
    }

    async updateProgramme(id, updates) {
        assertCols(updates, PROGRAMME_COLS);
        const { pace_assumption, blocks, ...rest } = updates;
        const data = { ...rest };
        if (pace_assumption !== undefined) data.pace_assumption = JSON.stringify(pace_assumption);
        if (blocks !== undefined) data.blocks = JSON.stringify(blocks);
        const { sets, values } = setClause(data);
        await this._pool.query(
            `UPDATE programmes SET ${sets} WHERE id = $${values.length + 1}`,
            [...values, id]
        );
        return this.getProgramme(id);
    }

    async findProgrammesByChannel(channel_id) {
        return (await this._pool.query(
            'SELECT * FROM programmes WHERE channel_id = $1 ORDER BY scheduled_date',
            [channel_id]
        )).rows.map(parseProg);
    }

    async deleteProgramme(id) {
        const res = await this._pool.query('DELETE FROM programmes WHERE id = $1', [id]);
        return res.rowCount > 0;
    }

    // ── Subscriptions ─────────────────────────────────────────────────────────

    async findSubscription(account_id, channel_id) {
        return (await this._pool.query(
            'SELECT * FROM subscriptions WHERE account_id = $1 AND channel_id = $2',
            [account_id, channel_id]
        )).rows[0] ?? null;
    }

    async createSubscription(data) {
        const sub = { ...data, id: randomUUID() };
        await this._pool.query(
            'INSERT INTO subscriptions (id, account_id, channel_id) VALUES ($1, $2, $3)',
            [sub.id, sub.account_id, sub.channel_id]
        );
        return sub;
    }

    async findSubscriptionsByAccount(account_id) {
        return (await this._pool.query(
            'SELECT * FROM subscriptions WHERE account_id = $1', [account_id]
        )).rows;
    }

    async findSubscriptionsByChannel(channel_id) {
        return (await this._pool.query(
            'SELECT * FROM subscriptions WHERE channel_id = $1', [channel_id]
        )).rows;
    }

    async deleteSubscription(account_id, channel_id) {
        const res = await this._pool.query(
            'DELETE FROM subscriptions WHERE account_id = $1 AND channel_id = $2',
            [account_id, channel_id]
        );
        return res.rowCount > 0;
    }

    // ── Sync records ──────────────────────────────────────────────────────────

    async upsertSyncRecord({ device_id, programme_id, synced_at, programme_version }) {
        await this._pool.query(`
            INSERT INTO sync_records (id, device_id, programme_id, synced_at, programme_version)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT(device_id, programme_id) DO UPDATE
            SET synced_at = excluded.synced_at, programme_version = excluded.programme_version
        `, [randomUUID(), device_id, programme_id, synced_at, programme_version]);
        return (await this._pool.query(
            'SELECT * FROM sync_records WHERE device_id = $1 AND programme_id = $2',
            [device_id, programme_id]
        )).rows[0];
    }

    async findSyncRecordsByProgramme(programme_id) {
        return (await this._pool.query(
            'SELECT * FROM sync_records WHERE programme_id = $1', [programme_id]
        )).rows;
    }

    // ── Participations ────────────────────────────────────────────────────────

    async findParticipation(device_id, programme_id) {
        return (await this._pool.query(
            'SELECT * FROM participations WHERE device_id = $1 AND programme_id = $2',
            [device_id, programme_id]
        )).rows[0] ?? null;
    }

    async createParticipation({ device_id, programme_id, started_at }) {
        const part = { id: randomUUID(), device_id, programme_id, started_at };
        await this._pool.query(
            `INSERT INTO participations (id, device_id, programme_id, started_at)
             VALUES ($1, $2, $3, $4) ON CONFLICT(device_id, programme_id) DO NOTHING`,
            [part.id, part.device_id, part.programme_id, part.started_at]
        );
        return (await this._pool.query(
            'SELECT * FROM participations WHERE device_id = $1 AND programme_id = $2',
            [device_id, programme_id]
        )).rows[0];
    }

    async findParticipationsByProgramme(programme_id) {
        return (await this._pool.query(
            'SELECT * FROM participations WHERE programme_id = $1', [programme_id]
        )).rows;
    }

    async reset() {
        await this._pool.query(
            'TRUNCATE accounts, devices, channels, programmes, subscriptions, sync_records, participations CASCADE'
        );
    }
}

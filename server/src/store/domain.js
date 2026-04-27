import { randomUUID } from 'crypto';

export class DomainStore {
    constructor() {
        this._accounts       = new Map();
        this._devices        = new Map();
        this._channels       = new Map();
        this._programmes     = new Map();
        this._subscriptions  = new Map();
        this._syncRecords    = new Map();
        this._participations = new Map();
    }

    // ── Accounts ──────────────────────────────────────────────────────────────

    async findOrCreateAccount(google_id) {
        for (const acc of this._accounts.values()) {
            if (acc.google_id === google_id) return acc;
        }
        const account = { id: randomUUID(), google_id, created_at: new Date().toISOString() };
        this._accounts.set(account.id, account);
        return account;
    }

    async getAccount(id) { return this._accounts.get(id) ?? null; }

    // ── Devices ───────────────────────────────────────────────────────────────

    async findDeviceByCode(device_code) {
        for (const d of this._devices.values()) {
            if (d.device_code === device_code) return d;
        }
        return null;
    }

    async createDevice(data) {
        const device = { ...data, id: randomUUID() };
        this._devices.set(device.id, device);
        return device;
    }

    async updateDevice(id, updates) {
        const device = this._devices.get(id);
        if (!device) return null;
        const updated = { ...device, ...updates };
        this._devices.set(id, updated);
        return updated;
    }

    async getDevice(id) { return this._devices.get(id) ?? null; }

    async deleteDevice(id) { return this._devices.delete(id); }

    async findDevicesByAccount(account_id) {
        return [...this._devices.values()].filter(d => d.account_id === account_id);
    }

    // ── Channels ──────────────────────────────────────────────────────────────

    async createChannel(data) {
        const channel = { ...data, id: randomUUID() };
        this._channels.set(channel.id, channel);
        return channel;
    }

    async getChannel(id) { return this._channels.get(id) ?? null; }

    async updateChannel(id, updates) {
        const channel = this._channels.get(id);
        if (!channel) return null;
        const updated = { ...channel, ...updates };
        this._channels.set(id, updated);
        return updated;
    }

    async findChannelsByInstructor(instructor_oauth_id) {
        return [...this._channels.values()].filter(c => c.instructor_oauth_id === instructor_oauth_id);
    }

    // ── Programmes ────────────────────────────────────────────────────────────

    async createProgramme(data) {
        const prog = { ...data, id: randomUUID() };
        this._programmes.set(prog.id, prog);
        return prog;
    }

    async getProgramme(id) { return this._programmes.get(id) ?? null; }

    async updateProgramme(id, updates) {
        const prog = this._programmes.get(id);
        if (!prog) return null;
        const updated = { ...prog, ...updates };
        this._programmes.set(id, updated);
        return updated;
    }

    async findProgrammesByChannel(channel_id) {
        return [...this._programmes.values()].filter(p => p.channel_id === channel_id);
    }

    async findProgrammeForDate(date) {
        return [...this._programmes.values()].find(p => p.scheduled_date === date) ?? null;
    }

    async deleteProgramme(id) {
        return this._programmes.delete(id);
    }

    // ── Subscriptions ─────────────────────────────────────────────────────────

    async findSubscription(account_id, channel_id) {
        for (const sub of this._subscriptions.values()) {
            if (sub.account_id === account_id && sub.channel_id === channel_id) return sub;
        }
        return null;
    }

    async createSubscription(data) {
        const sub = { ...data, id: randomUUID() };
        this._subscriptions.set(sub.id, sub);
        return sub;
    }

    async findSubscriptionsByAccount(account_id) {
        return [...this._subscriptions.values()].filter(s => s.account_id === account_id);
    }

    async findSubscriptionsByChannel(channel_id) {
        return [...this._subscriptions.values()].filter(s => s.channel_id === channel_id);
    }

    async deleteSubscription(account_id, channel_id) {
        for (const [key, sub] of this._subscriptions.entries()) {
            if (sub.account_id === account_id && sub.channel_id === channel_id) {
                this._subscriptions.delete(key);
                return true;
            }
        }
        return false;
    }

    // ── Sync records ──────────────────────────────────────────────────────────

    async upsertSyncRecord({ device_id, programme_id, synced_at, programme_version }) {
        for (const [key, rec] of this._syncRecords.entries()) {
            if (rec.device_id === device_id && rec.programme_id === programme_id) {
                const updated = { ...rec, synced_at, programme_version };
                this._syncRecords.set(key, updated);
                return updated;
            }
        }
        const rec = { id: randomUUID(), device_id, programme_id, synced_at, programme_version };
        this._syncRecords.set(rec.id, rec);
        return rec;
    }

    async findSyncRecord(device_id, programme_id) {
        for (const rec of this._syncRecords.values()) {
            if (rec.device_id === device_id && rec.programme_id === programme_id) return rec;
        }
        return null;
    }

    async findSyncRecordsByProgramme(programme_id) {
        return [...this._syncRecords.values()].filter(r => r.programme_id === programme_id);
    }

    // ── Participations ────────────────────────────────────────────────────────

    async createParticipation({ device_id, programme_id, started_at }) {
        for (const p of this._participations.values()) {
            if (p.device_id === device_id && p.programme_id === programme_id) return p;
        }
        const part = { id: randomUUID(), device_id, programme_id, started_at };
        this._participations.set(part.id, part);
        return part;
    }

    async findParticipationsByProgramme(programme_id) {
        return [...this._participations.values()].filter(p => p.programme_id === programme_id);
    }
}

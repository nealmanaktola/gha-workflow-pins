'use strict';

// A fake storage area with the same promise contract as browser.storage.*.
// `failWrites` models a disabled or full sync area.
class FakeStorageArea {
  constructor({ failWrites = false, failReads = false } = {}) {
    this.data = new Map();
    this.failWrites = failWrites;
    this.failReads = failReads;
  }

  async get(query) {
    if (this.failReads) throw new Error('storage area unavailable');
    if (query === null || query === undefined) return Object.fromEntries(this.data);
    const keys = Array.isArray(query) ? query : [query];
    const out = {};
    for (const key of keys) if (this.data.has(key)) out[key] = this.data.get(key);
    return out;
  }

  async set(items) {
    if (this.failWrites) throw new Error('QUOTA_BYTES quota exceeded');
    for (const [key, value] of Object.entries(items)) this.data.set(key, value);
  }

  async remove(query) {
    if (this.failWrites) throw new Error('storage area unavailable');
    for (const key of Array.isArray(query) ? query : [query]) this.data.delete(key);
  }
}

class FakeApi {
  constructor({ sync = new FakeStorageArea(), local = new FakeStorageArea() } = {}) {
    this.storage = { sync, local };
  }
}

module.exports = { FakeStorageArea, FakeApi };

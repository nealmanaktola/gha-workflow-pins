'use strict';

// Pin storage. `api` is injected so tests can pass a fake instead of a real browser.
function createStore(api) {
  const PIN_PREFIX = 'pins:';
  const SETTINGS_KEY = '__settings';
  const COLLAPSED_KEY = '__collapsed';
  const NAME_PREFIX = 'names:';
  const DEFAULT_SETTINGS = { area: 'sync' };

  const keyFor = (slug) => PIN_PREFIX + slug;

  // Settings always live in `local`. They choose where the pins go, so they
  // cannot live in the area they choose.
  async function getSettings() {
    const got = await api.storage.local.get(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(got[SETTINGS_KEY] || {}) };
  }

  async function setSettings(patch) {
    const next = { ...(await getSettings()), ...patch };
    await api.storage.local.set({ [SETTINGS_KEY]: next });
    return next;
  }

  // Which sidebar groups the user rolled up. This is a view preference for
  // one browser, so it stays local and never travels with the pins.
  async function getCollapsed() {
    const got = await api.storage.local.get(COLLAPSED_KEY);
    const value = got[COLLAPSED_KEY];
    return value && typeof value === 'object' ? value : {};
  }

  async function setCollapsed(key, collapsed) {
    const next = { ...(await getCollapsed()), [key]: Boolean(collapsed) };
    await api.storage.local.set({ [COLLAPSED_KEY]: next });
    return next;
  }

  // Display names for workflows we have already seen, so the favorites group
  // can be drawn from cache before the workflow list arrives over the network.
  // This is a cache, so it stays local and is never exported.
  async function getNames(slug) {
    const key = NAME_PREFIX + slug;
    const got = await api.storage.local.get(key);
    const value = got[key];
    return value && typeof value === 'object' ? value : {};
  }

  async function rememberNames(slug, names) {
    const next = { ...(await getNames(slug)), ...names };
    await api.storage.local.set({ [NAME_PREFIX + slug]: next });
    return next;
  }

  async function forgetNames(slug, ids) {
    const next = await getNames(slug);
    for (const id of ids) delete next[id];
    await api.storage.local.set({ [NAME_PREFIX + slug]: next });
    return next;
  }

  async function preferredArea() {
    const { area } = await getSettings();
    return area === 'sync' && api.storage.sync ? api.storage.sync : api.storage.local;
  }

  async function eachArea() {
    const primary = await preferredArea();
    return primary === api.storage.local ? [api.storage.local] : [primary, api.storage.local];
  }

  // Read the preferred area first, then local. A pin written during a sync
  // outage stays reachable instead of disappearing.
  async function readKey(key) {
    const primary = await preferredArea();
    try {
      const got = await primary.get(key);
      if (got[key] !== undefined) return got[key];
    } catch {
      /* unreadable area: fall through to local */
    }
    if (primary === api.storage.local) return undefined;
    const got = await api.storage.local.get(key);
    return got[key];
  }

  // Never let a full or disabled sync area lose a pin. Fall back to local.
  async function writeKey(key, value) {
    const apply = async (area) => {
      if (value === undefined) await area.remove(key);
      else await area.set({ [key]: value });
    };
    const primary = await preferredArea();
    try {
      await apply(primary);
      return primary === api.storage.sync ? 'sync' : 'local';
    } catch {
      await apply(api.storage.local);
      return 'local';
    }
  }

  async function getPins(slug) {
    const value = await readKey(keyFor(slug));
    return Array.isArray(value) ? value : [];
  }

  async function setPins(slug, ids) {
    const unique = [...new Set(ids)];
    await writeKey(keyFor(slug), unique.length ? unique : undefined);
    return unique;
  }

  async function togglePin(slug, id) {
    const pins = await getPins(slug);
    const next = pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id];
    return setPins(slug, next);
  }

  // Union across areas. The preferred area wins a conflict.
  async function allPins() {
    const out = {};
    const areas = await eachArea();
    for (const area of [...areas].reverse()) {
      let everything = {};
      try {
        everything = await area.get(null);
      } catch {
        continue;
      }
      for (const [key, value] of Object.entries(everything)) {
        if (!key.startsWith(PIN_PREFIX) || !Array.isArray(value) || !value.length) continue;
        out[key.slice(PIN_PREFIX.length)] = value;
      }
    }
    return out;
  }

  async function exportAll() {
    return { version: 1, settings: await getSettings(), pins: await allPins() };
  }

  // Import merges by default. It never drops a pin the file does not mention.
  async function importAll(payload, { replace = false } = {}) {
    if (!payload || typeof payload !== 'object' || !payload.pins || typeof payload.pins !== 'object') {
      throw new Error('Not a pins export: missing a "pins" object.');
    }
    if (replace) await clearAll();
    let count = 0;
    for (const [slug, ids] of Object.entries(payload.pins)) {
      if (!Array.isArray(ids)) continue;
      const merged = replace ? ids : [...new Set([...(await getPins(slug)), ...ids])];
      await setPins(slug, merged);
      count += 1;
    }
    return count;
  }

  async function clearAll() {
    const cleared = new Set();
    for (const area of await eachArea()) {
      let everything = {};
      try {
        everything = await area.get(null);
      } catch {
        continue;
      }
      const keys = Object.keys(everything).filter((k) => k.startsWith(PIN_PREFIX));
      if (!keys.length) continue;
      try {
        await area.remove(keys);
        for (const key of keys) cleared.add(key);
      } catch {
        /* leave what this area refuses to drop */
      }
    }
    return cleared.size;
  }

  // Move existing pins when the user switches sync on or off, so the switch
  // never looks like data loss.
  async function switchArea(name) {
    const before = await allPins();
    await clearAll();
    await setSettings({ area: name });
    for (const [slug, ids] of Object.entries(before)) await setPins(slug, ids);
    return Object.keys(before).length;
  }

  async function activeAreaName() {
    const primary = await preferredArea();
    if (primary === api.storage.local) return 'local';
    try {
      await primary.get(SETTINGS_KEY);
      return 'sync';
    } catch {
      return 'local';
    }
  }

  return {
    getPins, setPins, togglePin, allPins,
    exportAll, importAll, clearAll,
    getSettings, setSettings, switchArea, activeAreaName,
    getCollapsed, setCollapsed,
    getNames, rememberNames, forgetNames,
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createStore };
if (typeof globalThis !== 'undefined' && globalThis.GhaApi) {
  globalThis.GhaStore = createStore(globalThis.GhaApi);
}

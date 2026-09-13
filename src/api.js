// Cross-browser namespace. Firefox exposes `browser`, Chrome exposes `chrome`.
// Both give promise-based storage under Manifest V3.
globalThis.GhaApi = globalThis.browser ?? globalThis.chrome;

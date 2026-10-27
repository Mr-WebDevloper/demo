const VISITOR_KEY = "aa_visitor_id";
const SESSION_KEY = "aa_session_id";
const SESSION_TS_KEY = "aa_session_ts";
const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function storageGet(store, key) {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(store, key, value) {
  try {
    store.setItem(key, value);
  } catch {
    // private mode / quota — identity still lives in memory via caller
  }
}

export function createIdentity(options = {}) {
  const timeoutMs = options.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS;
  let memoryVisitor = null;
  let memorySession = null;

  function visitorId() {
    const existing = storageGet(localStorage, VISITOR_KEY) || memoryVisitor;
    if (existing) {
      memoryVisitor = existing;
      return existing;
    }
    const id = uuid();
    memoryVisitor = id;
    storageSet(localStorage, VISITOR_KEY, id);
    return id;
  }

  function sessionId() {
    const now = Date.now();
    const existing = storageGet(sessionStorage, SESSION_KEY) || memorySession;
    const lastTs = Number(storageGet(sessionStorage, SESSION_TS_KEY) || "0");
    const expired = !existing || (lastTs && now - lastTs > timeoutMs);
    if (expired) {
      const id = uuid();
      memorySession = id;
      storageSet(sessionStorage, SESSION_KEY, id);
      storageSet(sessionStorage, SESSION_TS_KEY, String(now));
      return id;
    }
    memorySession = existing;
    storageSet(sessionStorage, SESSION_TS_KEY, String(now));
    return existing;
  }

  return { visitorId, sessionId, uuid };
}

export { uuid };

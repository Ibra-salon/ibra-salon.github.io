// Хранилище журнала в самом телефоне (IndexedDB). Сервера и аккаунтов нет.
// Понимает ту часть синтаксиса PostgREST, которой пользуется store.js:
// select с вложениями, фильтры eq/gte/lte/ilike, order, limit, insert/update/upsert/delete.
import { PRICE_LIST } from './catalog.js';

const DB_NAME = 'ibra-journal';
const KEY = 'tables';
const TABLES = ['services', 'clients', 'visits', 'visit_items', 'shifts', 'settings'];
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
const now = () => new Date().toISOString();
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

let T = Object.fromEntries(TABLES.map((t) => [t, []]));

// связи для вложенных select: таблица → { имя связанной таблицы: [источник, локальный столбец | null, внешний столбец] }
const REL = {
  visits: { clients: ['clients', 'client_id', 'id'], visit_items: ['visit_items', null, 'visit_id'] },
  visit_items: { visits: ['visits', 'visit_id', 'id'], services: ['services', 'service_id', 'id'] },
  clients: { visits: ['visits', null, 'client_id'] },
};
const PK = { settings: 'key' };

// ---------- сохранение ----------
let backend = 'memory';
let idb = null;

function openIdb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function idbReq(mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = idb.transaction('kv', mode);
    const req = fn(tx.objectStore('kv'));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
async function loadRaw() {
  try {
    idb = await openIdb(); backend = 'indexeddb';
    return await idbReq('readonly', (s) => s.get(KEY));
  } catch {
    try { backend = 'localstorage'; return localStorage.getItem(DB_NAME); } catch { backend = 'memory'; return null; }
  }
}
let queue = Promise.resolve();
function persist() {
  const json = JSON.stringify(T);
  queue = queue.then(async () => {
    if (backend === 'indexeddb') await idbReq('readwrite', (s) => s.put(json, KEY));
    else if (backend === 'localstorage') localStorage.setItem(DB_NAME, json);
  });
  return queue;
}

let ready = null;
/** Загрузить журнал из памяти телефона; при первом запуске залить прайс. */
export function initDb() {
  ready ||= (async () => {
    const raw = await loadRaw();
    if (raw) {
      const data = JSON.parse(raw);
      T = Object.fromEntries(TABLES.map((t) => [t, Array.isArray(data[t]) ? data[t] : []]));
    }
    if (!T.services.length) T.services = PRICE_LIST.map((s) => ({ id: uuid(), active: true, created_at: now(), ...s }));
    const set = (k, v) => { if (!T.settings.some((r) => r.key === k)) T.settings.push({ key: k, value: v }); };
    set('master_percent', '40');
    set('first_use', today());
    await persist();
    // попросить браузер не стирать данные при нехватке места (где поддерживается)
    try { await navigator.storage?.persist?.(); } catch { /* не критично */ }
    return backend;
  })();
  return ready;
}
export const storageBackend = () => backend;
export async function storagePersisted() { try { return !!(await navigator.storage?.persisted?.()); } catch { return false; } }

/** Заменить весь журнал (восстановление из файла). */
export async function replaceAll(tables) {
  T = Object.fromEntries(TABLES.map((t) => [t, Array.isArray(tables[t]) ? tables[t] : []]));
  await persist();
}
export function counts() { return Object.fromEntries(TABLES.map((t) => [t, T[t].length])); }

// ---------- выборки ----------
function parseSelect(sel) {
  const out = []; let i = 0;
  while (i < sel.length) {
    let j = i, depth = 0;
    while (j < sel.length && (sel[j] !== ',' || depth)) { if (sel[j] === '(') depth++; if (sel[j] === ')') depth--; j++; }
    const part = sel.slice(i, j); i = j + 1;
    const m = part.match(/^(?:([^:]+):)?([a-z_]+)\((.*)\)$/);
    if (m) out.push({ alias: m[1] || m[2], table: m[2], sub: m[3] }); else out.push({ col: part });
  }
  return out;
}
function project(table, row, sel) {
  const res = {};
  for (const p of parseSelect(sel || '*')) {
    if (p.col) { if (p.col === '*') Object.assign(res, row); else res[p.col] = row[p.col]; continue; }
    const rel = REL[table]?.[p.table];
    if (!rel) continue;
    const [src, local, foreign] = rel;
    if (local) { const r = T[src].find((x) => x[foreign] === row[local]); res[p.alias] = r ? project(src, r, p.sub) : null; }
    else res[p.alias] = T[src].filter((x) => x[foreign] === row.id).map((x) => project(src, x, p.sub));
  }
  return JSON.parse(JSON.stringify(res));   // копия: правки на экране не трогают хранилище
}
function filterRows(table, params) {
  let rows = T[table].slice();
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
    const dot = v.indexOf('.');
    const op = v.slice(0, dot), val = v.slice(dot + 1);
    rows = rows.filter((r) => {
      const x = r[k];
      if (op === 'eq') return String(x) === val;
      if (op === 'gte') return x != null && String(x) >= val;
      if (op === 'lte') return x != null && String(x) <= val;
      if (op === 'ilike') return String(x ?? '').trim().toLowerCase() === val.replace(/\\(.)/g, '$1').trim().toLowerCase();
      return true;
    });
  }
  const order = params.get('order');
  if (order) {
    const keys = order.split(',').map((o) => o.split('.'));
    rows.sort((a, b) => {
      for (const [c, dir] of keys) {
        const av = a[c], bv = b[c];
        const d = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''), 'ru');
        if (d) return dir === 'desc' ? -d : d;
      }
      return 0;
    });
  }
  const limit = params.get('limit');
  return limit ? rows.slice(0, Number(limit)) : rows;
}
const clone = (x) => JSON.parse(JSON.stringify(x));
function conflict(msg) { const e = new Error(msg); e.status = 409; return e; }

export const db = {
  async select(table, query = 'select=*') {
    await initDb();
    const p = new URLSearchParams(query);
    return filterRows(table, p).map((r) => project(table, r, p.get('select')));
  },
  async insert(table, rows) {
    await initDb();
    const out = [];
    for (const r of [].concat(rows)) {
      if (table === 'clients' && T.clients.some((c) => c.name.trim().toLowerCase() === String(r.name).trim().toLowerCase())) throw conflict('Клиент с таким именем уже есть');
      const defaults = table === 'visits' ? { total: 0, tips: 0, is_new: false, status: 'план', updated_at: now() } : {};
      const row = { id: uuid(), created_at: now(), ...defaults, ...r };
      T[table].push(row); out.push(clone(row));
    }
    await persist();
    return out;
  },
  async update(table, filter, patch) {
    await initDb();
    const rows = filterRows(table, new URLSearchParams(filter));
    if (table === 'clients' && patch.name) {
      const n = patch.name.trim().toLowerCase();
      if (T.clients.some((c) => c.name.trim().toLowerCase() === n && !rows.includes(c))) throw conflict('Клиент с таким именем уже есть');
    }
    for (const r of rows) Object.assign(r, patch, table === 'visits' ? { updated_at: now() } : {});
    await persist();
    return clone(rows);
  },
  async upsert(table, rows, onConflict) {
    await initDb();
    const pk = onConflict || PK[table] || 'id';
    const out = [];
    for (const r of [].concat(rows)) {
      const ex = T[table].find((x) => x[pk] === r[pk]);
      if (ex) { Object.assign(ex, r); out.push(clone(ex)); } else { const row = table === 'settings' ? { ...r } : { id: uuid(), ...r }; T[table].push(row); out.push(clone(row)); }
    }
    await persist();
    return out;
  },
  async remove(table, filter) {
    await initDb();
    const rows = filterRows(table, new URLSearchParams(filter));
    const gone = new Set(rows);
    T[table] = T[table].filter((r) => !gone.has(r));
    const ids = new Set(rows.map((r) => r.id));
    if (table === 'visits') T.visit_items = T.visit_items.filter((i) => !ids.has(i.visit_id));
    if (table === 'clients') for (const v of T.visits) if (ids.has(v.client_id)) v.client_id = null;
    if (table === 'services') for (const i of T.visit_items) if (ids.has(i.service_id)) i.service_id = null;
    await persist();
    return clone(rows);
  },
};

// для отладки в консоли браузера
window.__ibra = { db, counts, backend: () => backend };

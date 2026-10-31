// Весь доступ к данным. Единственное место, где известно про таблицы и PostgREST.
import { db } from './db.js';
import { STATUS } from './catalog.js';

const q = (s) => encodeURIComponent(s);

// ---------- кэш справочников ----------
let servicesCache = null;
let settingsCache = null;

export async function services({ fresh = false } = {}) {
  if (!servicesCache || fresh) servicesCache = await db.select('services', 'select=*&order=sort.asc,name.asc');
  return servicesCache;
}
export async function saveService(s) {
  const { id, ...rest } = s;
  const [row] = id ? await db.update('services', `id=eq.${id}`, rest) : await db.insert('services', rest);
  servicesCache = null;
  return row;
}
export async function settings({ fresh = false } = {}) {
  if (!settingsCache || fresh) {
    const rows = await db.select('settings', 'select=*');
    settingsCache = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
  return settingsCache;
}
export async function setSetting(key, value) {
  await db.upsert('settings', [{ key, value: String(value) }], 'key');
  settingsCache = null;
}
export async function masterPercent() { return Number((await settings()).master_percent ?? 40); }

// ---------- клиенты ----------
export async function clients() {
  return db.select('clients', 'select=*&order=name.asc');
}
export async function findClientByName(name) {
  const n = name.trim();
  if (!n) return null;
  const rows = await db.select('clients', `select=*&name=ilike.${q(n.replace(/[%_\\]/g, '\\$&'))}&limit=1`);
  return rows[0] || null;
}
export async function createClient({ name, note = null, source = null }) {
  const [row] = await db.insert('clients', [{ name: name.trim(), note, source }]);
  return row;
}
export async function updateClient(id, patch) {
  const [row] = await db.update('clients', `id=eq.${id}`, patch);
  return row;
}
export async function deleteClient(id) { await db.remove('clients', `id=eq.${id}`); }
/** Сводка по клиентам: число визитов, последний визит, сумма */
export async function clientsWithStats() {
  const [cs, vs] = await Promise.all([
    clients(),
    db.select('visits', `select=client_id,date,total,status&status=eq.${q(STATUS.DONE)}`),
  ]);
  const agg = {};
  for (const v of vs) {
    if (!v.client_id) continue;
    const a = (agg[v.client_id] ||= { visits: 0, total: 0, last: null, first: null });
    a.visits++; a.total += v.total || 0;
    if (!a.last || v.date > a.last) a.last = v.date;
    if (!a.first || v.date < a.first) a.first = v.date;
  }
  return cs.map((c) => ({ ...c, ...(agg[c.id] || { visits: 0, total: 0, last: null, first: null }) }));
}

// ---------- визиты ----------
const VISIT_SELECT = 'select=*,client:clients(id,name,note),items:visit_items(id,service_id,name,price)';

export async function visitsByRange(from, to) {
  return db.select('visits', `${VISIT_SELECT}&date=gte.${from}&date=lte.${to}&order=date.asc,start_time.asc`);
}
export async function visitsByClient(clientId) {
  return db.select('visits', `${VISIT_SELECT}&client_id=eq.${clientId}&order=date.desc,start_time.desc`);
}
export async function allVisits() {
  return db.select('visits', `${VISIT_SELECT}&order=date.asc,start_time.asc`);
}
export async function visit(id) {
  const rows = await db.select('visits', `${VISIT_SELECT}&id=eq.${id}`);
  return rows[0] || null;
}
/** Было ли у клиента выполненное посещение раньше этой даты */
export async function hasPriorVisit(clientId, beforeDate, excludeId = null) {
  let query = `select=id&client_id=eq.${clientId}&status=eq.${q(STATUS.DONE)}&date=lte.${beforeDate}&limit=2`;
  const rows = await db.select('visits', query);
  return rows.some((r) => r.id !== excludeId);
}

/**
 * Создать или обновить визит.
 * data: { id?, date, start_time, end_time, client_name, client_id?, status, is_new, source, tips, note,
 *         items: [{service_id, name, price}] }
 */
export async function saveVisit(data) {
  const { id, items = [], client_name, ...fields } = data;
  // клиент: найти по имени или создать
  let clientId = fields.client_id || null;
  if (!clientId && client_name && client_name.trim()) {
    const found = await findClientByName(client_name);
    clientId = found ? found.id : (await createClient({ name: client_name, source: fields.source || null })).id;
  }
  const row = {
    date: fields.date, start_time: fields.start_time, end_time: fields.end_time || null,
    client_id: clientId, status: fields.status, is_new: !!fields.is_new, source: fields.source || null,
    total: items.reduce((s, i) => s + (Number(i.price) || 0), 0),
    tips: Number(fields.tips) || 0, note: fields.note || null,
  };
  let saved;
  if (id) {
    [saved] = await db.update('visits', `id=eq.${id}`, row);
    await db.remove('visit_items', `visit_id=eq.${id}`);
  } else {
    [saved] = await db.insert('visits', [row]);
  }
  if (items.length) {
    await db.insert('visit_items', items.map((i) => ({
      visit_id: saved.id, service_id: i.service_id || null, name: i.name, price: Number(i.price) || 0,
    })));
  }
  return visit(saved.id);
}
export async function setVisitStatus(id, status) {
  const [row] = await db.update('visits', `id=eq.${id}`, { status });
  return row;
}
export async function deleteVisit(id) { await db.remove('visits', `id=eq.${id}`); }

// ---------- смены ----------
export async function shiftsByRange(from, to) {
  return db.select('shifts', `select=*&date=gte.${from}&date=lte.${to}&order=date.asc,start_time.asc`);
}
export async function allShifts() { return db.select('shifts', 'select=*&order=date.asc,start_time.asc'); }
export async function saveShift(s) {
  const { id, ...rest } = s;
  const [row] = id ? await db.update('shifts', `id=eq.${id}`, rest) : await db.insert('shifts', [rest]);
  return row;
}
export async function deleteShift(id) { await db.remove('shifts', `id=eq.${id}`); }

/** Всё для экспорта */
export async function dump() {
  const [sv, cl, vi, it, sh, st] = await Promise.all([
    db.select('services', 'select=*&order=sort.asc'),
    db.select('clients', 'select=*&order=name.asc'),
    db.select('visits', 'select=*,client:clients(name)&order=date.asc,start_time.asc'),
    db.select('visit_items', 'select=*,visit:visits(date,start_time,client:clients(name)),service:services(category)'),
    db.select('shifts', 'select=*&order=date.asc,start_time.asc'),
    db.select('settings', 'select=*'),
  ]);
  return { services: sv, clients: cl, visits: vi, items: it, shifts: sh, settings: st };
}

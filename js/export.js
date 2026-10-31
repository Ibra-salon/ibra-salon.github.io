// Копия журнала в Excel и восстановление из неё. Всё работает без интернета:
// библиотека SheetJS лежит в js/vendor.
import * as store from './store.js';
import { replaceAll } from './db.js';
import { hhmm, isoDate } from './util.js';
import { STATUS } from './catalog.js';

let loading;
function loadSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  loading ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = new URL('./vendor/xlsx.full.min.js', import.meta.url).href;
    s.onload = () => res(window.XLSX);
    s.onerror = () => { loading = null; rej(new Error('Не загрузилась библиотека Excel')); };
    document.head.append(s);
  });
  return loading;
}

const yesno = (b) => (b ? 'да' : 'нет');
const toMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/** Собрать книгу Excel со всеми листами. */
export async function buildWorkbook() {
  const [XLSX, d] = await Promise.all([loadSheetJS(), store.dump()]);
  const itemsByVisit = {};
  for (const it of d.items) (itemsByVisit[it.visit_id] ||= []).push(it);

  const visits = d.visits.map((v) => ({
    'Дата': v.date, 'Начало': hhmm(v.start_time), 'Конец': hhmm(v.end_time), 'Клиент': v.client?.name || '',
    'Статус': v.status, 'Новый': yesno(v.is_new), 'Откуда': v.source || '',
    'Услуги': (itemsByVisit[v.id] || []).map((i) => i.name).join(' + '),
    'Сумма': v.total, 'Чаевые': v.tips, 'Заметка': v.note || '', id: v.id, client_id: v.client_id || '',
  }));
  const items = d.items.map((i) => ({
    'Дата': i.visit?.date || '', 'Клиент': i.visit?.client?.name || '', 'Услуга': i.name, 'Цена': i.price,
    'Категория': i.service?.category || '', visit_id: i.visit_id, service_id: i.service_id || '',
  })).sort((a, b) => a['Дата'].localeCompare(b['Дата']));
  const agg = {};
  for (const v of d.visits) if (v.client_id && v.status === STATUS.DONE) {
    const a = (agg[v.client_id] ||= { n: 0, sum: 0, first: null, last: null });
    a.n++; a.sum += v.total;
    if (!a.first || v.date < a.first) a.first = v.date;
    if (!a.last || v.date > a.last) a.last = v.date;
  }
  const clients = d.clients.map((c) => ({
    'Имя': c.name, 'Заметка': c.note || '', 'Откуда': c.source || '', 'Визитов': agg[c.id]?.n || 0,
    'Первый визит': agg[c.id]?.first || '', 'Последний визит': agg[c.id]?.last || '', 'Сумма за всё время': agg[c.id]?.sum || 0, id: c.id,
  }));
  const shifts = d.shifts.map((s) => ({
    'Дата': s.date, 'Начало': hhmm(s.start_time), 'Конец': hhmm(s.end_time),
    'Часов': s.end_time ? Math.round((toMinutes(s.end_time) - toMinutes(s.start_time)) / 6) / 10 : '', 'Заметка': s.note || '', id: s.id,
  }));
  const services = d.services.map((s) => ({
    'Категория': s.category, 'Услуга': s.name, 'Цена от': s.price_min, 'Цена до': s.price_max ?? '', 'Минут': s.duration_min,
    'Активна': yesno(s.active), id: s.id,
  }));
  const settings = d.settings.filter((s) => s.key !== 'last_backup').map((s) => ({ 'Ключ': s.key, 'Значение': s.value }));

  const wb = XLSX.utils.book_new();
  const sheets = [['Визиты', visits], ['Позиции', items], ['Клиенты', clients], ['Смены', shifts], ['Услуги', services], ['Настройки', settings]];
  for (const [name, rows] of sheets) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const keys = rows[0] ? Object.keys(rows[0]) : [];
    ws['!cols'] = keys.map((k) => ({ wch: Math.min(48, Math.max(k.length, ...rows.slice(0, 300).map((r) => String(r[k] ?? '').length)) + 2) }));
    if (keys.length) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: keys.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return { XLSX, wb, stats: { visits: visits.length, clients: clients.length } };
}

/**
 * Сохранить копию. На телефоне открывает меню «Поделиться» (Telegram, Файлы, почта),
 * иначе просто скачивает файл.
 */
export async function saveBackup() {
  const { XLSX, wb, stats } = await buildWorkbook();
  const filename = `ibra_${isoDate()}.xlsx`;
  const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const file = new File([bytes], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  let how = 'download';
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Журнал Ibra-salon' });
      how = 'share';
    } catch (e) {
      if (e.name === 'AbortError') return { ...stats, how: 'cancelled' };
      XLSX.writeFile(wb, filename);
    }
  } else {
    XLSX.writeFile(wb, filename);
  }
  await store.setSetting('last_backup', isoDate());
  return { ...stats, how, filename };
}

// ---------- восстановление ----------
function normDate(v) {
  if (v instanceof Date) return isoDate(v);
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 864e5)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; }
  const s = String(v || '').trim();
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s.slice(0, 10);
}
function normTime(v) {
  if (v === '' || v == null) return null;
  if (v instanceof Date) return `${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}`;
  if (typeof v === 'number') { const min = Math.round((v % 1) * 1440); return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; }
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}
const num = (v) => (v === '' || v == null ? 0 : Number(String(v).replace(/[^\d.-]/g, '')) || 0);
const str = (v) => (v === '' || v == null ? null : String(v).trim() || null);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

/** Прочитать файл копии и вернуть таблицы журнала (без записи). */
export async function parseBackup(file) {
  const XLSX = await loadSheetJS();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheet = (name) => (wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' }) : null);
  const V = sheet('Визиты'), I = sheet('Позиции'), C = sheet('Клиенты'), S = sheet('Смены'), U = sheet('Услуги'), N = sheet('Настройки');
  if (!V || !U) throw new Error('Это не копия журнала: нет листов «Визиты» и «Услуги».');

  const services = U.filter((r) => str(r['Услуга'])).map((r, i) => ({
    id: str(r.id) || uid(), category: str(r['Категория']) || 'Другое', name: str(r['Услуга']),
    price_min: num(r['Цена от']), price_max: r['Цена до'] === '' ? null : num(r['Цена до']),
    duration_min: num(r['Минут']) || 60, active: String(r['Активна']).trim().toLowerCase() !== 'нет', sort: (i + 1) * 10,
  }));
  const clients = (C || []).filter((r) => str(r['Имя'])).map((r) => ({
    id: str(r.id) || uid(), name: str(r['Имя']), note: str(r['Заметка']), source: str(r['Откуда']), created_at: new Date().toISOString(),
  }));
  const clientIds = new Set(clients.map((c) => c.id));
  const byName = Object.fromEntries(clients.map((c) => [c.name.toLowerCase(), c.id]));
  const statuses = Object.values(STATUS);
  const visits = V.filter((r) => r['Дата'] !== '').map((r) => {
    let client_id = str(r.client_id);
    if (!client_id || !clientIds.has(client_id)) client_id = byName[String(r['Клиент'] || '').trim().toLowerCase()] || null;
    const status = String(r['Статус'] || '').trim();
    return {
      id: str(r.id) || uid(), date: normDate(r['Дата']), start_time: normTime(r['Начало']) || '12:00', end_time: normTime(r['Конец']),
      client_id, status: statuses.includes(status) ? status : STATUS.DONE, is_new: String(r['Новый']).trim().toLowerCase() === 'да',
      source: str(r['Откуда']), total: num(r['Сумма']), tips: num(r['Чаевые']), note: str(r['Заметка']),
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
  });
  const visitIds = new Set(visits.map((v) => v.id));
  const serviceIds = new Set(services.map((s) => s.id));
  const svcByName = Object.fromEntries(services.map((s) => [s.name.toLowerCase(), s.id]));
  const visit_items = (I || []).filter((r) => visitIds.has(String(r.visit_id))).map((r) => ({
    id: uid(), visit_id: String(r.visit_id),
    service_id: serviceIds.has(String(r.service_id)) ? String(r.service_id) : (svcByName[String(r['Услуга']).trim().toLowerCase()] || null),
    name: str(r['Услуга']) || 'Услуга', price: num(r['Цена']),
  }));
  // визиты без позиций (старый файл без листа «Позиции»): сумма остаётся как была
  const shifts = (S || []).filter((r) => r['Дата'] !== '').map((r) => ({
    id: str(r.id) || uid(), date: normDate(r['Дата']), start_time: normTime(r['Начало']) || '10:00', end_time: normTime(r['Конец']), note: str(r['Заметка']),
  }));
  const settings = (N || []).filter((r) => str(r['Ключ'])).map((r) => ({ key: String(r['Ключ']).trim(), value: String(r['Значение']) }));
  if (!settings.some((s) => s.key === 'master_percent')) settings.push({ key: 'master_percent', value: '40' });
  settings.push({ key: 'last_backup', value: isoDate() });
  return { services, clients, visits, visit_items, shifts, settings };
}

/** Заменить журнал данными из файла копии. */
export async function restoreBackup(tables) {
  await replaceAll(tables);
  await store.services({ fresh: true });
  await store.settings({ fresh: true });
}

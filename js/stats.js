// Расчёт метрик. Чистые функции: на вход визиты (с items), смены, процент мастера.
import { STATUS } from './catalog.js';
import { toMin, weekday } from './util.js';

const minutes = (a, b) => (a && b ? Math.max(0, toMin(b) - toMin(a)) : 0);

/**
 * @param visits визиты периода (любых статусов)
 * @param shifts смены периода
 * @param percent процент мастера
 * @param priorClientIds Set id клиентов, у которых были выполненные визиты ДО периода (для «вернувшихся»)
 */
export function summarize(visits, shifts, percent, priorClientIds = new Set()) {
  const done = visits.filter((v) => v.status === STATUS.DONE);
  const planned = visits.filter((v) => v.status === STATUS.PLAN);
  const noshow = visits.filter((v) => v.status === STATUS.NOSHOW);
  const revenue = done.reduce((s, v) => s + (v.total || 0), 0);
  const tips = done.reduce((s, v) => s + (v.tips || 0), 0);
  const income = Math.round(revenue * percent / 100) + tips;
  const avgCheck = done.length ? revenue / done.length : 0;

  const newCount = done.filter((v) => v.is_new).length;
  const repeatCount = done.length - newCount;
  // уникальные клиенты периода
  const clientIds = new Set(done.map((v) => v.client_id).filter(Boolean));
  const returned = [...clientIds].filter((id) => priorClientIds.has(id)).length;
  const retention = priorClientIds.size ? returned / priorClientIds.size : null;

  // загрузка: занятые минуты (по фактическим концу/началу, иначе 0) против минут смен
  const busyMin = done.reduce((s, v) => s + minutes(v.start_time, v.end_time), 0);
  const shiftMin = shifts.reduce((s, sh) => s + minutes(sh.start_time, sh.end_time), 0);
  const utilization = shiftMin ? Math.min(1, busyMin / shiftMin) : null;
  const shiftDays = new Set(shifts.map((s) => s.date)).size;
  const revenuePerHour = shiftMin ? revenue / (shiftMin / 60) : null;

  // топ услуг
  const byService = {};
  for (const v of done) for (const it of v.items || []) {
    const k = it.name; const a = (byService[k] ||= { name: k, count: 0, revenue: 0 });
    a.count++; a.revenue += it.price || 0;
  }
  const topServices = Object.values(byService).sort((a, b) => b.revenue - a.revenue);

  // источники
  const bySource = {};
  for (const v of done) { const k = v.source || 'не указано'; const a = (bySource[k] ||= { name: k, count: 0, revenue: 0 }); a.count++; a.revenue += v.total || 0; }
  const sources = Object.values(bySource).sort((a, b) => b.count - a.count);

  // по дням недели
  const wd = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((k) => ({ key: k, count: 0, revenue: 0 }));
  for (const v of done) { const i = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].indexOf(weekday(v.date)); wd[i].count++; wd[i].revenue += v.total || 0; }

  // по часам начала
  const byHour = {};
  for (const v of done) { const h = Number(v.start_time.slice(0, 2)); byHour[h] = (byHour[h] || 0) + 1; }

  return {
    visits: done.length, planned: planned.length, noshow: noshow.length,
    revenue, tips, income, avgCheck, percent,
    newCount, repeatCount, uniqueClients: clientIds.size, returned, retention,
    busyMin, shiftMin, utilization, shiftDays, revenuePerHour,
    topServices, sources, weekdays: wd, byHour,
  };
}

/** Ряд по дням/неделям для столбиков: [{key, label, revenue, count}] */
export function series(visits, from, to, granularity = 'day') {
  const done = visits.filter((v) => v.status === STATUS.DONE);
  const buckets = new Map();
  const keyOf = (d) => (granularity === 'day' ? d : granularity === 'week' ? d.slice(0, 10) : d.slice(0, 7));
  for (const v of done) {
    const k = keyOf(v.date);
    const b = buckets.get(k) || { key: k, revenue: 0, count: 0 };
    b.revenue += v.total || 0; b.count++; buckets.set(k, b);
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

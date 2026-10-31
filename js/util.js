// Даты, время, деньги, мелкие помощники DOM. Без зависимостей.
import { WEEKDAYS, MONTHS_GEN, MONTHS_NOM } from './catalog.js';

const pad = (n) => String(n).padStart(2, '0');

/** Локальная дата → 'ГГГГ-ММ-ДД' */
export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseDate(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(iso, n) { const d = parseDate(iso); d.setDate(d.getDate() + n); return isoDate(d); }
export function weekStart(iso) { const d = parseDate(iso); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return isoDate(d); }
export function monthStart(iso) { return iso.slice(0, 8) + '01'; }
export function monthEnd(iso) { const d = parseDate(iso); return isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
export function addMonths(iso, n) { const d = parseDate(iso); d.setDate(1); d.setMonth(d.getMonth() + n); return isoDate(d); }
export function weekday(iso) { return WEEKDAYS[(parseDate(iso).getDay() + 6) % 7]; }
export function isWeekend(iso) { const wd = parseDate(iso).getDay(); return wd === 0 || wd === 6; }

/** '2026-11-01' → '1 ноября', с годом если не текущий */
export function fmtDate(iso, { withWeekday = false, withYear = 'auto' } = {}) {
  const d = parseDate(iso);
  let s = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  if (withYear === true || (withYear === 'auto' && d.getFullYear() !== new Date().getFullYear())) s += ` ${d.getFullYear()}`;
  if (withWeekday) s = `${weekday(iso)}, ${s}`;
  return s;
}
export function fmtMonth(iso) { const d = parseDate(iso); return `${MONTHS_NOM[d.getMonth()]} ${d.getFullYear()}`; }
export function fmtRange(from, to) {
  const a = parseDate(from), b = parseDate(to);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`;
  return `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`;
}
export function relDay(iso) {
  const today = isoDate();
  if (iso === today) return 'Сегодня';
  if (iso === addDays(today, 1)) return 'Завтра';
  if (iso === addDays(today, -1)) return 'Вчера';
  return fmtDate(iso, { withWeekday: true });
}

/** 'ЧЧ:ММ[:СС]' → минуты от полуночи */
export function toMin(t) { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
export function fromMin(min) { min = ((min % 1440) + 1440) % 1440; return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; }
export function hhmm(t) { return t ? t.slice(0, 5) : ''; }
/** Текущее время, округлённое вниз до 5 минут */
export function nowRounded(step = 5) { const d = new Date(); return fromMin(Math.floor((d.getHours() * 60 + d.getMinutes()) / step) * step); }
export function fmtDuration(min) {
  if (!min && min !== 0) return '';
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}
export function fmtHours(h) { return (Math.round(h * 10) / 10).toLocaleString('ru-RU') + ' ч'; }

/** 12500 → '12 500 ₸' */
export function money(n, { sign = true } = {}) {
  const v = Math.round(Number(n) || 0);
  const s = Math.abs(v).toLocaleString('ru-RU').replace(/ /g, ' ');
  return (v < 0 ? '−' : '') + s + (sign ? ' ₸' : '');
}
export function pct(x) { return Number.isFinite(x) ? Math.round(x * 100) + '%' : '—'; }
export function priceRange(s) {
  return s.price_max && s.price_max !== s.price_min ? `${money(s.price_min, { sign: false })}–${money(s.price_max)}` : money(s.price_min);
}
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** Создание элемента: el('div', {class:'x', onclick}, children) */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'html') node.innerHTML = v;
    else if (k in node && k !== 'list' && k !== 'form') { try { node[k] = v; } catch { node.setAttribute(k, v); } }
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

let toastTimer;
export function toast(msg, kind = 'info') {
  let t = document.getElementById('toast');
  if (!t) { t = el('div', { id: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = msg; t.dataset.kind = kind; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), kind === 'error' ? 5000 : 2200);
}
export function ls(key, val) {
  try {
    if (val === undefined) { const v = localStorage.getItem(key); return v == null ? null : JSON.parse(v); }
    localStorage.setItem(key, JSON.stringify(val));
  } catch { return null; }
}

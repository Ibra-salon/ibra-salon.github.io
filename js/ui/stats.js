// Статистика за период: плитки, топ услуг, источники, дни недели.
import { el, isoDate, addDays, weekStart, monthStart, monthEnd, addMonths, fmtRange, fmtMonth, money, pct, fmtHours, plural, ls } from '../util.js';
import { STATUS } from '../catalog.js';
import * as store from '../store.js';
import { summarize } from '../stats.js';
import { refresh } from '../app.js';

const PERIODS = [['week', 'Неделя'], ['month', 'Месяц'], ['quarter', '3 месяца'], ['all', 'Всё']];

export async function renderStats(root, { setSub }) {
  const today = isoDate();
  const st = ls('st') || { period: 'month', offset: 0 };
  let from, to, label;
  if (st.period === 'week') { from = addDays(weekStart(today), 7 * st.offset); to = addDays(from, 6); label = fmtRange(from, to); }
  else if (st.period === 'month') { from = addMonths(monthStart(today), st.offset); to = monthEnd(from); label = fmtMonth(from); }
  else if (st.period === 'quarter') { to = addDays(today, 0); from = addDays(addMonths(monthStart(today), -2), 0); label = fmtRange(from, to); }
  else { from = '2000-01-01'; to = '2100-01-01'; label = 'За всё время'; }

  const [visits, shifts, percent, earlier] = await Promise.all([
    store.visitsByRange(from, to), store.shiftsByRange(from, to), store.masterPercent(),
    st.period === 'all' ? [] : store.visitsByRange('2000-01-01', addDays(from, -1)),
  ]);
  const prior = new Set(earlier.filter((v) => v.status === STATUS.DONE && v.client_id).map((v) => v.client_id));
  const s = summarize(visits, shifts, percent, prior);
  setSub(label);

  const save = (patch) => { ls('st', { ...st, ...patch }); refresh(); };
  const seg = el('div', { class: 'seg' }, ...PERIODS.map(([k, l]) => el('button', { 'aria-pressed': String(st.period === k), onclick: () => save({ period: k, offset: 0 }) }, l)));
  const nav = (st.period === 'week' || st.period === 'month') ? el('div', { class: 'nav' },
    el('button', { class: 'btn icon', 'aria-label': 'Назад', onclick: () => save({ offset: st.offset - 1 }) }, '‹'),
    el('button', { class: 'btn ghost', onclick: () => save({ offset: 0 }) }, el('b', {}, label)),
    el('button', { class: 'btn icon', 'aria-label': 'Вперёд', disabled: st.offset >= 0, onclick: () => save({ offset: st.offset + 1 }) }, '›')) : el('div', { class: 'nav' }, el('b', {}, label));

  if (!s.visits) {
    root.append(seg, nav, el('div', { class: 'empty' }, el('strong', {}, 'За этот период выполненных визитов нет'), 'Статистика считается только по визитам со статусом «Выполнено».'));
    return;
  }

  const tiles = el('div', { class: 'tiles' },
    el('div', { class: 'tile accent' }, el('div', { class: 'label' }, 'Мой доход'), el('div', { class: 'value' }, money(s.income)), el('div', { class: 'hint' }, `${s.percent}% + чаевые ${money(s.tips)}`)),
    el('div', { class: 'tile' }, el('div', { class: 'label' }, 'Выручка салону'), el('div', { class: 'value' }, money(s.revenue)), el('div', { class: 'hint' }, `${s.visits} ${plural(s.visits, 'визит', 'визита', 'визитов')}`)),
    el('div', { class: 'tile' }, el('div', { class: 'label' }, 'Средний чек'), el('div', { class: 'value' }, money(s.avgCheck)), el('div', { class: 'hint' }, s.revenuePerHour != null ? `${money(s.revenuePerHour)} в час смены` : 'отмечай смены, чтобы видеть ₸/час')),
    el('div', { class: 'tile' }, el('div', { class: 'label' }, 'Загрузка смен'), el('div', { class: 'value' }, pct(s.utilization)), el('div', { class: 'hint' }, s.shiftMin ? `${fmtHours(s.busyMin / 60)} из ${fmtHours(s.shiftMin / 60)}, ${s.shiftDays} ${plural(s.shiftDays, 'смена', 'смены', 'смен')}` : 'смены не отмечены')),
  );

  // новые / повторные
  const nr = s.newCount + s.repeatCount;
  const split = el('div', { class: 'card stack' },
    el('div', { class: 'row between' }, el('h3', {}, 'Новые и повторные'), el('span', { class: 'sub' }, `${s.uniqueClients} ${plural(s.uniqueClients, 'клиент', 'клиента', 'клиентов')}`)),
    el('div', { class: 'split' }, el('span', { style: `width:${nr ? s.newCount / nr * 100 : 0}%;background:var(--series-2)` }), el('span', { style: `width:${nr ? s.repeatCount / nr * 100 : 0}%;background:var(--series-1)` })),
    el('div', { class: 'legend' },
      el('span', {}, el('i', { style: 'background:var(--series-2)' }), `новые ${s.newCount} (${pct(nr ? s.newCount / nr : NaN)})`),
      el('span', {}, el('i', { style: 'background:var(--series-1)' }), `повторные ${s.repeatCount} (${pct(nr ? s.repeatCount / nr : NaN)})`)),
    s.retention != null ? el('p', { class: 'sub' }, `Вернулись ${s.returned} из ${prior.size} клиентов прошлых периодов: ${pct(s.retention)}`) : null,
    s.noshow ? el('p', { class: 'sub' }, `Не пришли: ${s.noshow}`) : null,
  );

  const hbars = (rows, valueOf, labelOf, cls = '') => {
    const max = Math.max(...rows.map(valueOf), 1);
    return el('div', { class: 'chart' }, ...rows.map((r) => el('div', { class: 'hbar' },
      el('span', { class: 'lab', title: r.name }, r.name),
      el('div', { class: 'track' }, el('div', { class: 'fill ' + cls, style: `width:${valueOf(r) / max * 100}%` })),
      el('span', { class: 'val' }, labelOf(r)))));
  };
  const topSvc = el('div', { class: 'card stack' }, el('h3', {}, 'Услуги по выручке'),
    hbars(s.topServices.slice(0, 8), (r) => r.revenue, (r) => el('span', {}, money(r.revenue), el('small', {}, ` ×${r.count}`))));
  const src = el('div', { class: 'card stack' }, el('h3', {}, 'Откуда клиенты'),
    hbars(s.sources, (r) => r.count, (r) => el('span', {}, String(r.count), el('small', {}, ` · ${money(r.revenue)}`))),
    el('p', { class: 'sub' }, 'Доля «свой» и «рекомендация» показывает, растёт ли личная база.'));

  const maxWd = Math.max(...s.weekdays.map((d) => d.revenue), 1);
  const wd = el('div', { class: 'card stack' }, el('h3', {}, 'Выручка по дням недели'),
    el('div', { class: 'cols' }, ...s.weekdays.map((d) => el('div', { class: 'col' },
      d.revenue ? el('span', { class: 'v' }, money(d.revenue / 1000, { sign: false }) + 'к') : null,
      el('div', { class: 'bar' + (d.revenue ? '' : ' dim'), style: `height:${Math.max(2, d.revenue / maxWd * 80)}px` }),
      el('span', { class: 'k' }, d.key)))));

  // часы пик
  const hours = Object.entries(s.byHour).sort((a, b) => a[0] - b[0]);
  const maxH = Math.max(...hours.map((h) => h[1]), 1);
  const hh = hours.length > 1 ? el('div', { class: 'card stack' }, el('h3', {}, 'Во сколько приходят'),
    el('div', { class: 'cols' }, ...hours.map(([h, n]) => el('div', { class: 'col' }, el('span', { class: 'v' }, String(n)), el('div', { class: 'bar', style: `height:${Math.max(2, n / maxH * 80)}px` }), el('span', { class: 'k' }, h + 'ч'))))) : null;

  root.append(seg, nav, tiles, split, topSvc, src, wd, hh);
}

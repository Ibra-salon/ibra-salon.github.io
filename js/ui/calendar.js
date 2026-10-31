// Неделя: смены и визиты по дням, записи наперёд.
import { el, isoDate, addDays, weekStart, fmtRange, fmtDate, weekday, hhmm, toMin, fmtHours, money, ls } from '../util.js';
import { STATUS } from '../catalog.js';
import * as store from '../store.js';
import { openVisitForm } from './visit-form.js';
import { openShiftForm } from './shift-form.js';
import { visitItem } from './today.js';
import { refresh } from '../app.js';

export async function renderCalendar(root, { setSub }) {
  const today = isoDate();
  let start = ls('cal.week') || weekStart(today);
  if (addDays(start, 6) < addDays(today, -60) || start > addDays(today, 90)) start = weekStart(today);
  const end = addDays(start, 6);
  const [visits, shifts] = await Promise.all([store.visitsByRange(start, end), store.shiftsByRange(start, end)]);
  setSub('');

  const go = (n) => { ls('cal.week', n === 0 ? weekStart(today) : addDays(start, 7 * n)); refresh(); };
  const nav = el('div', { class: 'nav' },
    el('button', { class: 'btn icon', 'aria-label': 'Предыдущая неделя', onclick: () => go(-1) }, '‹'),
    el('button', { class: 'btn ghost', onclick: () => go(0) }, el('b', {}, fmtRange(start, end))),
    el('button', { class: 'btn icon', 'aria-label': 'Следующая неделя', onclick: () => go(1) }, '›'));

  const doneWeek = visits.filter((v) => v.status === STATUS.DONE);
  const hoursShift = shifts.reduce((s, sh) => s + (sh.end_time ? (toMin(sh.end_time) - toMin(sh.start_time)) / 60 : 0), 0);
  const summary = el('div', { class: 'tiles three' },
    el('div', { class: 'tile' }, el('div', { class: 'label' }, 'Визитов'), el('div', { class: 'value sm' }, String(doneWeek.length))),
    el('div', { class: 'tile' }, el('div', { class: 'label' }, 'Выручка'), el('div', { class: 'value sm' }, money(doneWeek.reduce((s, v) => s + v.total, 0)))),
    el('div', { class: 'tile' }, el('div', { class: 'label' }, 'Смены'), el('div', { class: 'value sm' }, fmtHours(hoursShift))));

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const dv = visits.filter((v) => v.date === d);
    const ds = shifts.filter((s) => s.date === d);
    const shiftLbl = ds.length
      ? el('button', { class: 'shift btn ghost sm', style: 'padding:0', onclick: () => openShiftForm({ shift: ds[0], onSaved: refresh }) },
          ds.map((s) => `${hhmm(s.start_time)}–${s.end_time ? hhmm(s.end_time) : '…'}`).join(', '))
      : el('button', { class: 'shift off btn ghost sm', style: 'padding:0', onclick: () => openShiftForm({ date: d, onSaved: refresh }) }, d < today ? 'без смены' : '+ смена');
    const head = el('div', { class: 'day-head' }, el('div', {}, el('b', {}, `${weekday(d)}, ${fmtDate(d)}`), d === today ? el('span', { class: 'pill neutral', style: 'margin-left:8px' }, 'сегодня') : null), shiftLbl);
    const body = el('div', { class: 'day-body' }, ...dv.map((v) => visitItem(v)),
      el('button', { class: 'add', onclick: () => openVisitForm({ date: d, onSaved: refresh }) }, d < today ? '+ визит задним числом' : '+ записать'));
    days.push(el('div', { class: 'day' + (d === today ? ' today' : '') }, head, body));
  }
  root.append(nav, summary, el('div', { class: 'list' }, ...days));
}

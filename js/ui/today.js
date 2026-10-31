// Главный экран: смена, визиты дня, итог дня.
import { el, isoDate, addDays, relDay, hhmm, money, toMin, fmtHours, nowRounded, plural, toast } from '../util.js';
import { STATUS } from '../catalog.js';
import * as store from '../store.js';
import { openVisitForm, openVisit, pillClass } from './visit-form.js';
import { openShiftForm } from './shift-form.js';
import { refresh } from '../app.js';
import { homeBanners } from './backup.js';

export async function renderToday(root, { setSub }) {
  const today = isoDate();
  const [visits, shifts, percent, upcoming, banners] = await Promise.all([
    store.visitsByRange(today, today), store.shiftsByRange(today, today), store.masterPercent(),
    store.visitsByRange(addDays(today, 1), addDays(today, 7)).then((vs) => vs.filter((v) => v.status === STATUS.PLAN)),
    homeBanners(),
  ]);
  setSub(relDay(today) === 'Сегодня' ? new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }) : '');

  const done = visits.filter((v) => v.status === STATUS.DONE);
  const revenue = done.reduce((s, v) => s + v.total, 0);
  const tips = done.reduce((s, v) => s + v.tips, 0);
  const income = Math.round(revenue * percent / 100) + tips;

  // смена
  const shift = shifts[0];
  let shiftCard;
  if (!shift) {
    shiftCard = el('div', { class: 'card row between' }, el('div', {}, el('b', {}, 'Смена не начата'), el('div', { class: 'sub' }, 'Отметь начало, чтобы считать загрузку')),
      el('button', { class: 'btn primary sm', onclick: async () => { await store.saveShift({ date: today, start_time: nowRounded() }); toast('Смена начата'); refresh(); } }, 'Начать смену'));
  } else if (!shift.end_time) {
    shiftCard = el('div', { class: 'card row between' }, el('div', {}, el('b', {}, `Смена с ${hhmm(shift.start_time)}`), el('div', { class: 'sub' }, 'идёт сейчас')),
      el('div', { class: 'row' },
        el('button', { class: 'btn sm', onclick: () => openShiftForm({ shift, onSaved: refresh }) }, 'Изменить'),
        el('button', { class: 'btn primary sm', onclick: async () => { await store.saveShift({ id: shift.id, end_time: nowRounded() }); toast('Смена закрыта'); refresh(); } }, 'Закрыть')));
  } else {
    const h = (toMin(shift.end_time) - toMin(shift.start_time)) / 60;
    shiftCard = el('button', { class: 'card row between', style: 'width:100%;text-align:left', onclick: () => openShiftForm({ shift, onSaved: refresh }) },
      el('div', {}, el('b', {}, `Смена ${hhmm(shift.start_time)}–${hhmm(shift.end_time)}`), el('div', { class: 'sub' }, fmtHours(h) + (shift.note ? ' · ' + shift.note : ''))),
      el('span', { class: 'pill done' }, 'закрыта'));
  }

  const tiles = el('div', { class: 'tiles' },
    el('div', { class: 'tile accent' }, el('div', { class: 'label' }, 'Мой доход за день'), el('div', { class: 'value' }, money(income)), el('div', { class: 'hint' }, `${percent}% от выручки + чаевые ${money(tips)}`)),
    el('div', { class: 'tile' }, el('div', { class: 'label' }, 'Выручка'), el('div', { class: 'value' }, money(revenue)), el('div', { class: 'hint' }, `${done.length} ${plural(done.length, 'визит', 'визита', 'визитов')}`)),
  );

  const list = el('div', { class: 'list' });
  if (!visits.length) list.append(el('div', { class: 'empty' }, el('strong', {}, 'Визитов пока нет'), 'Нажми «+», когда придёт первый клиент, или запиши наперёд.'));
  for (const v of visits) list.append(visitItem(v));

  const up = el('div', { class: 'list' });
  for (const v of upcoming.slice(0, 5)) up.append(visitItem(v, true));

  root.append(
    ...banners, shiftCard, tiles,
    el('div', { class: 'section-title' }, el('h2', {}, 'Визиты'), el('button', { class: 'btn ghost sm', onclick: () => openVisitForm({ date: today, onSaved: refresh }) }, '+ Визит')),
    list,
    upcoming.length ? el('div', { class: 'section-title' }, el('h2', {}, 'Ближайшие записи'), el('a', { href: '#calendar', class: 'sub' }, 'календарь →')) : null,
    upcoming.length ? up : null,
    el('button', { class: 'fab', 'aria-label': 'Новый визит', onclick: () => openVisitForm({ date: today, onSaved: refresh }) }, '+'),
  );
}

export function visitItem(v, withDate = false) {
  const items = v.items || [];
  const cls = pillClass(v.status);
  return el('button', { class: 'item ' + cls, onclick: () => openVisit(v, refresh) },
    el('div', { class: 'time' }, hhmm(v.start_time), el('small', {}, withDate ? relDay(v.date) : (v.end_time ? hhmm(v.end_time) : ''))),
    el('div', { class: 'grow' }, el('div', { class: 'name' }, v.client?.name || 'Без имени', v.is_new ? el('span', { class: 'pill new', style: 'margin-left:6px' }, 'новый') : null),
      el('div', { class: 'meta' }, items.length ? items.map((i) => i.name).join(' + ') : (v.status === STATUS.PLAN ? 'запись' : '—'))),
    el('div', { class: 'sum' }, v.status === STATUS.DONE ? money(v.total) : el('span', { class: 'pill ' + cls }, { [STATUS.PLAN]: 'запись', [STATUS.NOSHOW]: 'не пришёл', [STATUS.CANCEL]: 'отмена' }[v.status]),
      v.tips ? el('small', {}, '+' + money(v.tips)) : null),
  );
}

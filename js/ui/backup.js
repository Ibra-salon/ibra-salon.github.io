// Сохранение копии и восстановление: кнопки, напоминание, подсказка «на экран Домой».
import { el, toast, isoDate, parseDate, fmtDate, plural, ls } from '../util.js';
import * as store from '../store.js';
import { saveBackup, parseBackup, restoreBackup } from '../export.js';
import { BACKUP_REMIND_DAYS } from '../config.js';
import { openSheet, closeSheet } from './sheet.js';
import { refresh } from '../app.js';

const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 864e5);

export async function backupStatus() {
  const s = await store.settings({ fresh: true });
  const last = s.last_backup || null;
  const since = daysBetween(last || s.first_use || isoDate(), isoDate());
  const anyVisits = (await store.visitsByRange('2000-01-01', '2100-01-01')).length > 0;
  return { last, since, due: anyVisits && since >= BACKUP_REMIND_DAYS };
}

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const isMobile = () => isIOS() || /Android/i.test(navigator.userAgent);

export function backupButton(label = 'Сохранить копию в Excel', cls = 'btn block primary') {
  const btn = el('button', { class: cls, type: 'button', onclick: async () => {
    btn.disabled = true; const old = btn.textContent; btn.textContent = 'Готовлю файл…';
    try {
      const r = await saveBackup();
      if (r.how !== 'cancelled') { toast(`Копия сохранена: ${r.visits} ${plural(r.visits, 'визит', 'визита', 'визитов')}`); refresh(); }
    } catch (e) { toast(e.message || 'Не получилось сохранить', 'error'); }
    finally { btn.disabled = false; btn.textContent = old; }
  } }, label);
  return btn;
}

export function restoreButton() {
  const input = el('input', { type: 'file', id: 'restore-file', accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', hidden: true });
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; input.value = '';
    if (!file) return;
    let tables;
    try { tables = await parseBackup(file); } catch (e) { toast(e.message || 'Файл не читается', 'error'); return; }
    const n = tables.visits.length, c = tables.clients.length;
    openSheet({
      title: 'Восстановить журнал?',
      body: el('div', { class: 'stack' },
        el('p', {}, `В файле «${file.name}»: ${n} ${plural(n, 'визит', 'визита', 'визитов')}, ${c} ${plural(c, 'клиент', 'клиента', 'клиентов')}, ${tables.shifts.length} смен.`),
        el('p', { class: 'error' }, 'Всё, что сейчас записано в журнале на этом телефоне, заменится данными из файла.')),
      footer: [
        el('button', { class: 'btn', type: 'button', onclick: closeSheet }, 'Отмена'),
        el('button', { class: 'btn danger', type: 'button', onclick: async () => {
          await restoreBackup(tables); closeSheet(); toast('Журнал восстановлен'); refresh();
        } }, 'Заменить'),
      ],
    });
  });
  const btn = el('button', { class: 'btn block', type: 'button', onclick: () => input.click() }, 'Восстановить из файла');
  return el('div', {}, btn, input);
}

/** Плашки для главного экрана: установить на экран Домой, пора сохранить копию. */
export async function homeBanners() {
  const out = [];
  if (isMobile() && !isStandalone() && !ls('hint.install.hidden')) {
    const steps = isIOS()
      ? 'В Safari нажми «Поделиться» внизу, затем «На экран Домой». Открывай журнал только с этой иконки: у неё своя память, отдельная от Safari, и iPhone её не чистит.'
      : 'В меню браузера (⋮) выбери «Добавить на главный экран» или «Установить приложение». Открывай журнал с этой иконки.';
    const card = el('div', { class: 'card banner warn stack' },
      el('b', {}, 'Добавь журнал на экран Домой'),
      el('p', { class: 'sub' }, steps),
      el('button', { class: 'btn ghost sm', style: 'justify-self:start;padding:0', type: 'button', onclick: () => { ls('hint.install.hidden', true); card.remove(); } }, 'Уже добавил'));
    out.push(card);
  }
  const st = await backupStatus();
  if (st.due) {
    out.push(el('div', { class: 'card banner stack' },
      el('b', {}, st.last ? `Копию не сохраняли ${st.since} ${plural(st.since, 'день', 'дня', 'дней')}` : 'Сохрани первую копию журнала'),
      el('p', { class: 'sub' }, 'Данные живут только в этом телефоне. Отправь файл себе в Telegram в «Избранное», и при потере телефона ничего не пропадёт.'),
      backupButton('Сохранить копию', 'btn primary sm')));
  }
  return out;
}

export async function dataCard() {
  const st = await backupStatus();
  return el('div', { class: 'card stack' },
    el('h3', {}, 'Данные'),
    el('p', { class: 'sub' }, 'Журнал хранится только в этом телефоне. Ни аккаунтов, ни серверов: никто, кроме тебя, его не видит.'),
    el('dl', { class: 'kv' }, el('dt', {}, 'Последняя копия'), el('dd', {}, st.last ? fmtDate(st.last) : 'ещё не было')),
    backupButton(),
    el('p', { class: 'sub' }, 'Файл Excel с листами: Визиты, Позиции, Клиенты, Смены, Услуги, Настройки. Его же можно открыть в Excel или отдать ИИ для разбора.'),
    restoreButton(),
    el('p', { class: 'sub' }, 'Новый телефон: открой сайт, добавь на экран Домой и восстанови журнал из последнего файла.'));
}

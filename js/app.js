// Точка входа: загрузка журнала из памяти телефона, вкладки, общая шапка.
import { initDb } from './db.js';
import { el, toast } from './util.js';
import { APP_NAME } from './config.js';
import { renderToday } from './ui/today.js';
import { renderCalendar } from './ui/calendar.js';
import { renderClients } from './ui/clients.js';
import { renderStats } from './ui/stats.js';
import { renderMore } from './ui/more.js';

const ICONS = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M9 15l2 2 4-4"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4M7 13h3M14 13h3M7 17h3M14 17h3"/></svg>',
  clients: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><circle cx="17.5" cy="9" r="3"/><path d="M22 19c0-2.5-1.8-4.3-4.5-4.8"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
};
const TABS = [
  ['today', 'Сегодня', renderToday],
  ['calendar', 'Календарь', renderCalendar],
  ['clients', 'Клиенты', renderClients],
  ['stats', 'Статистика', renderStats],
  ['more', 'Ещё', renderMore],
];

export const state = { ready: false };
const root = document.getElementById('app');
let viewEl, tabsEl, titleEl;

function currentTab() {
  const h = (location.hash || '#today').slice(1);
  return TABS.find((t) => t[0] === h) ? h : 'today';
}
export function navigate(tab) { location.hash = '#' + tab; }

function buildShell() {
  titleEl = el('div', { class: 'sub', id: 'view-sub' });
  const top = el('header', { class: 'topbar' }, el('div', { class: 'wrap' },
    el('div', { class: 'brand' }, APP_NAME, el('small', {}, 'журнал')), titleEl));
  viewEl = el('main', { class: 'wrap view', id: 'view' });
  tabsEl = el('nav', { class: 'tabs', 'aria-label': 'Разделы' }, el('div', { class: 'wrap' },
    ...TABS.map(([id, label]) => el('a', { href: '#' + id, dataset: { tab: id }, html: ICONS[id] + `<span>${label}</span>` }))));
  root.replaceChildren(top, viewEl, tabsEl);
  document.body.dataset.screen = 'app';
}

let renderToken = 0;
export async function renderView() {
  const tab = currentTab();
  for (const a of tabsEl.querySelectorAll('a')) { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  const token = ++renderToken;
  const render = TABS.find((t) => t[0] === tab)[2];
  viewEl.replaceChildren(el('div', { class: 'loading' }, el('span', { class: 'spin' })));
  window.scrollTo(0, 0);
  try {
    const frag = document.createDocumentFragment();
    // render-функции зовут root.append(...) с возможными null — фрагмент превратил бы их в текст «null»
    const target = { append: (...nodes) => frag.append(...nodes.flat().filter(Boolean)) };
    await render(target, { setSub: (s) => { titleEl.textContent = s || ''; } });
    if (token !== renderToken) return;
    viewEl.replaceChildren(frag);
  } catch (e) {
    if (token !== renderToken) return;
    console.error(e);
    viewEl.replaceChildren(el('div', { class: 'empty' }, el('strong', {}, 'Не удалось загрузить'),
      e.message || 'ошибка', el('div', { style: 'margin-top:12px' }, el('button', { class: 'btn', onclick: renderView }, 'Повторить'))));
  }
}
/** Перерисовать текущую вкладку (после сохранения) */
export const refresh = () => renderView();

async function start() {
  try {
    await initDb();
  } catch (e) {
    console.error(e);
    toast('Память телефона недоступна: данные не сохранятся', 'error');
  }
  state.ready = true;
  buildShell();
  renderView();
}

window.addEventListener('hashchange', () => { if (state.ready) renderView(); });
// вернулись в приложение на следующий день: обновить «Сегодня» (если не открыта форма)
let lastDay = new Date().toDateString();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.ready) return;
  const d = new Date().toDateString();
  if (d !== lastDay && !document.querySelector('.sheet-back')) { lastDay = d; renderView(); }
});
// работа без интернета
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('sw', e)));
}
start();

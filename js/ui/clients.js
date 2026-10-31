// Клиенты без контактов: имя, заметка, история.
import { el, money, relDay, plural, toast, hhmm, fmtDate, ls } from '../util.js';
import { STATUS, STATUS_LABEL, SOURCES } from '../catalog.js';
import * as store from '../store.js';
import { openSheet, closeSheet, confirmSheet } from './sheet.js';
import { openVisit, pillClass } from './visit-form.js';
import { refresh } from '../app.js';

export async function renderClients(root, { setSub }) {
  const all = await store.clientsWithStats();
  setSub(`${all.length} ${plural(all.length, 'клиент', 'клиента', 'клиентов')}`);
  const search = el('input', { class: 'input', type: 'search', placeholder: 'Поиск по имени или заметке', id: 'cl-search', autocomplete: 'off' });
  const sortSeg = el('div', { class: 'seg' });
  let sort = ls('cl.sort') || 'recent';
  const list = el('div', { class: 'list' });
  function draw() {
    const q = search.value.trim().toLowerCase();
    let rows = all.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.note || '').toLowerCase().includes(q));
    rows.sort(sort === 'recent' ? (a, b) => (b.last || '').localeCompare(a.last || '') || a.name.localeCompare(b.name, 'ru')
      : sort === 'top' ? (a, b) => b.total - a.total : (a, b) => a.name.localeCompare(b.name, 'ru'));
    list.replaceChildren(...(rows.length ? rows.map(clientItem) : [el('div', { class: 'empty' }, el('strong', {}, all.length ? 'Никого не нашлось' : 'Клиентов пока нет'), all.length ? '' : 'Они появятся сами, когда добавишь первый визит.')]));
    sortSeg.replaceChildren(...[['recent', 'Недавние'], ['top', 'По сумме'], ['name', 'По имени']].map(([k, l]) => el('button', { 'aria-pressed': String(sort === k), onclick: () => { sort = k; ls('cl.sort', k); draw(); } }, l)));
  }
  search.addEventListener('input', draw);
  draw();
  root.append(search, sortSeg, list);
}

function clientItem(c) {
  return el('button', { class: 'item', style: 'grid-template-columns: 1fr auto', onclick: () => openClient(c) },
    el('div', { class: 'grow' }, el('div', { class: 'name' }, c.name), el('div', { class: 'meta' }, [c.note, c.visits ? `${c.visits} ${plural(c.visits, 'визит', 'визита', 'визитов')}` : 'визитов нет', c.last ? 'был ' + relDay(c.last).toLowerCase() : null].filter(Boolean).join(' · '))),
    el('div', { class: 'sum' }, c.total ? money(c.total) : ''));
}

async function openClient(c) {
  const visits = await store.visitsByClient(c.id);
  const hist = el('div', { class: 'list' }, ...(visits.length ? visits.map((v) => el('button', { class: 'item ' + pillClass(v.status), style: 'grid-template-columns: 1fr auto', onclick: () => openVisit(v, () => { closeSheet(); refresh(); }) },
    el('div', { class: 'grow' }, el('div', { class: 'name' }, fmtDate(v.date, { withWeekday: true }) + ', ' + hhmm(v.start_time)), el('div', { class: 'meta' }, (v.items || []).map((i) => i.name).join(' + ') || STATUS_LABEL[v.status])),
    el('div', { class: 'sum' }, v.status === STATUS.DONE ? money(v.total) : el('span', { class: 'pill ' + pillClass(v.status) }, STATUS_LABEL[v.status])))) : [el('div', { class: 'empty' }, 'Визитов ещё не было')]));
  const body = el('div', { class: 'stack' },
    el('dl', { class: 'kv' },
      el('dt', {}, 'Визитов'), el('dd', {}, String(c.visits)),
      el('dt', {}, 'За всё время'), el('dd', {}, money(c.total)),
      c.first ? el('dt', {}, 'Первый визит') : null, c.first ? el('dd', {}, fmtDate(c.first)) : null,
      c.source ? el('dt', {}, 'Откуда') : null, c.source ? el('dd', {}, c.source) : null),
    c.note ? el('p', { class: 'note-text' }, c.note) : null,
    el('div', { class: 'section-title' }, el('h2', {}, 'История')), hist);
  openSheet({ title: c.name, body, footer: [
    el('button', { class: 'btn', onclick: () => editClient(c) }, 'Изменить'),
  ] });
}

function editClient(c) {
  const nameIn = el('input', { class: 'input', id: 'c-name', value: c.name });
  const noteIn = el('textarea', { class: 'input', id: 'c-note', placeholder: 'Что помнить: длина, цвет, привычки' }, c.note || '');
  let source = c.source || null;
  const src = el('div', { class: 'chips' });
  const drawSrc = () => src.replaceChildren(...SOURCES.map((s) => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(source === s), onclick: () => { source = source === s ? null : s; drawSrc(); } }, s)));
  drawSrc();
  const err = el('div', { class: 'error' }); err.hidden = true;
  const body = el('div', { class: 'stack' },
    el('div', { class: 'field' }, el('label', { for: 'c-name' }, 'Имя'), nameIn),
    el('div', { class: 'field' }, el('label', { for: 'c-note' }, 'Заметка'), noteIn),
    el('div', { class: 'field' }, el('div', { class: 'lbl' }, 'Откуда пришёл'), src),
    el('p', { class: 'sub' }, 'Телефоны и соцсети клиентов сюда не записываем.'), err);
  openSheet({ title: 'Клиент', body, footer: [
    el('button', { class: 'btn danger', onclick: async () => {
      if (await confirmSheet(c.visits ? `Удалить клиента? Его ${c.visits} визит(ов) останутся в журнале без имени.` : 'Удалить клиента?', { okLabel: 'Удалить', danger: true })) {
        await store.deleteClient(c.id); toast('Клиент удалён'); refresh();
      } else editClient(c);
    } }, 'Удалить'),
    el('button', { class: 'btn primary', onclick: async () => {
      if (!nameIn.value.trim()) { err.textContent = 'Имя не может быть пустым.'; err.hidden = false; return; }
      try { await store.updateClient(c.id, { name: nameIn.value.trim(), note: noteIn.value.trim() || null, source }); closeSheet(); toast('Сохранено'); refresh(); }
      catch (e) { err.textContent = e.status === 409 ? 'Клиент с таким именем уже есть.' : 'Не сохранилось: ' + e.message; err.hidden = false; }
    } }, 'Сохранить'),
  ] });
}

// Форма визита: создание, редактирование, просмотр с действиями «Пришёл / Не пришёл / Удалить».
import { el, isoDate, nowRounded, toMin, fromMin, money, hhmm, fmtDuration, toast, relDay, priceRange } from '../util.js';
import { SOURCES, STATUS, STATUS_LABEL, CATEGORY_ORDER } from '../catalog.js';
const catRank = (c) => { const i = CATEGORY_ORDER.indexOf(c); return i === -1 ? 99 : i; };
import * as store from '../store.js';
import { openSheet, closeSheet, confirmSheet } from './sheet.js';

/**
 * openVisitForm({ visit?, date?, start_time?, onSaved })
 * visit — существующая запись (с items и client), иначе новая.
 */
export async function openVisitForm({ visit = null, date = isoDate(), start_time = null, onSaved } = {}) {
  const [services, allClients] = await Promise.all([store.services(), store.clientsWithStats()]);
  const active = services.filter((s) => s.active || (visit?.items || []).some((i) => i.service_id === s.id));
  const isEdit = !!visit;
  const today = isoDate();

  // ---- состояние формы ----
  const f = {
    date: visit?.date || date,
    start: hhmm(visit?.start_time) || start_time || (date === today ? nowRounded() : '12:00'),
    end: hhmm(visit?.end_time) || '',
    endTouched: !!visit?.end_time,
    clientName: visit?.client?.name || '',
    clientId: visit?.client_id || null,
    status: visit?.status || (date > today ? STATUS.PLAN : STATUS.DONE),
    isNew: visit?.is_new ?? false,
    isNewTouched: isEdit,
    source: visit?.source || null,
    tips: visit?.tips || 0,
    note: visit?.note || '',
    items: (visit?.items || []).map((i) => ({ service_id: i.service_id, name: i.name, price: i.price })),
  };

  // ---- элементы ----
  const dateIn = el('input', { class: 'input', type: 'date', id: 'v-date', value: f.date, oninput: () => { f.date = dateIn.value; } });
  const startIn = el('input', { class: 'input', type: 'time', id: 'v-start', value: f.start, step: 300, oninput: () => { f.start = startIn.value; recalcEnd(); } });
  const endIn = el('input', { class: 'input', type: 'time', id: 'v-end', value: f.end, step: 300, oninput: () => { f.end = endIn.value; f.endTouched = true; } });
  const durLbl = el('span', { class: 'sub' });

  function plannedDuration() {
    return f.items.reduce((s, i) => s + (services.find((x) => x.id === i.service_id)?.duration_min || 0), 0);
  }
  function recalcEnd() {
    const d = plannedDuration();
    durLbl.textContent = d ? `по прайсу ${fmtDuration(d)}` : '';
    if (f.endTouched || !f.start) return;
    f.end = d ? fromMin(toMin(f.start) + d) : '';
    endIn.value = f.end;
  }

  // клиент с подсказками
  const clientIn = el('input', { class: 'input', id: 'v-client', placeholder: 'Имя или прозвище', autocomplete: 'off', value: f.clientName });
  const sugg = el('div', { class: 'suggest-list' }); sugg.hidden = true;
  const newChk = el('input', { type: 'checkbox', id: 'v-new', checked: f.isNew, onchange: () => { f.isNew = newChk.checked; f.isNewTouched = true; } });
  const newHint = el('span', { class: 'sub' });
  function pickClient(c) {
    f.clientName = c ? c.name : clientIn.value.trim(); f.clientId = c ? c.id : null;
    clientIn.value = f.clientName; sugg.hidden = true;
    if (!f.isNewTouched) {
      f.isNew = c ? c.visits === 0 : true; newChk.checked = f.isNew;
    }
    newHint.textContent = c ? (c.visits ? `${c.visits} визит(ов), последний ${c.last ? relDay(c.last).toLowerCase() : '—'}` : 'в базе есть, визитов ещё не было') : (f.clientName ? 'новое имя, клиент будет создан' : '');
  }
  function showSuggest() {
    const q = clientIn.value.trim().toLowerCase();
    const exact = allClients.find((c) => c.name.toLowerCase() === q);
    if (exact && f.clientId !== exact.id) { f.clientId = exact.id; }
    if (!exact) { f.clientId = null; if (!f.isNewTouched) { f.isNew = !!q; newChk.checked = f.isNew; } newHint.textContent = q ? 'новое имя, клиент будет создан' : ''; }
    f.clientName = clientIn.value.trim();
    const list = q ? allClients.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6) : [];
    sugg.replaceChildren(...list.map((c) => el('button', { type: 'button', onmousedown: (e) => e.preventDefault(), onclick: () => pickClient(c) },
      el('span', {}, c.name, c.note ? el('small', {}, ' · ' + c.note) : null), el('small', {}, c.visits ? `${c.visits} виз.` : 'новый'))));
    sugg.hidden = !list.length || (list.length === 1 && exact);
    if (exact) pickClient(exact);
  }
  clientIn.addEventListener('input', showSuggest);
  clientIn.addEventListener('focus', showSuggest);
  clientIn.addEventListener('blur', () => setTimeout(() => { sugg.hidden = true; }, 150));
  if (f.clientId) { const c = allClients.find((x) => x.id === f.clientId); if (c) newHint.textContent = c.visits ? `${c.visits} визит(ов)` : ''; }

  // услуги чипсами
  const linesEl = el('div', { class: 'lines' });
  const totalEl = el('span', { class: 'v' });
  const chipsWrap = el('div', { class: 'stack' });
  function renderChips() {
    const cats = [...new Set(active.map((s) => s.category))].sort((a, b) => catRank(a) - catRank(b));
    chipsWrap.replaceChildren(...cats.map((cat) => el('div', {}, el('div', { class: 'cat-title' }, cat), el('div', { class: 'chips', style: 'margin-top:6px' },
      ...active.filter((s) => s.category === cat).map((s) => {
        const on = f.items.some((i) => i.service_id === s.id);
        return el('button', { type: 'button', class: 'chip', 'aria-pressed': String(on), onclick: () => toggleService(s) }, s.name, el('small', {}, priceRange(s)));
      })))));
  }
  function toggleService(s) {
    const idx = f.items.findIndex((i) => i.service_id === s.id);
    if (idx >= 0) f.items.splice(idx, 1); else f.items.push({ service_id: s.id, name: s.name, price: s.price_min });
    renderChips(); renderLines(); recalcEnd();
  }
  function renderLines() {
    linesEl.replaceChildren(...f.items.map((it, i) => el('div', { class: 'line-item' },
      el('div', { class: 'nm' }, it.name, el('small', {}, priceRange(services.find((s) => s.id === it.service_id) || { price_min: it.price }))),
      el('input', { class: 'input num', type: 'number', inputmode: 'numeric', min: 0, step: 500, value: it.price, 'aria-label': 'Цена ' + it.name,
        oninput: (e) => { it.price = Number(e.target.value) || 0; updateTotal(); } }),
      el('button', { type: 'button', class: 'x', 'aria-label': 'Убрать', onclick: () => { f.items.splice(i, 1); renderChips(); renderLines(); recalcEnd(); } }, '×'),
    )));
    updateTotal();
  }
  function total() { return f.items.reduce((s, i) => s + (Number(i.price) || 0), 0); }
  function updateTotal() { totalEl.textContent = money(total()); }

  // источник, статус, чаевые, заметка
  const srcChips = el('div', { class: 'chips' });
  function renderSrc() {
    srcChips.replaceChildren(...SOURCES.map((s) => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(f.source === s), onclick: () => { f.source = f.source === s ? null : s; renderSrc(); } }, s)));
  }
  const statusSeg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Статус' });
  function renderStatus() {
    const opts = isEdit ? [STATUS.PLAN, STATUS.DONE, STATUS.NOSHOW, STATUS.CANCEL] : [STATUS.DONE, STATUS.PLAN];
    statusSeg.replaceChildren(...opts.map((s) => el('button', { type: 'button', 'aria-pressed': String(f.status === s), onclick: () => { f.status = s; renderStatus(); } }, STATUS_LABEL[s])));
  }
  const tipsIn = el('input', { class: 'input num', type: 'number', inputmode: 'numeric', min: 0, step: 500, id: 'v-tips', value: f.tips || '', placeholder: '0', oninput: () => { f.tips = Number(tipsIn.value) || 0; } });
  const noteIn = el('textarea', { class: 'input', id: 'v-note', placeholder: 'Например: каре, красила сама, просила потише', oninput: () => { f.note = noteIn.value; } }, f.note);
  const errEl = el('div', { class: 'error' }); errEl.hidden = true;

  renderChips(); renderLines(); renderSrc(); renderStatus(); recalcEnd();

  const body = el('div', { class: 'stack' },
    el('div', { class: 'three' },
      el('div', { class: 'field' }, el('label', { for: 'v-date' }, 'Дата'), dateIn),
      el('div', { class: 'field' }, el('label', { for: 'v-start' }, 'Начало'), startIn),
      el('div', { class: 'field' }, el('label', { for: 'v-end' }, 'Конец'), endIn)),
    durLbl,
    el('div', { class: 'field suggest' }, el('label', { for: 'v-client' }, 'Клиент'), clientIn, sugg),
    el('label', { class: 'check', for: 'v-new' }, newChk, el('span', {}, 'Первый визит ко мне ', newHint)),
    el('div', { class: 'field' }, el('div', { class: 'lbl' }, 'Услуги'), chipsWrap),
    f.items.length || true ? el('div', { class: 'card flat stack', id: 'v-lines' }, linesEl, el('div', { class: 'total-row' }, el('span', {}, 'Итого'), totalEl)) : null,
    el('div', { class: 'two' },
      el('div', { class: 'field' }, el('label', { for: 'v-tips' }, 'Чаевые, ₸'), tipsIn),
      el('div', { class: 'field' }, el('div', { class: 'lbl' }, 'Статус'), statusSeg)),
    el('div', { class: 'field' }, el('div', { class: 'lbl' }, 'Откуда клиент'), srcChips),
    el('div', { class: 'field' }, el('label', { for: 'v-note' }, 'Заметка'), noteIn),
    errEl,
  );

  async function save() {
    errEl.hidden = true;
    if (!f.date) return fail('Укажи дату.');
    if (!f.start) return fail('Укажи время начала.');
    if (!f.clientName.trim()) return fail('Напиши имя клиента, хотя бы прозвище.');
    if (!f.items.length && f.status === STATUS.DONE) return fail('Выбери хотя бы одну услугу.');
    saveBtn.disabled = true; saveBtn.textContent = 'Сохраняю…';
    try {
      const saved = await store.saveVisit({
        id: visit?.id, date: f.date, start_time: f.start, end_time: f.end || null,
        client_id: f.clientId, client_name: f.clientName, status: f.status, is_new: f.isNew,
        source: f.source, tips: f.tips, note: f.note.trim(), items: f.items,
      });
      closeSheet();
      toast(isEdit ? 'Сохранено' : (f.status === STATUS.PLAN ? 'Записано' : 'Визит добавлен'));
      onSaved?.(saved);
    } catch (e) {
      fail('Не сохранилось: ' + (e.message || 'нет связи'));
      saveBtn.disabled = false; saveBtn.textContent = 'Сохранить';
    }
  }
  function fail(msg) { errEl.textContent = msg; errEl.hidden = false; errEl.scrollIntoView({ block: 'nearest' }); return false; }

  const saveBtn = el('button', { class: 'btn primary', type: 'button', onclick: save }, 'Сохранить');
  const footer = [saveBtn];
  if (isEdit) footer.unshift(el('button', { class: 'btn danger', type: 'button', onclick: async () => {
    if (await confirmSheet('Удалить этот визит без возможности восстановления?', { okLabel: 'Удалить', danger: true })) {
      await store.deleteVisit(visit.id); toast('Удалено'); onSaved?.(null);
    } else { openVisitForm({ visit, onSaved }); }
  } }, 'Удалить'));
  openSheet({ title: isEdit ? 'Визит' : 'Новый визит', body, footer });
  if (!isEdit && !f.clientName) setTimeout(() => clientIn.focus({ preventScroll: true }), 80);
}

/** Карточка визита: кратко + быстрые действия. */
export function openVisit(v, onChange) {
  const items = v.items || [];
  const s = v.status;
  const body = el('div', { class: 'stack' },
    el('div', { class: 'row between' }, el('h2', {}, v.client?.name || 'Без имени'), el('span', { class: 'pill ' + pillClass(s) }, STATUS_LABEL[s])),
    el('dl', { class: 'kv' },
      el('dt', {}, 'Когда'), el('dd', {}, `${relDay(v.date)}, ${hhmm(v.start_time)}${v.end_time ? '–' + hhmm(v.end_time) : ''}`),
      el('dt', {}, 'Услуги'), el('dd', {}, items.length ? items.map((i) => i.name).join(', ') : '—'),
      el('dt', {}, 'Сумма'), el('dd', {}, money(v.total)),
      v.tips ? el('dt', {}, 'Чаевые') : null, v.tips ? el('dd', {}, money(v.tips)) : null,
      v.source ? el('dt', {}, 'Откуда') : null, v.source ? el('dd', {}, v.source) : null,
      el('dt', {}, 'Клиент'), el('dd', {}, v.is_new ? 'новый' : 'повторный'),
    ),
    v.note ? el('p', { class: 'note-text' }, v.note) : null,
    v.client?.note ? el('p', { class: 'sub' }, 'О клиенте: ' + v.client.note) : null,
  );
  const act = async (status) => {
    await store.setVisitStatus(v.id, status); closeSheet(); toast(STATUS_LABEL[status]); onChange?.();
  };
  const footer = [];
  if (s === STATUS.PLAN) {
    footer.push(el('button', { class: 'btn danger', type: 'button', onclick: () => act(STATUS.NOSHOW) }, 'Не пришёл'));
    footer.push(el('button', { class: 'btn ok', type: 'button', onclick: () => openVisitForm({ visit: { ...v, status: STATUS.DONE }, onSaved: onChange }) }, 'Пришёл'));
  }
  footer.push(el('button', { class: 'btn' + (s === STATUS.PLAN ? '' : ' primary'), type: 'button', onclick: () => openVisitForm({ visit: v, onSaved: onChange }) }, 'Изменить'));
  openSheet({ title: 'Визит', body, footer });
}

export function pillClass(status) {
  return { [STATUS.DONE]: 'done', [STATUS.PLAN]: 'plan', [STATUS.NOSHOW]: 'noshow', [STATUS.CANCEL]: 'cancel' }[status] || 'neutral';
}

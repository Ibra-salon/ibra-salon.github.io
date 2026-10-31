import { el, isoDate, nowRounded, toast, hhmm } from '../util.js';
import * as store from '../store.js';
import { openSheet, closeSheet, confirmSheet } from './sheet.js';

export function openShiftForm({ shift = null, date = isoDate(), onSaved } = {}) {
  const isEdit = !!shift;
  const dateIn = el('input', { class: 'input', type: 'date', id: 's-date', value: shift?.date || date });
  const startIn = el('input', { class: 'input', type: 'time', id: 's-start', step: 300, value: hhmm(shift?.start_time) || (date === isoDate() ? nowRounded() : '10:00') });
  const endIn = el('input', { class: 'input', type: 'time', id: 's-end', step: 300, value: hhmm(shift?.end_time) || '' });
  const noteIn = el('input', { class: 'input', id: 's-note', placeholder: 'Например: полдня, подмена', value: shift?.note || '' });
  const err = el('div', { class: 'error' }); err.hidden = true;
  const body = el('div', { class: 'stack' },
    el('div', { class: 'field' }, el('label', { for: 's-date' }, 'Дата'), dateIn),
    el('div', { class: 'two' },
      el('div', { class: 'field' }, el('label', { for: 's-start' }, 'Начало'), startIn),
      el('div', { class: 'field' }, el('label', { for: 's-end' }, 'Конец'), endIn)),
    el('p', { class: 'sub' }, 'Конец можно оставить пустым и закрыть смену позже кнопкой на главной.'),
    el('div', { class: 'field' }, el('label', { for: 's-note' }, 'Заметка'), noteIn),
    err);
  const save = async () => {
    if (!dateIn.value || !startIn.value) { err.textContent = 'Нужны дата и время начала.'; err.hidden = false; return; }
    if (endIn.value && endIn.value <= startIn.value) { err.textContent = 'Конец смены раньше начала.'; err.hidden = false; return; }
    try {
      await store.saveShift({ id: shift?.id, date: dateIn.value, start_time: startIn.value, end_time: endIn.value || null, note: noteIn.value.trim() || null });
      closeSheet(); toast('Смена сохранена'); onSaved?.();
    } catch (e) { err.textContent = 'Не сохранилось: ' + e.message; err.hidden = false; }
  };
  const footer = [el('button', { class: 'btn primary', type: 'button', onclick: save }, 'Сохранить')];
  if (isEdit) footer.unshift(el('button', { class: 'btn danger', type: 'button', onclick: async () => {
    if (await confirmSheet('Удалить смену?', { okLabel: 'Удалить', danger: true })) { await store.deleteShift(shift.id); toast('Смена удалена'); onSaved?.(); }
    else openShiftForm({ shift, onSaved });
  } }, 'Удалить'));
  openSheet({ title: isEdit ? 'Смена' : 'Новая смена', body, footer });
}

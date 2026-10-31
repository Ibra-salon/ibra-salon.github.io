// Выезжающий лист для форм и подтверждений. Один открытый лист за раз.
import { el } from '../util.js';

let current = null;

export function openSheet({ title, body, footer = [], onClose, oneColumn = false }) {
  closeSheet();
  const back = el('div', { class: 'sheet-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const closeBtn = el('button', { class: 'btn ghost sm', type: 'button', onclick: () => closeSheet() }, 'Закрыть');
  const head = el('div', { class: 'sheet-head' }, el('h2', {}, title), closeBtn);
  const bodyEl = el('div', { class: 'sheet-body' }, body);
  const foot = el('div', { class: 'sheet-foot' + (oneColumn || footer.length <= 1 ? ' one' : '') }, footer);
  if (!footer.length) foot.hidden = true;
  const sheet = el('div', { class: 'sheet' }, head, bodyEl, foot);
  back.append(sheet);
  back.addEventListener('click', (e) => { if (e.target === back) closeSheet(); });
  document.body.append(back);
  document.body.style.overflow = 'hidden';
  const onKey = (e) => { if (e.key === 'Escape') closeSheet(); };
  document.addEventListener('keydown', onKey);
  current = { back, onClose, onKey, bodyEl };
  return { close: closeSheet, body: bodyEl, setFooter(btns) { foot.replaceChildren(...btns); foot.hidden = !btns.length; foot.className = 'sheet-foot' + (btns.length <= 1 ? ' one' : ''); } };
}

export function closeSheet() {
  if (!current) return;
  const { back, onClose, onKey } = current;
  current = null;
  back.remove();
  document.body.style.overflow = '';
  document.removeEventListener('keydown', onKey);
  onClose?.();
}

/** Подтверждение внутри страницы (confirm() в браузере не используем) */
export function confirmSheet(message, { okLabel = 'Да', danger = false, title = 'Подтверждение' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); closeSheet(); };
    openSheet({
      title,
      body: el('p', { style: 'font-size:16px' }, message),
      footer: [
        el('button', { class: 'btn', type: 'button', onclick: () => finish(false) }, 'Отмена'),
        el('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', onclick: () => finish(true) }, okLabel),
      ],
      onClose: () => finish(false),
    });
  });
}

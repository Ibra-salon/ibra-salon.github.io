// Ещё: прайс, настройки, экспорт, выход.
import { el, money, priceRange, fmtDuration, toast } from '../util.js';
import { CATEGORY_ORDER } from '../catalog.js';
const catRank = (c) => { const i = CATEGORY_ORDER.indexOf(c); return i === -1 ? 99 : i; };
import * as store from '../store.js';
import { openSheet, closeSheet } from './sheet.js';
import { refresh } from '../app.js';
import { dataCard } from './backup.js';

export async function renderMore(root, { setSub }) {
  const [services, settings, data] = await Promise.all([store.services({ fresh: true }), store.settings({ fresh: true }), dataCard()]);
  setSub('');

  const percentIn = el('input', { class: 'input num', type: 'number', inputmode: 'numeric', min: 0, max: 100, id: 'm-percent', value: settings.master_percent ?? 40 });
  const percentCard = el('div', { class: 'card stack' }, el('h3', {}, 'Моя доля'),
    el('div', { class: 'row' }, el('div', { class: 'field grow' }, el('label', { for: 'm-percent' }, 'Процент от выручки, %'), percentIn),
      el('button', { class: 'btn', style: 'align-self:end', onclick: async () => { await store.setSetting('master_percent', Number(percentIn.value) || 0); toast('Сохранено'); } }, 'Сохранить')),
    el('p', { class: 'sub' }, 'По этому проценту считается «мой доход». Чаевые прибавляются целиком.'));

  const cats = [...new Set(services.map((s) => s.category))].sort((a, b) => catRank(a) - catRank(b));
  const priceCard = el('div', { class: 'card stack' },
    el('div', { class: 'row between' }, el('h3', {}, 'Прайс'), el('button', { class: 'btn sm', onclick: () => editService(null, cats) }, '+ Услуга')),
    ...cats.map((cat) => el('div', {}, el('div', { class: 'cat-title' }, cat),
      ...services.filter((s) => s.category === cat).map((s) => el('button', { class: 'svc-row' + (s.active ? '' : ' off'), style: 'width:100%;background:none;border-left:0;border-right:0;border-bottom:0;text-align:left', onclick: () => editService(s, cats) },
        el('div', { class: 'n' }, s.name, el('small', {}, fmtDuration(s.duration_min))), el('div', { class: 'p' }, priceRange(s)))))));

  const about = el('div', { class: 'card stack' }, el('h3', {}, 'Как пользоваться'),
    el('p', { class: 'sub' }, 'Каждый визит записывай сразу после клиента: время, услуги, сколько заплатил. Записи наперёд ставь со статусом «Запись», потом закрывай кнопкой «Пришёл». Отмечай начало и конец смены, иначе загрузка не посчитается.'),
    el('p', { class: 'sub' }, 'Раз в неделю сохраняй копию в Excel и отправляй себе в Telegram. Журнал сам напомнит.'));

  root.append(data, percentCard, priceCard, about);
}

function editService(s, cats) {
  const isEdit = !!s;
  const nameIn = el('input', { class: 'input', id: 'sv-name', value: s?.name || '' });
  const catIn = el('input', { class: 'input', id: 'sv-cat', list: 'sv-cats', value: s?.category || '' });
  const dl = el('datalist', { id: 'sv-cats' }, ...cats.map((c) => el('option', { value: c })));
  const minIn = el('input', { class: 'input num', type: 'number', inputmode: 'numeric', id: 'sv-min', value: s?.price_min ?? '' });
  const maxIn = el('input', { class: 'input num', type: 'number', inputmode: 'numeric', id: 'sv-max', value: s?.price_max ?? '', placeholder: 'если вилка' });
  const durIn = el('input', { class: 'input num', type: 'number', inputmode: 'numeric', id: 'sv-dur', value: s?.duration_min ?? 60 });
  const actChk = el('input', { type: 'checkbox', id: 'sv-act', checked: s ? s.active : true });
  const err = el('div', { class: 'error' }); err.hidden = true;
  const body = el('div', { class: 'stack' },
    el('div', { class: 'field' }, el('label', { for: 'sv-name' }, 'Название'), nameIn),
    el('div', { class: 'field' }, el('label', { for: 'sv-cat' }, 'Категория'), catIn, dl),
    el('div', { class: 'three' },
      el('div', { class: 'field' }, el('label', { for: 'sv-min' }, 'Цена от'), minIn),
      el('div', { class: 'field' }, el('label', { for: 'sv-max' }, 'до'), maxIn),
      el('div', { class: 'field' }, el('label', { for: 'sv-dur' }, 'Минут'), durIn)),
    el('label', { class: 'check', for: 'sv-act' }, actChk, 'Показывать в форме визита'), err);
  openSheet({ title: isEdit ? 'Услуга' : 'Новая услуга', body, footer: [el('button', { class: 'btn primary', onclick: async () => {
    const row = { id: s?.id, name: nameIn.value.trim(), category: catIn.value.trim() || 'Другое', price_min: Number(minIn.value) || 0,
      price_max: maxIn.value ? Number(maxIn.value) : null, duration_min: Number(durIn.value) || 60, active: actChk.checked, sort: s?.sort ?? 900 };
    if (!row.name) { err.textContent = 'Название пустое.'; err.hidden = false; return; }
    if (row.price_max != null && row.price_max < row.price_min) { err.textContent = '«До» меньше, чем «от».'; err.hidden = false; return; }
    try { await store.saveService(row); closeSheet(); toast('Сохранено'); refresh(); } catch (e) { err.textContent = 'Не сохранилось: ' + e.message; err.hidden = false; }
  } }, 'Сохранить')] });
}

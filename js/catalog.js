// Константы, общие для форм, статистики и экспорта.
export const SOURCES = ['салон', 'с улицы', 'рекомендация', 'свой', 'соцсети'];
export const STATUS = { PLAN: 'план', DONE: 'выполнено', NOSHOW: 'не пришёл', CANCEL: 'отмена' };
export const STATUS_LABEL = {
  [STATUS.PLAN]: 'Запись', [STATUS.DONE]: 'Выполнено', [STATUS.NOSHOW]: 'Не пришёл', [STATUS.CANCEL]: 'Отмена',
};
export const CATEGORY_ORDER = ['Стрижка', 'Укладка', 'Мытьё и сушка', 'Уход', 'Окрашивание'];
export const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

// Прайс салона (снят с zapis.kz 31.10.2026). Заливается в журнал при первом запуске.
export const PRICE_LIST = [
  { category: 'Стрижка', name: 'Стрижка чёлки', price_min: 2000, price_max: 4000, duration_min: 15, sort: 10 },
  { category: 'Стрижка', name: 'Стрижка женская', price_min: 7000, price_max: null, duration_min: 60, sort: 20 },
  { category: 'Стрижка', name: 'Стрижка для мальчиков до 10 лет', price_min: 3500, price_max: null, duration_min: 60, sort: 30 },
  { category: 'Стрижка', name: 'Женская стрижка (короткая длина)', price_min: 6000, price_max: 8000, duration_min: 60, sort: 40 },
  { category: 'Стрижка', name: 'Стрижка мужская', price_min: 5000, price_max: 6000, duration_min: 60, sort: 50 },
  { category: 'Стрижка', name: 'Женская стрижка. Короткий волос', price_min: 6000, price_max: 7000, duration_min: 60, sort: 60 },
  { category: 'Стрижка', name: 'Стрижка женская (каскад, лесенка)', price_min: 10000, price_max: null, duration_min: 60, sort: 70 },
  { category: 'Стрижка', name: 'Стрижка детская женская от 10 лет', price_min: 5000, price_max: null, duration_min: 60, sort: 80 },
  { category: 'Укладка', name: 'Укладка женская', price_min: 6000, price_max: 10000, duration_min: 60, sort: 110 },
  { category: 'Укладка', name: 'Укладка мужская', price_min: 5000, price_max: 6000, duration_min: 15, sort: 120 },
  { category: 'Укладка', name: 'Биозавивка. Короткий волос', price_min: 10000, price_max: 15000, duration_min: 120, sort: 130 },
  { category: 'Укладка', name: 'Биозавивка. Средний волос', price_min: 22000, price_max: 30000, duration_min: 210, sort: 140 },
  { category: 'Укладка', name: 'Биозавивка. Длинный волос', price_min: 32000, price_max: 35000, duration_min: 270, sort: 150 },
  { category: 'Укладка', name: 'Укладка. Выпрямление', price_min: 6000, price_max: 8000, duration_min: 60, sort: 160 },
  { category: 'Укладка', name: 'Укладка волос (брашинг)', price_min: 8000, price_max: 10000, duration_min: 60, sort: 170 },
  { category: 'Мытьё и сушка', name: 'Мытьё и сушка головы', price_min: 4000, price_max: 5000, duration_min: 30, sort: 210 },
  { category: 'Уход', name: 'SPA уход за волосами', price_min: 12000, price_max: 25000, duration_min: 90, sort: 310 },
  { category: 'Уход', name: 'Пилинг кожи головы', price_min: 7000, price_max: null, duration_min: 60, sort: 320 },
  { category: 'Уход', name: 'Скрабирование головы', price_min: 7000, price_max: 10000, duration_min: 60, sort: 330 },
  { category: 'Окрашивание', name: 'Окрашивание в один тон', price_min: 25000, price_max: 50000, duration_min: 120, sort: 410 },
  { category: 'Окрашивание', name: 'Окрашивание корней', price_min: 18000, price_max: 20000, duration_min: 120, sort: 420 },
  { category: 'Окрашивание', name: 'Тонирование волос / ретушь седины', price_min: 15000, price_max: 25000, duration_min: 60, sort: 430 },
];

/* OCT-184 award medals — one generator for all 32 awards (catalog: «Продукт OCT-180», section 3.3).
 * Anatomy: silhouette = category, metal = rarity, rim mark = rarity (not colour only), glyph = the award's own symbol,
 * plaque = the number when the award is about a count. All colours are tokens (--medal-*, see oct-13/tokens.css)
 * with hex fallbacks, so the same SVG works inline (follows the theme) and as a standalone file.
 * medal(key, {state:'got'|'locked'|'secret', label}) → SVG string, viewBox 0 0 120 120.
 * Node (CommonJS; the repo is ESM, so copy to .cjs first): `node medals.cjs export` writes medals/<key>.svg (+ locked and secret silhouettes). */
(function (root) {
  const CATS = [
    ['path', 'Путь', 'Journey', 'circle'],
    ['streak', 'Серия', 'Streak', 'hexagon'],
    ['days', 'Дни', 'Days', 'squircle'],
    ['months', 'Месяцы', 'Months', 'rosette'],
    ['photo', 'Фото', 'Photo', 'diamond'],
    ['accuracy', 'Точность', 'Accuracy', 'shield'],
    ['secret', 'Секретные', 'Secret', 'star'],
  ];
  const RARITY = {
    c: ['bronze', 'Обычная', 'Common'],
    r: ['silver', 'Редкая', 'Rare'],
    e: ['gold', 'Эпическая', 'Epic'],
    l: ['platinum', 'Легендарная', 'Legendary'],
  };
  /* key, category, rarity, RU, EN, plaque number, glyph, target (progress), RU rule, EN rule, [RU hint, EN hint] */
  const A = (key, cat, rar, ru, en, num, glyph, of, ruleRu, ruleEn, hint) => ({ key, cat, rar, ru, en, num, glyph, of, ruleRu, ruleEn, hint });
  const AWARDS = [
    A('weeks_1', 'path', 'c', 'Первая неделя', 'First week', '', 'sprout', 1, 'Засчитайте первую неделю: 5 дней с записями из 7', 'Get your first week to count: log food on 5 of 7 days'),
    A('weeks_4', 'path', 'c', 'Месяц с дневником', 'A month of logging', '4', 'road', 4, 'Наберите 4 засчитанные недели, не обязательно подряд', 'Get 4 weeks to count, not necessarily in a row'),
    A('weeks_12', 'path', 'r', 'Три месяца', 'Three months', '12', 'hills', 12, 'Наберите 12 засчитанных недель, не обязательно подряд', 'Get 12 weeks to count, not necessarily in a row'),
    A('weeks_26', 'path', 'e', 'Полгода', 'Half a year', '26', 'sunrise', 26, 'Наберите 26 засчитанных недель, не обязательно подряд', 'Get 26 weeks to count, not necessarily in a row'),
    A('weeks_52', 'path', 'e', 'Год с дневником', 'A year of logging', '52', 'tree', 52, 'Наберите 52 засчитанные недели, не обязательно подряд', 'Get 52 weeks to count, not necessarily in a row'),
    A('weeks_104', 'path', 'l', 'Два года', 'Two years', '104', 'peak', 104, 'Наберите 104 засчитанные недели, не обязательно подряд', 'Get 104 weeks to count, not necessarily in a row'),
    A('streak_2', 'streak', 'c', 'Разгон', 'Warming up', '2', 'flame', 2, 'Держите серию 2 недели подряд', 'Keep a 2-week streak'),
    A('streak_8', 'streak', 'r', 'Два месяца подряд', 'Two months straight', '8', 'flames', 8, 'Держите серию 8 недель подряд', 'Keep an 8-week streak'),
    A('streak_16', 'streak', 'e', 'Ровный ритм', 'Steady rhythm', '16', 'rhythm', 16, 'Держите серию 16 недель подряд', 'Keep a 16-week streak'),
    A('streak_26', 'streak', 'e', 'Полгода подряд', 'Half a year straight', '26', 'flameRing', 26, 'Держите серию 26 недель подряд', 'Keep a 26-week streak'),
    A('streak_52', 'streak', 'l', 'Год подряд', 'A year straight', '52', 'crown', 52, 'Держите серию 52 недели подряд', 'Keep a 52-week streak'),
    A('days_1', 'days', 'c', 'Первая запись', 'First entry', '', 'pencil', 1, 'Запишите еду в первый раз', 'Log food for the first time'),
    A('days_30', 'days', 'c', '30 дней', '30 days', '30', 'calendar', 30, 'Запишите еду в 30 разных днях', 'Log food on 30 different days'),
    A('days_100', 'days', 'r', '100 дней', '100 days', '100', 'calCheck', 100, 'Запишите еду в 100 разных днях', 'Log food on 100 different days'),
    A('days_365', 'days', 'e', '365 дней', '365 days', '365', 'orbit', 365, 'Запишите еду в 365 разных днях', 'Log food on 365 different days'),
    A('days_1000', 'days', 'l', '1000 дней', '1,000 days', '1000', 'infinity', 1000, 'Запишите еду в 1000 разных днях', 'Log food on 1,000 different days'),
    A('challenge_1', 'months', 'c', 'Первый челлендж', 'First challenge', '', 'target', 1, 'Выполните любой челлендж месяца', 'Complete any monthly challenge'),
    A('month_3of3', 'months', 'r', 'Все три', 'All three', '', 'stars3', 3, 'Выполните все 3 челленджа в одном месяце', 'Complete all 3 challenges in one month'),
    A('month_3of3_x6', 'months', 'e', 'Полгода челленджей', 'Six perfect months', '×6', 'trophy', 6, 'Выполните все 3 челленджа в 6 месяцах, не обязательно подряд', 'Complete all 3 challenges in 6 months, not necessarily in a row'),
    A('month_full', 'months', 'r', 'Месяц без пропусков', 'A full month', '', 'moon', 1, 'Запишите еду в каждый день одного календарного месяца', 'Log food on every day of a calendar month'),
    A('photo_1', 'photo', 'c', 'Первое фото', 'First photo', '', 'camera', 1, 'Запишите приём пищи по фото', 'Log a meal from a photo'),
    A('photo_100', 'photo', 'r', 'Фотограф', 'Food photographer', '100', 'film', 100, 'Запишите 100 приёмов пищи по фото', 'Log 100 meals from photos'),
    A('photo_500', 'photo', 'e', 'Фотоархив', 'Photo archive', '500', 'album', 500, 'Запишите 500 приёмов пищи по фото', 'Log 500 meals from photos'),
    A('grams_25', 'accuracy', 'c', 'Точные граммы', 'Precise grams', '25', 'kscale', 25, 'Поправьте граммы после распознавания в 25 блюдах', 'Fine-tune grams after recognition on 25 dishes'),
    A('grams_250', 'accuracy', 'e', 'Весы в голове', 'Scale in your head', '250', 'balance', 250, 'Поправьте граммы после распознавания в 250 блюдах', 'Fine-tune grams after recognition on 250 dishes'),
    A('manual_25', 'accuracy', 'r', 'Своя кухня', 'Your own kitchen', '25', 'chef', 25, 'Введите вручную с БЖУ 25 своих блюд', 'Add 25 of your own dishes by hand with macros'),
    A('secret_comeback', 'secret', 'r', 'С возвращением', 'Welcome back', '', 'comeback', 1, 'Вернитесь к дневнику после паузы в 4 недели или дольше', 'Come back to your log after a break of 4 weeks or more', ['Иногда главное — вернуться', 'Sometimes the main thing is coming back']),
    A('secret_birthday', 'secret', 'r', 'С днём рождения', 'Happy birthday', '', 'cake', 1, 'Запишите еду в свой день рождения', 'Log food on your birthday', ['Особенный день в году', 'A special day of the year']),
    A('secret_new_year', 'secret', 'c', 'Первый день года', 'First day of the year', '', 'firework', 1, 'Запишите еду 1 января', 'Log food on January 1', ['Начните год с дневника', 'Start the year with your log']),
    A('secret_freeze', 'secret', 'c', 'Под защитой', 'Covered', '', 'shieldSnow', 1, 'Заморозка впервые сохранила вашу серию', 'A freeze saved your streak for the first time', ['Плохая неделя — не повод сдаваться', 'A rough week isn’t a reason to quit']),
    A('secret_backfill', 'secret', 'c', 'Ничего не забыто', 'Nothing missed', '', 'rewind', 1, 'Дописанный задним числом день засчитал прошлую неделю', 'A day you filled in later made a past week count', ['Прошлое тоже можно дописать', 'The past can be filled in too']),
    A('secret_days_100_row', 'secret', 'e', 'Сто дней подряд', '100 days in a row', '100', 'chain', 100, 'Записывайте еду 100 дней подряд без пропусков', 'Log food 100 days in a row', ['Очень длинная цепочка', 'A very long chain']),
  ];

  /* glyphs: 24×24 stroke icons (round caps); `F` marks a filled shape */
  const F = 'fill="currentColor" stroke="none"';
  const star = (cx, cy, r) => { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; d += (i ? 'L' : 'M') + (cx + rr * Math.cos(a)).toFixed(2) + ',' + (cy + rr * Math.sin(a)).toFixed(2); } return d + 'Z'; };
  const flame = 'M12 21.5c-3.9 0-6.5-2.7-6.5-6.3 0-4.2 4-6.2 4.4-11.2 2.6 1.7 4.6 4.2 5 7 .9-.7 1.5-1.8 1.6-3.2 1.6 1.6 2.5 4.4 2.5 7.3 0 3.7-2.9 6.4-7 6.4z';
  const G = {
    sprout: '<path d="M12 21v-8.5"/><path d="M12 13C12 9 9.5 6.5 5 6.5 5 10.5 7.5 13 12 13z"/><path d="M12 10.5c0-3.8 2.5-6.5 7-6.5 0 4-2.5 6.5-7 6.5z"/><path d="M8 21h8"/>',
    road: '<path d="M7 21c0-4.5 10-3.5 10-8.5S9 8.5 9 4.5"/><path d="M9 2.5v6"/><path d="M9 2.8h5.5l-1.4 1.6 1.4 1.6H9"/>',
    hills: '<path d="M2 19.5 8.5 9l4 6 2.8-3.8 6.7 8.3z"/><path d="M6.4 12.4 8.5 14l2-1.6"/>',
    sunrise: '<path d="M2.5 18.5h19"/><path d="M6 18.5a6 6 0 0 1 12 0"/><path d="M12 5v3"/><path d="m4.9 9.4 2.1 2.1"/><path d="m19.1 9.4-2.1 2.1"/><path d="M6 21.5h12"/>',
    tree: '<path d="M12 22v-5"/><path d="M12 2.5 18 10h-3l4 6H5l4-6H6z"/>',
    peak: '<path d="M1.5 21 10 7.5l3.2 5 2.3-3.3L22.5 21z"/><path d="M10 7.5V2"/><path d="M10 2.3h5l-1.2 1.5 1.2 1.5h-5"/>',
    flame: `<path d="${flame}"/>`,
    flames: '<path d="M8.5 21.5c-3 0-5-2-5-4.8 0-3.2 3-4.7 3.4-8.5 2 1.3 3.4 3.4 3.7 5.6"/><path d="M15 21.5c-3.3 0-5.5-2.3-5.5-5.3 0-3.6 3.4-5.3 3.7-9.7 2.2 1.4 3.9 3.6 4.2 6 .8-.6 1.3-1.5 1.4-2.7 1.4 1.4 2.2 3.8 2.2 6.3 0 3.1-2.5 5.4-6 5.4z"/>',
    rhythm: '<path d="M2.5 20c1.6-1.6 3.2-1.6 4.8 0s3.2 1.6 4.7 0 3.2-1.6 4.8 0 3.1 1.6 4.7 0"/><path d="M12 16c-2.6 0-4.3-1.8-4.3-4.2 0-2.8 2.7-4.1 2.9-7.4 1.8 1.1 3.1 2.8 3.4 4.7.6-.5 1-1.2 1.1-2.1 1.1 1.1 1.7 2.9 1.7 4.8 0 2.4-1.9 4.2-4.8 4.2z"/>',
    flameRing: '<circle cx="12" cy="12" r="10"/><path d="M12 18c-2.6 0-4.3-1.8-4.3-4.2 0-2.8 2.7-4.1 2.9-7.4 1.8 1.1 3.1 2.8 3.4 4.7.6-.5 1-1.2 1.1-2.1 1.1 1.1 1.7 2.9 1.7 4.8 0 2.4-1.9 4.2-4.8 4.2z"/>',
    crown: '<path d="M3.5 18.5 2.5 7.5l5.2 4.3L12 4.5l4.3 7.3 5.2-4.3-1 11z"/><path d="M4 21.5h16"/><circle cx="12" cy="14.5" r="1.3" ' + F + '/>',
    pencil: '<path d="M4 20.5 5.2 16 16 5.2a2.3 2.3 0 0 1 3.3 3.3L8.5 19.3z"/><path d="m14 7.2 3.3 3.3"/><path d="M13 21h7"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17"/><path d="M8 3v4M16 3v4"/><circle cx="8.5" cy="14" r="1" ' + F + '/><circle cx="12" cy="14" r="1" ' + F + '/><circle cx="15.5" cy="14" r="1" ' + F + '/><circle cx="8.5" cy="17.5" r="1" ' + F + '/><circle cx="12" cy="17.5" r="1" ' + F + '/>',
    calCheck: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17"/><path d="M8 3v4M16 3v4"/><path d="m8.5 15.2 2.4 2.4 4.6-4.6"/>',
    orbit: '<circle cx="12" cy="12" r="3.6" ' + F + '/><ellipse cx="12" cy="12" rx="10" ry="4.6" transform="rotate(-20 12 12)"/><circle cx="20.2" cy="7.6" r="1.6" ' + F + '/>',
    infinity: '<path d="M12 12c-2.2-3.2-4.2-4.5-6.3-4.5a4.5 4.5 0 0 0 0 9c2.1 0 4.1-1.3 6.3-4.5s4.2-4.5 6.3-4.5a4.5 4.5 0 0 1 0 9c-2.1 0-4.1-1.3-6.3-4.5z"/>',
    target: '<circle cx="11" cy="13" r="8.5"/><circle cx="11" cy="13" r="4.5"/><circle cx="11" cy="13" r="1.3" ' + F + '/><path d="m11 13 9-9"/><path d="M16.5 3.5H20v3.5"/>',
    stars3: `<path d="${star(12, 7.5, 5.6)}" ${F}/><path d="${star(5.8, 16.5, 4.6)}" ${F}/><path d="${star(18.2, 16.5, 4.6)}" ${F}/>`,
    trophy: '<path d="M7 3.5h10v5.5a5 5 0 0 1-10 0z"/><path d="M7 5.5H4.2a3.2 3.2 0 0 0 3.2 4.3M17 5.5h2.8a3.2 3.2 0 0 1-3.2 4.3"/><path d="M12 14v3.5"/><path d="M8 21h8"/><path d="M9.5 17.5h5V21h-5z"/>',
    moon: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="9.5" r="2" ' + F + ' opacity=".55"/><circle cx="14.8" cy="14.5" r="2.6" ' + F + ' opacity=".55"/><circle cx="14.5" cy="7.6" r="1.1" ' + F + ' opacity=".55"/>',
    camera: '<path d="M3 8.5h4l1.8-3h6.4l1.8 3h4V20H3z"/><circle cx="12" cy="13.8" r="3.6"/><circle cx="17.6" cy="11" r=".9" ' + F + '/>',
    film: '<rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M8 2.5v19M16 2.5v19"/><path d="M4 7h4M4 12h4M4 17h4M16 7h4M16 12h4M16 17h4"/>',
    album: '<path d="M3.5 17V4.5a1.5 1.5 0 0 1 1.5-1.5h12"/><rect x="6.5" y="6" width="14.5" height="15" rx="1.8"/><path d="m6.5 18 4.3-4.6 3 3 2.2-2.2 5 4.8"/><circle cx="16.8" cy="10" r="1.4" ' + F + '/>',
    kscale: '<path d="M4.5 8h15a7.5 4.5 0 0 1-15 0z"/><path d="M12 12.5V14"/><rect x="3.5" y="14" width="17" height="7" rx="2"/><circle cx="12" cy="17.5" r="1.8"/>',
    balance: '<path d="M12 3.5v17"/><path d="M8 20.5h8"/><path d="M4.5 7h15"/><path d="M4.5 7 1.8 13.5a2.7 2.7 0 0 0 5.4 0z"/><path d="m19.5 7-2.7 6.5a2.7 2.7 0 0 0 5.4 0z"/><circle cx="12" cy="3.5" r="1.3" ' + F + '/>',
    chef: '<path d="M7 14.5a4 4 0 1 1 1.6-7.7 4 4 0 0 1 6.8 0A4 4 0 1 1 17 14.5"/><path d="M7 13v7.5h10V13"/><path d="M7 17.5h10"/>',
    comeback: '<path d="M9.5 4 4.5 9l5 5"/><path d="M4.5 9H14a6 6 0 0 1 0 12h-3"/>',
    cake: '<path d="M3.5 21h17"/><path d="M5 21v-7.5h14V21"/><path d="M5 16.5c2.3 1.5 4.7 1.5 7 0s4.7-1.5 7 0"/><path d="M12 13.5v-3"/><path d="M12 8c-1.2-1-1.2-2.4 0-4 1.2 1.6 1.2 3 0 4z" ' + F + '/>',
    firework: '<path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8"/><circle cx="12" cy="12" r="2.2" ' + F + '/>',
    shieldSnow: '<path d="M12 2.5 20 5.5V12c0 5-3.5 8.3-8 9.5C7.5 20.3 4 17 4 12V5.5z"/><path d="M12 7.5v8M8.5 9.5l7 4M15.5 9.5l-7 4"/>',
    rewind: '<path d="M3.5 12a8.5 8.5 0 1 0 2.7-6.2"/><path d="M3.5 3.5v5h5"/><path d="M12 7.5V12l3 2"/>',
    chain: '<path d="M10.2 13.8a4 4 0 0 1 0-5.6l2.9-2.9a4 4 0 0 1 5.6 5.6l-1.5 1.5"/><path d="M13.8 10.2a4 4 0 0 1 0 5.6l-2.9 2.9a4 4 0 0 1-5.6-5.6l1.5-1.5"/>',
    question: '<path d="M8.8 8.6a3.3 3.3 0 0 1 6.4 1.1c0 2.2-3.2 2.7-3.2 5"/><circle cx="12" cy="19" r="1.3" ' + F + '/>',
  };

  /* silhouettes around (0,0), outer radius ≈ 50 */
  const roundPoly = (pts, r) => {
    let d = '';
    pts.forEach((p, i) => {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
      const u = (q) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy), k = Math.min(r, l / 2) / l; return [p[0] + dx * k, p[1] + dy * k]; };
      const s = u(a), e = u(b);
      d += (i ? 'L' : 'M') + s[0].toFixed(2) + ',' + s[1].toFixed(2) + 'Q' + p[0].toFixed(2) + ',' + p[1].toFixed(2) + ' ' + e[0].toFixed(2) + ',' + e[1].toFixed(2);
    });
    return d + 'Z';
  };
  const ring = (n, r1, r2, rot = -Math.PI / 2) => Array.from({ length: n * (r2 ? 2 : 1) }, (_, i) => { const a = rot + i * Math.PI * 2 / (n * (r2 ? 2 : 1)), r = r2 && i % 2 ? r2 : r1; return [r * Math.cos(a), r * Math.sin(a)]; });
  const SHAPE = {
    circle: 'M0,-50A50,50 0 1 1 0,50A50,50 0 1 1 0,-50Z',
    hexagon: roundPoly(ring(6, 53), 12),
    squircle: roundPoly([[-45, -45], [45, -45], [45, 45], [-45, 45]], 22),
    rosette: roundPoly(ring(14, 53, 46.5), 3.2),
    diamond: roundPoly(ring(4, 56), 16),
    shield: 'M0,-52C16,-44 30,-44 44,-46C45,-20 46,8 38,24C30,40 16,48 0,54C-16,48 -30,40 -38,24C-46,8 -45,-20 -44,-46C-30,-44 -16,-44 0,-52Z',
    star: roundPoly(ring(8, 55, 44, -Math.PI / 2), 4),
  };

  const v = (name, fb) => `var(--${name}, ${fb})`;
  const FB = {
    'medal-bronze-hi': '#F3CFA6', 'medal-bronze-base': '#C98A52', 'medal-bronze-deep': '#8C5426',
    'medal-silver-hi': '#FBFCFD', 'medal-silver-base': '#C3CBD3', 'medal-silver-deep': '#66727E',
    'medal-gold-hi': '#FFEDB0', 'medal-gold-base': '#E6B543', 'medal-gold-deep': '#9A6E10',
    'medal-platinum-hi': '#F4F2FF', 'medal-platinum-base': '#BDB8E8', 'medal-platinum-deep': '#5F58A6',
    'medal-enamel-path': '#E3F4E8', 'medal-ink-path': '#22704A', 'medal-enamel-streak': '#FFE9DA', 'medal-ink-streak': '#A8410A',
    'medal-enamel-days': '#E4EEFC', 'medal-ink-days': '#23589E', 'medal-enamel-months': '#F0E7FB', 'medal-ink-months': '#6A3FA3',
    'medal-enamel-photo': '#FCE6EE', 'medal-ink-photo': '#A3325E', 'medal-enamel-accuracy': '#DFF3F1', 'medal-ink-accuracy': '#186E66',
    'medal-enamel-secret': '#2D2848', 'medal-ink-secret': '#F3E3A6', 'medal-plaque-text': '#FFFFFF', 'medal-shine': 'rgb(255 255 255 / 0.55)',
    'medal-locked-fill': '#F1F4F2', 'medal-locked-line': '#7C8782',
  };
  const t = (name) => v(name, FB[name]);
  const BY = Object.fromEntries(AWARDS.map((a) => [a.key, a]));

  function medal(key, { state = 'got', label = '' } = {}) {
    const a = BY[key];
    const secret = state === 'secret';
    const locked = state !== 'got';
    const cat = secret ? 'secret' : a.cat;
    const shape = SHAPE[CATS.find((c) => c[0] === cat)[3]];
    const metal = RARITY[a.rar][0];
    const rar = secret ? 'c' : a.rar;
    const id = `m-${metal}`;
    const hi = locked ? t('medal-locked-fill') : t(`medal-${metal}-hi`);
    const base = locked ? t('medal-locked-fill') : t(`medal-${metal}-base`);
    const deep = locked ? t('medal-locked-line') : t(`medal-${metal}-deep`);
    const enamel = locked ? 'none' : t(`medal-enamel-${cat}`);
    const ink = locked ? t('medal-locked-line') : t(`medal-ink-${cat}`);
    const outerFill = locked ? t('medal-locked-fill') : `url(#${id})`;
    const num = secret ? '' : a.num;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" class="medal ${locked ? 'is-locked' : ''}" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>`;
    if (!locked) s += `<defs><linearGradient id="${id}" x1="20" y1="10" x2="100" y2="110" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:${hi}"/><stop offset=".45" style="stop-color:${base}"/><stop offset="1" style="stop-color:${deep}"/></linearGradient></defs>`;
    s += '<g transform="translate(60 60)">';
    if (rar === 'l') /* legendary: rays behind the medal */
      s += `<g style="fill:${locked ? t('medal-locked-line') : base}" ${locked ? 'opacity=".45"' : ''}>${Array.from({ length: 16 }, (_, i) => `<path d="M-3,-50L0,-59L3,-50Z" transform="rotate(${i * 22.5 + 11.25})"/>`).join('')}</g>`;
    s += `<path d="${shape}" style="fill:${outerFill};stroke:${deep}" stroke-width="1.6"${locked ? ' stroke-dasharray="4 3"' : ''}/>`;
    if (!locked) s += `<path d="${shape}" transform="scale(.93)" fill="none" style="stroke:${t('medal-shine')}" stroke-width="1.6" stroke-dasharray="70 400" stroke-dashoffset="-150" stroke-linecap="round"/>`;
    /* rarity rim mark: rare = engraved line, epic/legendary = beads */
    if (rar === 'r') s += `<path d="${shape}" transform="scale(.86)" fill="none" style="stroke:${deep}" stroke-width="1.4" opacity=".75"/>`;
    if (rar === 'e' || rar === 'l') s += `<path d="${shape}" transform="scale(.865)" fill="none" style="stroke:${locked ? deep : hi}" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="0 7.2"${locked ? ' opacity=".7"' : ''}/>`;
    s += `<path d="${shape}" transform="scale(.74)" style="fill:${enamel};stroke:${deep}" stroke-width="2.2"/>`;
    const gk = num ? 1.75 : 1.95, gy = num ? -26 : -12 * gk;
    s += `<g transform="translate(${-12 * gk} ${gy}) scale(${gk})" fill="none" style="stroke:${ink};color:${ink}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"${locked && !secret ? ' opacity=".8"' : ''}>${G[secret ? 'question' : a.glyph]}</g>`;
    if (num) {
      const w = num.length * 8.6 + 14;
      s += `<rect x="${-w / 2}" y="21" width="${w}" height="19" rx="9.5" style="fill:${locked ? t('medal-locked-fill') : deep};stroke:${locked ? deep : 'none'}" stroke-width="1.4"/>`;
      s += `<text x="0" y="35" text-anchor="middle" font-family="-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" style="fill:${locked ? deep : t('medal-plaque-text')}">${num}</text>`;
    }
    return s + '</g></svg>';
  }

  const api = { CATS, RARITY, AWARDS, BY, medal };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    if (require.main === module && process.argv[2] === 'export') {
      const fs = require('fs'), path = require('path'), dir = path.join(__dirname, 'medals');
      fs.mkdirSync(dir, { recursive: true });
      for (const a of AWARDS) {
        fs.writeFileSync(path.join(dir, `${a.key}.svg`), medal(a.key) + '\n');
        fs.writeFileSync(path.join(dir, `${a.key}.locked.svg`), medal(a.key, { state: a.cat === 'secret' ? 'secret' : 'locked' }) + '\n');
      }
      console.log('wrote', AWARDS.length * 2, 'files to', dir);
    }
  } else root.OCTMedals = api;
})(typeof window !== 'undefined' ? window : globalThis);

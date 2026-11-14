import type { DeepPartial } from '../translate';
import type { en } from './en';

const ru: DeepPartial<typeof en> = {
  common: {
    appName: 'OpenCalorieTracker',
    loading: 'Загрузка…',
    close: 'Закрыть',
    cancel: 'Отмена',
    got_it: 'Понятно',
    retry: 'Повторить',
    tryAgainIn: {
      one: 'Повторите через {count} минуту',
      few: 'Повторите через {count} минуты',
      many: 'Повторите через {count} минут',
      other: 'Повторите через {count} минуты',
    },
  },
  screens: {
    login: 'Вход',
    invite: 'Принять приглашение',
    recover: 'Восстановление доступа',
    register: 'Регистрация',
  },
  auth: {
    email: 'Email',
    email_ph: 'name@example.com',
    password: 'Пароль',
    show_password: 'Показать пароль',
    hide_password: 'Скрыть пароль',
    passkey: 'Войти с passkey',
    or_password: 'или по паролю',
    submit: 'Войти',
    loading: 'Входим…',
    forgot: 'Забыли пароль?',
    lost_access: 'Потеряли доступ?',
    no_account: 'Нет аккаунта?',
    create: 'Создать аккаунт',
    session_expired: 'Сессия истекла, войдите снова',
    offline: 'Для входа нужно подключение к интернету',
    err: {
      timeout: {
        title: 'Слишком много попыток',
        body: 'Вход по паролю с этого устройства откроется через {n} мин. Passkey работает.',
      },
      blocked: {
        title: 'Вход по паролю с этого устройства заблокирован',
        body: 'Попросите администратора снять блокировку. Passkey работает.',
      },
      no_passkey: {
        title: 'Нет passkey на этом устройстве',
        body_password: 'Войдите по паролю или с устройства, где есть passkey.',
        body_passkey_only:
          'Войдите с устройства, где он есть, или попросите администратора прислать ссылку для восстановления.',
      },
      passkey_revoked:
        'Этот passkey больше не действует. Войдите другим способом.',
    },
    forgot_sheet: {
      title: 'Забыли пароль?',
      body: 'Приложение не отправляет письма. Попросите администратора этой установки прислать вам ссылку для восстановления — по ней можно задать новый пароль или создать passkey. Дневник сохранится.',
    },
  },
  setup: {
    wrong_origin: {
      title: 'Откройте приложение по его адресу',
      body: 'Вход по passkey работает только по адресу, заданному при установке.',
      cta: 'Открыть {host}',
    },
    not_configured: {
      title: 'Установка не настроена',
      admin:
        'Задайте администратора в конфигурации контейнера. Подробности — в README.',
      url: 'Задайте PUBLIC_URL в конфигурации контейнера. Подробности — в README.',
    },
  },
  settings: { logout: 'Выйти' },
  logout: {
    confirm: {
      title: 'Выйти из аккаунта?',
      body_unsaved: 'Несохранённые изменения пропадут.',
    },
  },
  link_ready: { share: 'Поделиться', copied: 'Ссылка скопирована' },
  reg: {
    name: 'Как вас зовут',
    method: { title: 'Способ входа', passkey: 'Passkey', password: 'Пароль' },
  },
  form: { err: { email: 'Введите email, например name@example.com' } },
  pw: {
    rule: {
      length: 'От {min} символов',
      letter_digit: 'Буква и цифра',
      symbol: 'Символ, например ! - _ или пробел',
      not_email: 'Не совпадает с email',
    },
  },
  offline: {
    bar: 'Офлайн · данные на {time}',
    no_network: 'Нет сети',
    server_down: 'Сервер недоступен',
  },
  nav: {
    main: 'Главное меню',
    today: 'Сегодня',
    diary: 'Дневник',
    week: 'Неделя',
    profile: 'Профиль',
    settings: 'Настройки',
    add_food: 'Добавить еду',
    take_photo: 'Сфотографировать еду',
  },
  update: {
    stale: 'Приложение обновилось · сохраните ещё раз',
  },
  errors: {
    validation_failed: 'Проверьте отмеченные поля',
    unauthenticated: 'Войдите в аккаунт',
    invalid_credentials: 'Неверный email или пароль',
    method_disabled: 'Этот способ входа отключён на сервере',
    passkey_unknown: 'Этот passkey не зарегистрирован на этом сервере',
    passkey_failed: 'Не удалось проверить passkey. Попробуйте ещё раз',
    last_sign_in_method: 'Нельзя удалить единственный способ входа',
    password_invalid: 'Пароль не соответствует правилам',
    password_too_common: 'Этот пароль слишком распространён. Выберите другой',
    forbidden: 'Нет доступа',
    not_found: 'Не найдено',
    email_taken: 'Эта почта уже зарегистрирована',
    invite_used: 'Это приглашение уже использовано',
    invite_invalid: 'Ссылка недействительна или отозвана',
    invite_expired: 'Срок действия ссылки истёк',
    registration_failed: 'Не удалось создать аккаунт с этими данными',
    too_many_attempts: 'Слишком много попыток. Повторите позже',
    device_blocked: 'Вход с этого устройства временно заблокирован',
    ip_blocked: 'Вход из этой сети временно заблокирован',
    not_configured: 'Эта функция не настроена на сервере',
    ai_not_configured: 'Распознавание ИИ не настроено. Введите блюдо вручную',
    ai_no_vision: 'Настроенная модель ИИ не умеет читать фото',
    ai_quota_exceeded: 'Лимит ИИ-провайдера исчерпан. Повторите позже',
    ai_unavailable: 'ИИ-провайдер недоступен. Повторите позже',
    ai_invalid_response: 'ИИ вернул непонятный ответ. Попробуйте ещё раз',
    photo_too_large: 'Фото слишком большое',
    photo_invalid: 'Не удалось прочитать файл как фото',
    client_outdated: 'Приложение обновилось. Сохраните ещё раз',
    photo_expired: 'Полное фото уже удалено. Сделайте новое',
    payload_too_large: 'Запрос слишком большой',
    photo_in_use: 'Это фото уже прикреплено к другой записи',
    agent_not_ready: 'Сначала дойдите до сводки',
    agent_closed: 'Этот диалог закрыт. Заполните форму или начните заново',
    cannot_delete_self: 'Нельзя удалить собственную учётную запись',
    internal: 'Что-то пошло не так. Попробуйте ещё раз',
  },
};

export default ru;

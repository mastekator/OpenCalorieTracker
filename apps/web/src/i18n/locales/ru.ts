import type { DeepPartial } from '../translate';
import type { en } from './en';

const ru: DeepPartial<typeof en> = {
  common: {
    appName: 'OpenCalorieTracker',
    loading: 'Загрузка…',
    tryAgainIn: {
      one: 'Повторите через {count} минуту',
      few: 'Повторите через {count} минуты',
      many: 'Повторите через {count} минут',
      other: 'Повторите через {count} минуты',
    },
  },
  screens: {
    home: 'Сегодня',
    login: 'Вход',
    invite: 'Принять приглашение',
    recover: 'Восстановление доступа',
    register: 'Регистрация',
  },
  update: {
    stale: 'Приложение обновилось · сохраните ещё раз',
  },
  errors: {
    validation_failed: 'Проверьте отмеченные поля',
    unauthenticated: 'Войдите в аккаунт',
    invalid_credentials: 'Неверная почта или пароль',
    method_disabled: 'Этот способ входа отключён на сервере',
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
    photo_in_use: 'Это фото уже прикреплено к другой записи',
    internal: 'Что-то пошло не так. Попробуйте ещё раз',
  },
};

export default ru;

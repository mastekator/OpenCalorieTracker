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
  errors: {
    validation_failed: 'Проверьте отмеченные поля',
    unauthenticated: 'Войдите в аккаунт',
    invalid_credentials: 'Неверная почта или пароль',
    forbidden: 'Нет доступа',
    not_found: 'Не найдено',
    email_taken: 'Эта почта уже зарегистрирована',
    invite_used: 'Это приглашение уже использовано',
    too_many_attempts: 'Слишком много попыток. Повторите позже',
    device_blocked: 'Вход с этого устройства временно заблокирован',
    ip_blocked: 'Вход из этой сети временно заблокирован',
    not_configured: 'Эта функция не настроена на сервере',
    ai_not_configured: 'Распознавание ИИ не настроено. Введите блюдо вручную',
    ai_no_vision: 'Настроенная модель ИИ не умеет читать фото',
    ai_quota_exceeded: 'Лимит ИИ-провайдера исчерпан. Повторите позже',
    ai_unavailable: 'ИИ-провайдер недоступен. Повторите позже',
    ai_invalid_response: 'ИИ вернул непонятный ответ. Попробуйте ещё раз',
    internal: 'Что-то пошло не так. Попробуйте ещё раз',
  },
};

export default ru;

import { I18nProvider } from '../i18n';
import { ToastProvider } from '../ui/Toast/Toast';
import { Routes } from './routes';
import { SessionProvider } from './SessionContext';

export function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <SessionProvider>
          <Routes />
        </SessionProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

import { I18nProvider } from '../i18n';
import { ToastProvider } from '../ui/Toast/Toast';
import { ConfigProvider } from './ConfigContext';
import { Routes } from './routes';
import { SessionProvider } from './SessionContext';

export function App() {
  return (
    <I18nProvider>
      <ConfigProvider>
        <ToastProvider>
          <SessionProvider>
            <Routes />
          </SessionProvider>
        </ToastProvider>
      </ConfigProvider>
    </I18nProvider>
  );
}

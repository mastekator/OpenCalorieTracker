import { I18nProvider } from '../i18n';
import { ToastProvider } from '../ui/Toast/Toast';
import { ConfigProvider } from './ConfigContext';
import { Routes } from './routes';

export function App() {
  return (
    <I18nProvider>
      <ConfigProvider>
        <ToastProvider>
          <Routes />
        </ToastProvider>
      </ConfigProvider>
    </I18nProvider>
  );
}

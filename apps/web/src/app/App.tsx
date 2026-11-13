import { I18nProvider } from '../i18n';
import { ConfigProvider } from './ConfigContext';
import { Routes } from './routes';

export function App() {
  return (
    <I18nProvider>
      <ConfigProvider>
        <Routes />
      </ConfigProvider>
    </I18nProvider>
  );
}

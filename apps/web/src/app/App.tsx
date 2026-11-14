import { I18nProvider } from '../i18n';
import { ToastProvider } from '../ui/Toast/Toast';
import { LeaveGuard } from './LeaveGuard';
import { Routes } from './routes';
import { SessionProvider } from './SessionContext';

export function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <LeaveGuard>
          <SessionProvider>
            <Routes />
          </SessionProvider>
        </LeaveGuard>
      </ToastProvider>
    </I18nProvider>
  );
}

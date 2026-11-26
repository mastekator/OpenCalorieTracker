import { AiConsentProvider } from '../features/ai/AiConsent';
import { I18nProvider } from '../i18n';
import { Splash } from '../ui/Splash/Splash';
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
            <AiConsentProvider>
              <Routes />
            </AiConsentProvider>
          </SessionProvider>
        </LeaveGuard>
      </ToastProvider>
      {/* Once per page load: App never remounts on navigation. */}
      <Splash />
    </I18nProvider>
  );
}

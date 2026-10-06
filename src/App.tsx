import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { CONFIG } from './config';
import { ToastProvider } from './components/ui';
import { SCREENS, enabledScreens } from './screens/registry';
import { AppShell } from './shell/AppShell';
import { Login } from './shell/Login';
import { ThemeProvider } from './shell/theme';
import { AppStoreProvider, useStore } from './store/AppStore';

/** Hash routing so the single-file build works from file:// with no server. */
export default function App() {
  return (
    <ThemeProvider>
      <AppStoreProvider>
        <HashRouter>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </HashRouter>
      </AppStoreProvider>
    </ThemeProvider>
  );
}

function AppRoutes() {
  const { state } = useStore();
  const screens = enabledScreens();
  const home = CONFIG.screens[CONFIG.homeScreen].enabled ? CONFIG.homeScreen : screens[0];
  if (!state.session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  return (
    <AppShell>
      <Routes>
        {screens.map((id) => {
          const Screen = SCREENS[id].component;
          return <Route key={id} path={SCREENS[id].path} element={<Screen />} />;
        })}
        <Route path="*" element={<Navigate to={SCREENS[home].path} replace />} />
      </Routes>
    </AppShell>
  );
}

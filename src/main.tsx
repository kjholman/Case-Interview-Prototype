import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CONFIG } from './config';
import './index.css';

// Accent color from config → CSS variables used by Tailwind's `accent` color.
const root = document.documentElement.style;
root.setProperty('--accent-light', CONFIG.accent.base);
root.setProperty('--accent-strong-light', CONFIG.accent.strong);
root.setProperty('--accent-soft-light', CONFIG.accent.soft);
root.setProperty('--accent-dark', CONFIG.accent.baseDark);
root.setProperty('--accent-strong-dark', CONFIG.accent.strongDark);
root.setProperty('--accent-soft-dark', CONFIG.accent.softDark);
document.title = `${CONFIG.brand.name} · ${CONFIG.productName}`;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

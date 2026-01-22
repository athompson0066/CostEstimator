import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AIWidget from './components/AIWidget';
import { BusinessConfig } from './types';

const safeBase64Decode = (str: string) => {
  try {
    const decoded = atob(str);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch (e) {
    console.error("Base64 decode error:", e);
    return null;
  }
};

const initApp = () => {
  const rootElement = document.getElementById('root');

  if (!rootElement) {
    console.error("Critical Error: Root element '#root' not found.");
    return;
  }

  const root = ReactDOM.createRoot(rootElement);
  
  const urlParams = new URLSearchParams(window.location.search);
  const configParam = urlParams.get('config');
  const isWidgetMode = urlParams.get('widget') === 'true';

  let config: BusinessConfig | null = (window as any).ESTIMATE_AI_CONFIG || null;
  
  if (configParam) {
    const decoded = safeBase64Decode(configParam);
    if (decoded) {
      try {
        config = JSON.parse(decoded);
      } catch (e) {
        console.error("JSON parse error for config:", e);
      }
    }
  }

  const isWidgetOnly = (window as any).ESTIMATE_AI_WIDGET_ONLY === true || isWidgetMode;

  if (isWidgetOnly && config) {
    document.body.classList.add('widget-mode');
    root.render(
      <React.StrictMode>
        <AIWidget config={config} />
      </React.StrictMode>
    );
  } else {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
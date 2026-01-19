
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AIWidget from './components/AIWidget';
import { BusinessConfig } from './types';

const initApp = () => {
  let rootElement = document.getElementById('estimate-ai-root') || document.getElementById('root');

  if (!rootElement) {
    rootElement = document.createElement('div');
    rootElement.id = 'estimate-ai-root';
    document.body.appendChild(rootElement);
  }

  const root = ReactDOM.createRoot(rootElement);
  
  // URL Parameter Detection for Iframe Support
  const urlParams = new URLSearchParams(window.location.search);
  const configParam = urlParams.get('config');
  const isWidgetMode = urlParams.get('widget') === 'true';

  let config = (window as any).ESTIMATE_AI_CONFIG as BusinessConfig;
  
  if (configParam) {
    try {
      // Decode base64 configuration from URL
      config = JSON.parse(decodeURIComponent(escape(atob(configParam))));
    } catch (e) {
      console.error("Failed to parse config from URL parameters:", e);
    }
  }

  const isWidgetOnly = (window as any).ESTIMATE_AI_WIDGET_ONLY === true || isWidgetMode;

  if (isWidgetOnly && config) {
    // Enable transparent background for the iframe container
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

// Use DOMContentLoaded to ensure we run after body exists
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
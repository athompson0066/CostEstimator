
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AIWidget from './components/AIWidget';
import { BusinessConfig } from './types';

const rootElement = document.getElementById('root') || document.getElementById('estimate-ai-root');

if (!rootElement) {
  // If no root exists, create one and append to body (useful for automatic script injection)
  const newRoot = document.createElement('div');
  newRoot.id = 'estimate-ai-root';
  document.body.appendChild(newRoot);
  
  const root = ReactDOM.createRoot(newRoot);
  
  // Check if we are in "Widget Only" mode via window global
  const config = (window as any).ESTIMATE_AI_CONFIG as BusinessConfig;
  const isWidgetOnly = (window as any).ESTIMATE_AI_WIDGET_ONLY === true;

  if (isWidgetOnly && config) {
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
} else {
  const root = ReactDOM.createRoot(rootElement);
  
  // Standard app mount
  const isWidgetOnly = (window as any).ESTIMATE_AI_WIDGET_ONLY === true;
  const config = (window as any).ESTIMATE_AI_CONFIG as BusinessConfig;

  if (isWidgetOnly && config) {
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
}

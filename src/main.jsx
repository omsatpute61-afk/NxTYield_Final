import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { FarmDataProvider } from './context/FarmDataContext.jsx'
import './index.css'

// Register Service Worker for PWA & Offline Support
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service Worker registration non-fatal notice:', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FarmDataProvider>
      <App />
    </FarmDataProvider>
  </React.StrictMode>,
)


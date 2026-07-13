import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import FloatingStatus from './components/FloatingStatus';
import ErrorBoundary from './components/ErrorBoundary';
import StartupLoader from './components/StartupLoader';
import './App.css';

const Home = lazy(() => import('./pages/Home'));
const Landing = lazy(() => import('./pages/Landing'));
const Weather = lazy(() => import('./pages/Weather'));
const Crop = lazy(() => import('./pages/Crop'));
const AIInsights = lazy(() => import('./pages/AIInsights'));
const ChatAssistant = lazy(() => import('./pages/ChatAssistant'));
const SystemStatus = lazy(() => import('./pages/SystemStatus'));

function RouteFallback() {
  return (
    <div className="container">
      <div className="panel app-fallback-panel">
        <h2 className="panel-title">Loading view</h2>
        <p className="text-muted">Preparing the dashboard module...</p>
      </div>
    </div>
  );
}

function AppShell() {
  const location = useLocation();
  const isLanding = location.pathname === '/';

  return (
    <div className={`app-container ${isLanding ? 'app-container--landing' : ''}`}>
      <StartupLoader />
      {!isLanding && <Navbar />}
      <main className={`main-content ${isLanding ? 'main-content--landing' : ''}`}>
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/dashboard" element={<Home />} />
              <Route path="/weather" element={<Weather />} />
              <Route path="/crop" element={<Crop />} />
              <Route path="/ai-insights" element={<AIInsights />} />
              <Route path="/chat" element={<ChatAssistant />} />
              <Route path="/system" element={<SystemStatus />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      {!isLanding && <FloatingStatus />}
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}

export default App;

import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Download } from 'lucide-react';
import { useFarmData } from '../context/FarmDataContext';
import ApkDownloadModal from './ApkDownloadModal';
import './Navbar.css';

function Navbar() {
  const location = useLocation();
  const { summary } = useFarmData();
  const [apkModalOpen, setApkModalOpen] = useState(false);

  const isActive = (path) => location.pathname === path;
  const connectionLabel = summary.demoMode
    ? 'Demo Mode On'
    : summary.connected
      ? summary.streamConnected ? 'Connected' : 'Receiving'
      : 'Waiting';
  const farmLabel = summary.demoMode
    ? 'FarmSense Demo'
    : summary.source === 'hardware'
    ? 'Hardware Feed'
    : summary.source === 'demo-hardware'
      ? 'Demo Feed'
      : 'No Sensor Feed';

  return (
    <>
      <nav className="navbar panel">
        <div className="navbar-container">
          {/* Logo Left */}
          <div className="navbar-logo">
            <img className="logo-icon" src="/nxtyield-brand-logo.png" alt="" aria-hidden="true" />
            <span className="logo-text">NxTYield</span>
          </div>

          {/* Center Navigation */}
          <div className="navbar-links">
            <Link to="/dashboard" className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}>Dashboard</Link>
            <Link to="/weather" className={`nav-link ${isActive('/weather') ? 'active' : ''}`}>Weather</Link>
            <Link to="/crop" className={`nav-link ${isActive('/crop') ? 'active' : ''}`}>Crop Plan</Link>
            <Link to="/ai-insights" className={`nav-link ${isActive('/ai-insights') ? 'active' : ''}`}>AI Insights</Link>
            <Link to="/chat" className={`nav-link ${isActive('/chat') ? 'active' : ''}`}>Assistant</Link>
            <Link to="/system" className={`nav-link ${isActive('/system') ? 'active' : ''}`}>System</Link>
          </div>

          {/* Right Side Farm Context & APK download */}
          <div className="navbar-context">
            <button
              type="button"
              className="navbar-apk-btn"
              onClick={() => setApkModalOpen(true)}
              title="Download Android APK"
            >
              <Download size={14} />
              <span>Get APK</span>
            </button>
            <div className="context-item">
              <span className="context-label">FARM</span>
              <span className="context-value data-readout">{farmLabel}</span>
            </div>
            <div className="context-item">
              <span className="context-label">SEASON</span>
              <span className="context-value data-readout text-warning">{summary.season}</span>
            </div>
            <div className={`live-indicator ${summary.demoMode ? 'demo' : ''}`}>
              <div className="pulse-dot"></div>
              <span className="data-readout">{connectionLabel}</span>
            </div>
          </div>
        </div>
      </nav>

      <ApkDownloadModal
        isOpen={apkModalOpen}
        onClose={() => setApkModalOpen(false)}
      />
    </>
  );
}

export default Navbar;

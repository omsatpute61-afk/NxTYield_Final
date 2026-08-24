import { useEffect, useRef, useState } from 'react';
import { Activity, Droplets, CloudSun, Download, Wifi, Sprout, Smartphone, Thermometer, Wind, FlaskConical, Zap } from 'lucide-react';
import DigitalFarmTwin from '../components/DigitalFarmTwin';
import ApkDownloadModal from '../components/ApkDownloadModal';
import { useFarmData } from '../context/FarmDataContext';
import { getRemoteIrrigation, setRemoteIrrigation } from '../lib/api';
import {
  buildAlerts,
  compactValue,
  formatShortTime,
  formatTime,
  healthLabel,
  humidityStatus,
  moistureStatus,
  nutrientStatus,
  phStatus,
  toNumber,
} from '../lib/farmUtils';
import './Home.css';

const sensorDefinitions = [
  {
    id: 'soil-moisture',
    label: 'Soil Moisture',
    field: 'moisture',
    unit: '%',
    icon: Droplets,
    color: 'var(--color-blue)',
    min: 0,
    max: 100,
    target: '40-70%',
    statusFor: moistureStatus,
  },
  {
    id: 'soil-ph',
    label: 'Soil pH',
    field: 'ph',
    unit: 'pH',
    icon: FlaskConical,
    color: 'var(--color-secondary)',
    min: 0,
    max: 14,
    target: '5.5-7.5 pH',
    statusFor: phStatus,
  },
  {
    id: 'atm-temp',
    label: 'Atm. Temperature',
    field: 'air_temperature',
    unit: 'C',
    icon: Thermometer,
    color: 'var(--color-amber)',
    min: 0,
    max: 50,
    target: '18-35 C',
  },
  {
    id: 'pressure',
    label: 'Atm. Pressure',
    field: 'pressure',
    unit: 'hPa',
    icon: Wind,
    color: 'var(--color-secondary)',
    min: 960,
    max: 1040,
    target: '980-1035 hPa',
  },
  {
    id: 'soil-temp',
    label: 'Soil Temperature',
    field: 'soil_temperature',
    unit: 'C',
    icon: Thermometer,
    color: 'var(--color-success)',
    min: 0,
    max: 50,
    target: '18-30 C',
  },
  {
    id: 'nitrogen',
    label: 'Nitrogen (N)',
    field: 'nitrogen',
    unit: 'mg/kg',
    icon: FlaskConical,
    color: 'var(--color-success)',
    min: 0,
    max: 60,
    target: '20-40 mg/kg',
    statusFor: (value) => nutrientStatus('nitrogen', value),
  },
  {
    id: 'phosphorus',
    label: 'Phosphorus (P)',
    field: 'phosphorus',
    unit: 'mg/kg',
    icon: FlaskConical,
    color: 'var(--color-amber)',
    min: 0,
    max: 50,
    target: '12-35 mg/kg',
    statusFor: (value) => nutrientStatus('phosphorus', value),
  },
  {
    id: 'potassium',
    label: 'Potassium (K)',
    field: 'potassium',
    unit: 'mg/kg',
    icon: FlaskConical,
    color: 'var(--color-success)',
    min: 0,
    max: 300,
    target: '150-250 mg/kg',
    statusFor: (value) => nutrientStatus('potassium', value),
  },
  {
    id: 'humidity',
    label: 'Humidity',
    field: 'humidity',
    unit: '%',
    icon: Droplets,
    color: 'var(--color-blue)',
    min: 0,
    max: 100,
    target: '35-90%',
    statusFor: humidityStatus,
  },
];

const remoteIrrigationOptions = [
  { value: false, label: 'Relay', detail: 'Auto logic' },
  { value: true, label: 'Start', detail: 'Pump on' },
];

function buildSensorData(latest) {
  return sensorDefinitions.map((sensor) => {
    const value = latest?.[sensor.field] ?? null;
    const status = sensor.statusFor?.(value) || {
      label: value === null ? 'Waiting' : 'OK',
      status: value === null ? 'warning' : 'success',
    };
    return { ...sensor, value, status: status.status, badgeLabel: status.label };
  });
}

function SensorCard({ sensor }) {
  const numeric = toNumber(sensor.value);
  const hasValue = numeric !== null;
  const pct = hasValue ? ((numeric - sensor.min) / (sensor.max - sensor.min)) * 100 : 0;
  const Icon = sensor.icon;

  return (
    <div className={`sensor-card sensor-${sensor.status}`}>
      <div className="sc-header">
        <div className="sc-icon-wrap" style={{ color: sensor.color }}>
          <Icon size={16} />
        </div>
        <span className="sc-label">{sensor.label}</span>
        <span className={`sc-badge badge badge-${sensor.status}`}>
          {sensor.badgeLabel}
        </span>
      </div>
      <div className="sc-value-row">
        <span className="sc-value" style={{ color: sensor.color }}>{hasValue ? compactValue(numeric, numeric % 1 ? 1 : 0) : '--'}</span>
        <span className="sc-unit">{sensor.unit}</span>
      </div>
      <div className="sc-bar-track">
        <div className="sc-bar-fill" style={{ width: `${Math.max(0, Math.min(pct, 100))}%`, backgroundColor: sensor.color }} />
      </div>
      <span className="sc-target">Target: {sensor.target}</span>
    </div>
  );
}

function DashboardArrivalTransition() {
  return (
    <div className="dashboard-arrival" aria-hidden="true">
      <div className="dashboard-arrival__grid" />
      <div className="dashboard-arrival__scan" />
      <div className="dashboard-arrival__mark">
        <img src="/nxtyield-brand-logo.png" alt="" />
        <span>FarmSense AI online</span>
      </div>
    </div>
  );
}

function Home() {
  const { latest, connected, insights, summary, weather, refreshInsights } = useFarmData();
  const [remoteIrrigation, setRemoteIrrigationState] = useState({ enabled: false, mode: 'relay_logic', updated_at: null });
  const [irrigationLoading, setIrrigationLoading] = useState(false);
  const [irrigationError, setIrrigationError] = useState('');
  const [showArrival, setShowArrival] = useState(false);
  const [apkModalOpen, setApkModalOpen] = useState(false);
  const arrivalRequestedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRemoteIrrigation() {
      try {
        const command = await getRemoteIrrigation();
        if (cancelled) return;
        setRemoteIrrigationState({
          enabled: Boolean(command.enabled),
          mode: command.mode || (command.enabled ? 'remote_on' : 'relay_logic'),
          updated_at: command.updated_at || null,
        });
        setIrrigationError(command.available === false ? command.message || 'Irrigation API not available' : '');
      } catch (error) {
        if (!cancelled) setIrrigationError(error.message || 'Irrigation API not available');
      }
    }

    loadRemoteIrrigation();
    const timer = window.setInterval(loadRemoteIrrigation, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const shouldShowArrival =
      arrivalRequestedRef.current || window.sessionStorage?.getItem('nxtyield-dashboard-arrival') === 'true';

    if (!shouldShowArrival) return undefined;

    arrivalRequestedRef.current = true;
    window.sessionStorage.removeItem('nxtyield-dashboard-arrival');
    setShowArrival(true);
    const timer = window.setTimeout(() => setShowArrival(false), 1320);

    return () => window.clearTimeout(timer);
  }, []);

  async function updateRemoteIrrigation(enabled) {
    setIrrigationLoading(true);
    setIrrigationError('');
    try {
      const command = await setRemoteIrrigation(enabled);
      setRemoteIrrigationState({
        enabled: Boolean(command.enabled),
        mode: command.mode || (command.enabled ? 'remote_on' : 'relay_logic'),
        updated_at: command.updated_at || null,
      });
    } catch (error) {
      setIrrigationError(error.message || 'Irrigation API not available');
    } finally {
      setIrrigationLoading(false);
    }
  }

  function toggleRemoteIrrigation() {
    updateRemoteIrrigation(!remoteIrrigation.enabled);
  }

  function irrigationRemoteStatus(remoteEnabled, irrigationActive) {
    if (remoteEnabled) return 'REMOTE ON';
    if (irrigationActive) return 'RELAY ON';
    return 'RELAY LOGIC';
  }

  function irrigationRemoteDetail(remoteEnabled, irrigationActive, rainDetected, moistureValue) {
    const moisture = toNumber(moistureValue);
    if (irrigationError) return irrigationError;
    if (irrigationLoading) return 'Syncing irrigation command';
    if (remoteEnabled) return 'Pump command active';
    if (rainDetected) return 'Relay logic holding - rain detected';
    if (irrigationActive) return 'Relay logic active from field telemetry';
    if (moisture !== null && moisture < 40) return `Relay logic ready - moisture ${compactValue(moisture)}%`;
    return 'Relay logic monitoring field state';
  }

  const sensorData = buildSensorData(latest);
  const healthScore = summary.healthScore;
  const healthDisplay = healthScore === null ? '--' : `${healthScore}%`;
  const moistureDisplay = compactValue(latest?.moisture);
  const weatherDisplay = weather?.available
    ? weather?.current?.description || 'Available'
    : weather?.message || 'Weather API not available';
  const cropStatus = insights?.crop_health?.status || 'Waiting';
  const networkStatus = connected ? 'UP' : 'WAIT';
  const alerts = buildAlerts(latest, insights, connected);
  const irrigationActive = latest?.irrigation_active === true;
  const rainDetected = latest?.rain_detected === true;
  const remoteIrrigationEnabled = remoteIrrigation.enabled === true;
  const irrigationDisplay = irrigationRemoteStatus(remoteIrrigationEnabled, irrigationActive);
  const irrigationDetail = irrigationRemoteDetail(remoteIrrigationEnabled, irrigationActive, rainDetected, latest?.moisture);

  return (
    <div className={`container page-home ${showArrival ? 'page-home--arriving' : ''}`}>
      {showArrival && <DashboardArrivalTransition />}
      <div className="hud-grid">
        <div className="panel central-hud">
          <div className="panel-header">
            <h2 className="panel-title">Farm Health Overview</h2>
          </div>

          <div className="hud-label-table">
            <div className="hlt-row">
              <Sprout size={13} style={{ color: 'var(--color-success)' }} />
              <span className="hlt-name">Soil Health</span>
              <span className="hlt-val" style={{ color: 'var(--color-success)' }}>{healthDisplay}</span>
            </div>
            <div className="hlt-row">
              <Droplets size={13} style={{ color: 'var(--color-blue)' }} />
              <span className="hlt-name">Moisture</span>
              <span className="hlt-val" style={{ color: 'var(--color-blue)' }}>{moistureDisplay === '--' ? '--' : `${moistureDisplay}%`}</span>
            </div>
            <div className="hlt-row">
              <CloudSun size={13} style={{ color: 'var(--color-amber)' }} />
              <span className="hlt-name">Weather</span>
              <span className="hlt-val" style={{ color: 'var(--color-amber)' }}>{weatherDisplay}</span>
            </div>
            <div className="hlt-row">
              <Activity size={13} style={{ color: 'var(--color-success)' }} />
              <span className="hlt-name">Crop Vigor</span>
              <span className="hlt-val" style={{ color: 'var(--color-success)' }}>{cropStatus}</span>
            </div>
            <div className="hlt-row">
              <Wifi size={13} style={{ color: connected ? 'var(--color-success)' : 'var(--color-amber)' }} />
              <span className="hlt-name">Network</span>
              <span className="hlt-val" style={{ color: connected ? 'var(--color-success)' : 'var(--color-amber)' }}>{networkStatus}</span>
            </div>
          </div>

          <div className="radial-container">
            <svg viewBox="0 0 200 200" className="radial-svg">
              <circle cx="100" cy="100" r="90" fill="none" stroke="var(--border-color)" strokeWidth="1" strokeDasharray="4 4" />
              <circle cx="100" cy="100" r="80" fill="none" stroke="var(--border-color)" strokeWidth="1" />
              <path d="M 100 25 A 75 75 0 0 1 165 62" fill="none" stroke="var(--color-success)" strokeWidth="8" strokeLinecap="round" />
              <path d="M 170 70 A 75 75 0 0 1 170 130" fill="none" stroke="var(--color-blue)" strokeWidth="8" strokeLinecap="round" />
              <path d="M 165 138 A 75 75 0 0 1 100 175" fill="none" stroke="var(--color-amber)" strokeWidth="8" strokeLinecap="round" />
              <path d="M 90 175 A 75 75 0 0 1 25 138" fill="none" stroke="var(--color-success)" strokeWidth="8" strokeLinecap="round" />
              <path d="M 22 125 A 75 75 0 0 1 25 62" fill="none" stroke="var(--color-success)" strokeWidth="8" strokeLinecap="round" />
            </svg>
            <div className="radial-center-text">
              <span className="hud-score">{healthScore === null ? '--' : healthScore}</span>
              <span className="hud-status text-success">{healthLabel(healthScore)}</span>
            </div>
          </div>
        </div>

        <div className="panel digital-twin">
          <div className="panel-header">
            <h2 className="panel-title">FarmSense AI Digital Twin</h2>
            <div className={`badge ${connected ? 'badge-success' : 'badge-warning'}`}>{connected ? 'Live Tracking' : 'Waiting'}</div>
          </div>
          <DigitalFarmTwin
            latest={latest}
            weather={weather}
            insights={insights}
            summary={summary}
            connected={connected}
          />
        </div>

        <div className="panel action-feed">
          <div className="panel-header">
            <h2 className="panel-title">System Actions & Alerts</h2>
          </div>
          <div className="feed-list">
            {alerts.length ? alerts.map((item, index) => (
              <div className="feed-item" key={`${item.code}-${index}`}>
                <span className="feed-time">{formatShortTime(item.time)}</span>
                <span className={`feed-code ${item.tone}`}>{item.code}</span>
                <span className="feed-msg">{item.message}</span>
              </div>
            )) : (
              <div className="feed-item">
                <span className="feed-time">--</span>
                <span className="feed-code text-warning">System</span>
                <span className="feed-msg">Waiting for live telemetry.</span>
              </div>
            )}
          </div>

          <div className="irrigation-control">
            <div className="irr-header">
              <span className="irr-label">Remote Irrigation</span>
              <span className={`irr-val ${remoteIrrigationEnabled || irrigationActive ? 'active' : ''}`}>
                {irrigationDisplay}
              </span>
            </div>
            <div className="irr-auto-row">
              <div className="irr-auto-copy">
                <span><Zap size={14} aria-hidden="true" /> Pump command</span>
                <small>{remoteIrrigationEnabled ? 'Remote start enabled' : 'Relay logic enabled'}</small>
              </div>
              <button
                type="button"
                className={`irr-auto-toggle ${remoteIrrigationEnabled ? 'is-on' : ''}`}
                aria-label={remoteIrrigationEnabled ? 'Use relay irrigation logic' : 'Start irrigation remotely'}
                aria-pressed={remoteIrrigationEnabled}
                onClick={toggleRemoteIrrigation}
                disabled={irrigationLoading}
              >
                <span className="irr-auto-thumb" aria-hidden="true" />
              </button>
            </div>
            <div className="irr-options irr-options-remote" role="group" aria-label="Remote irrigation command">
              {remoteIrrigationOptions.map((option) => (
                <button
                  type="button"
                  key={String(option.value)}
                  className={`irr-option ${remoteIrrigationEnabled === option.value ? 'active' : ''}`}
                  onClick={() => updateRemoteIrrigation(option.value)}
                  disabled={irrigationLoading}
                >
                  <span>{option.label}</span>
                  <small>{option.detail}</small>
                </button>
              ))}
            </div>
            <div className={`irr-timer-detail ${rainDetected || irrigationError ? 'text-warning' : ''}`}>{irrigationDetail}</div>
          </div>

          <button className="btn btn-accent w-full mt-3" onClick={() => refreshInsights(true)}>Run FarmSense AI Diagnostic</button>
        </div>
      </div>

      <div className="sensor-section mt-4">
        <div className="sensor-section-header">
          <h2 className="section-title">Live Sensor Telemetry</h2>
          <div className="flex items-center gap-2">
            <div className="pulse-dot-sm" />
            <span className="text-muted text-sm">Refreshed {formatTime(latest?.timestamp)}</span>
          </div>
        </div>
        <div className="sensor-grid">
          {sensorData.map((sensor) => <SensorCard key={sensor.id} sensor={sensor} />)}
        </div>
      </div>

      {/* Official Android Client Download Banner */}
      <div className="panel apk-dashboard-banner mt-4">
        <div className="apk-dashboard-banner-inner">
          <div className="apk-dashboard-copy">
            <div className="apk-dashboard-tag">
              <Smartphone size={14} /> Android App Available
            </div>
            <h3>NxTYield for Android Devices</h3>
            <p>Install the dedicated field app for real-time sensor tracking, automated irrigation alerts, and offline weather telemetry.</p>
          </div>
          <button
            type="button"
            className="apk-dashboard-action-btn"
            onClick={() => setApkModalOpen(true)}
          >
            <Download size={18} />
            <span>Download APK (18 MB)</span>
          </button>
        </div>
      </div>

      <ApkDownloadModal
        isOpen={apkModalOpen}
        onClose={() => setApkModalOpen(false)}
      />
    </div>
  );
}

export default Home;

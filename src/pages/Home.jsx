import { useEffect, useRef, useState } from 'react';
import { Activity, Droplets, Cloud, Wifi, Sprout, Thermometer, Wind, FlaskConical, Leaf } from 'lucide-react';
import DigitalFarmTwin from '../components/DigitalFarmTwin';
import { useFarmData } from '../context/FarmDataContext';
import {
  buildAlerts,
  compactValue,
  formatShortTime,
  formatTime,
  healthLabel,
  humidityStatus,
  moistureStatus,
  nutrientStatus,
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
    icon: Leaf,
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

const irrigationTimerOptions = [
  { value: '0', label: '0', detail: 'Off' },
  { value: '15', label: '15 min', detail: 'Timed' },
  { value: '30', label: '30 min', detail: 'Timed' },
  { value: 'infinity', label: 'Always', detail: 'Until off' },
];

function formatTimerRemaining(seconds) {
  if (seconds <= 0) return '0 min';
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} min`;
}

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
        <img src="/nxtyield-logo.png" alt="" />
        <span>Dashboard online</span>
      </div>
    </div>
  );
}

function Home() {
  const { latest, connected, insights, summary, weather, refreshInsights } = useFarmData();
  const [irrigationTimer, setIrrigationTimer] = useState('0');
  const [irrigationRemaining, setIrrigationRemaining] = useState(0);
  const [showArrival, setShowArrival] = useState(false);
  const arrivalRequestedRef = useRef(false);

  useEffect(() => {
    if (irrigationTimer !== '15' && irrigationTimer !== '30') return undefined;

    const timer = window.setInterval(() => {
      setIrrigationRemaining((remaining) => {
        if (remaining <= 1) {
          setIrrigationTimer('0');
          return 0;
        }
        return remaining - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [irrigationTimer]);

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

  function selectIrrigationTimer(value) {
    setIrrigationTimer(value);
    if (value === '15') setIrrigationRemaining(15 * 60);
    else if (value === '30') setIrrigationRemaining(30 * 60);
    else setIrrigationRemaining(0);
  }

  function irrigationTimerStatus(irrigationActive) {
    if (irrigationActive) return 'RELAY ON';
    if (irrigationTimer === '0') return 'OFF';
    if (irrigationTimer === 'infinity') return 'UNTIL OFF';
    return 'TIMER SET';
  }

  function irrigationTimerDetail(irrigationActive) {
    if (irrigationActive && irrigationTimer === '0') return 'Telemetry active';
    if (irrigationTimer === '15' || irrigationTimer === '30') return `${formatTimerRemaining(irrigationRemaining)} remaining`;
    if (irrigationTimer === 'infinity') return 'No auto shutoff';
    return undefined;
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
  const irrigationDisplay = irrigationTimerStatus(irrigationActive);
  const irrigationDetail = irrigationTimerDetail(irrigationActive);

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
              <Cloud size={13} style={{ color: 'var(--color-amber)' }} />
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
            <h2 className="panel-title">Digital Farm Twin</h2>
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
              <span className="irr-label">Irrigation Timer</span>
              <span className={`irr-val ${irrigationActive || irrigationTimer !== '0' ? 'active' : ''}`}>
                {irrigationDisplay}
              </span>
            </div>
            <div className="irr-options" role="group" aria-label="Irrigation timer presets">
              {irrigationTimerOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={`irr-option ${irrigationTimer === option.value ? 'active' : ''}`}
                  onClick={() => selectIrrigationTimer(option.value)}
                >
                  <span>{option.label}</span>
                  <small>{option.detail}</small>
                </button>
              ))}
            </div>
            <div className="irr-timer-detail">{irrigationDetail || 'Relay off'}</div>
          </div>

          <button className="btn btn-accent w-full mt-3" onClick={() => refreshInsights(true)}>Run Full Diagnostic</button>
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
    </div>
  );
}

export default Home;

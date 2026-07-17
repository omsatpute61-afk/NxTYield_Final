import { CheckCircle, AlertTriangle, XCircle, Activity, Server, Cpu, Database, Network, Clock, RefreshCw, Power } from 'lucide-react';
import { useFarmData } from '../context/FarmDataContext';
import { compactValue, formatShortTime, formatValue } from '../lib/farmUtils';
import './SystemStatus.css';

const statusIcon = (s) => {
  if (s === 'ok') return <CheckCircle size={14} className="text-success" />;
  if (s === 'warn') return <AlertTriangle size={14} className="text-warning" />;
  return <XCircle size={14} className="text-danger" />;
};

function SystemStatus() {
  const {
    latest,
    history,
    connected,
    health,
    apiErrors,
    chatStatus,
    weather,
    weatherError,
    refreshHealth,
    refreshWeather,
    refreshInsights,
    summary,
    toggleDemoMode,
  } = useFarmData();
  const demoMetricSeed = latest?.timestamp ? Math.floor(Date.parse(latest.timestamp) / 5000) : 0;
  const demoRequests = (4180 + (demoMetricSeed % 80) * 7).toLocaleString();
  const demoErrorRate = `${(0.1 + (demoMetricSeed % 5) * 0.05).toFixed(2)}%`;
  const demoLatency = `${74 + (demoMetricSeed % 11) * 4} ms`;

  const nodes = [
    { icon: Database, label: 'Sensor Feed', sublabel: summary.hasSensor ? `${latest.source} telemetry active` : 'Waiting for sensor data', status: summary.hasSensor ? 'ok' : 'warn' },
    { icon: Cpu, label: summary.demoMode ? 'Demo Payload' : 'Arduino Payload', sublabel: summary.hasSensor ? `Last packet ${formatShortTime(latest.timestamp)}` : 'No packet received', status: summary.hasSensor ? 'ok' : 'warn' },
    { icon: Server, label: 'Backend API', sublabel: summary.demoMode ? 'Demo fallback ready' : apiErrors.health ? 'Backend API not available' : health?.status || 'Backend pending', status: apiErrors.health && !summary.demoMode ? 'warn' : 'ok' },
    { icon: Activity, label: 'FarmSense AI Engine', sublabel: chatStatus?.llm_enabled ? `Provider: ${chatStatus.provider}` : chatStatus?.message || 'AI API not available', status: chatStatus?.llm_enabled ? 'ok' : 'warn' },
    { icon: Network, label: 'Weather API', sublabel: weather?.available ? 'OpenWeather connected' : weatherError || weather?.message || 'Weather API not available', status: weather?.available ? 'ok' : 'warn' },
  ];

  const logs = [
    summary.hasSensor && { time: formatShortTime(latest.timestamp), module: summary.demoMode ? 'Demo Sensor Feed' : 'Sensor Feed', event: `Packet received from ${latest.source}`, status: 'ok' },
    latest?.moisture !== null && latest?.moisture !== undefined && Number(latest.moisture) < 40
      ? { time: formatShortTime(latest.timestamp), module: 'Moisture', event: `Reading below target (${compactValue(latest.moisture)}%)`, status: 'warn' }
      : null,
    latest?.rain_detected
      ? { time: formatShortTime(latest.timestamp), module: 'Rain Sensor', event: 'Rain detected in latest payload', status: 'warn' }
      : null,
    { time: formatShortTime(latest?.timestamp), module: 'FarmSense AI', event: summary.demoMode ? 'Demo stream connected' : connected ? 'Live stream connected' : 'Live stream reconnecting', status: connected ? 'ok' : 'warn' },
    apiErrors.sensor ? { time: formatShortTime(latest?.timestamp), module: 'Sensor API', event: apiErrors.sensor, status: 'warn' } : null,
    apiErrors.weather ? { time: formatShortTime(latest?.timestamp), module: 'Weather API', event: apiErrors.weather, status: 'warn' } : null,
    apiErrors.chat ? { time: formatShortTime(latest?.timestamp), module: 'FarmSense AI', event: apiErrors.chat, status: 'warn' } : null,
    { time: formatShortTime(latest?.timestamp), module: 'FarmSense AI', event: chatStatus?.llm_enabled ? `${chatStatus.provider} available` : 'AI API not available', status: chatStatus?.llm_enabled ? 'ok' : 'warn' },
  ].filter(Boolean);

  return (
    <div className="container page-system">
      <div className="system-top-grid mb-4">
        <div className="panel health-orb-panel">
          <div className="panel-header">
            <h2 className="panel-title">FarmSense AI System Health</h2>
          </div>
          <div className="orb-wrapper">
            <div className="orb">
              <span className="orb-val">{summary.healthScore === null ? '--' : `${summary.healthScore}%`}</span>
              <span className={`orb-label ${connected ? 'text-success' : 'text-warning'}`}>{summary.demoMode ? 'Demo Active' : connected ? 'Operational' : 'Waiting'}</span>
            </div>
          </div>
          <div className="orb-stats mt-4">
            <div className="orb-stat">
              <span className="os-label">Uptime</span>
              <span className="os-val">Not tracked</span>
            </div>
            <div className="orb-stat">
              <span className="os-label">Packets Stored</span>
              <span className="os-val text-success">{history.length}</span>
            </div>
            <div className="orb-stat">
              <span className="os-label">Active Warnings</span>
              <span className="os-val text-warning">{logs.filter((log) => log.status === 'warn').length}</span>
            </div>
          </div>
        </div>

        <div className="panel topology-panel">
          <div className="panel-header">
            <h2 className="panel-title">Data Flow - Infrastructure Topology</h2>
            <div className={`badge ${connected ? 'badge-success' : 'badge-warning'}`}>{summary.demoMode ? 'Demo Mode' : connected ? 'Live' : 'Reconnecting'}</div>
          </div>
          <div className="topology-graph">
            {nodes.map((node, i) => (
              <div key={node.label} className="topo-node-group">
                <div className={`topo-node status-${node.status}`}>
                  <div className="topo-icon-wrapper">
                    <node.icon size={22} />
                  </div>
                  <div className="topo-label">
                    <span className="topo-name">{node.label}</span>
                    <span className="topo-sub text-muted">{node.sublabel}</span>
                  </div>
                  <div className={`topo-indicator status-${node.status}`}></div>
                </div>
                {i < nodes.length - 1 && (
                  <div className="topo-arrow">
                    <div className="topo-line">
                      <div className="topo-packet"></div>
                    </div>
                    <span className="topo-arrow-symbol">-&gt;</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="system-bottom-grid">
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Hardware Diagnostics</h2>
            <button
              className="btn"
              style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}
              onClick={() => {
                refreshHealth();
                refreshWeather();
                refreshInsights(true);
              }}
            >
              <RefreshCw size={12} style={{ marginRight: '0.4rem' }} /> Refresh
            </button>
          </div>
          <div className="diag-table">
            {[
              { key: 'Data Source', val: latest?.source || 'Waiting', status: summary.hasSensor ? 'ok' : 'warn', note: summary.hasSensor ? 'Active' : 'No Data' },
              { key: 'Soil Moisture', val: formatValue(latest?.moisture, { unit: '%' }), status: latest?.moisture !== null && latest?.moisture !== undefined ? 'ok' : 'warn', note: '' },
              { key: 'Soil pH', val: formatValue(latest?.ph, { unit: 'pH' }), status: latest?.ph !== null && latest?.ph !== undefined ? 'ok' : 'warn', note: '' },
              { key: 'Soil Temperature', val: formatValue(latest?.soil_temperature, { unit: 'C' }), status: latest?.soil_temperature !== null && latest?.soil_temperature !== undefined ? 'ok' : 'warn', note: '' },
              { key: 'Air Temperature', val: formatValue(latest?.air_temperature, { unit: 'C' }), status: latest?.air_temperature !== null && latest?.air_temperature !== undefined ? 'ok' : 'warn', note: '' },
              { key: 'Rain Sensor', val: latest?.rain_detected === undefined || latest?.rain_detected === null ? 'Unavailable' : latest.rain_detected ? 'Rain' : 'Clear', status: latest?.rain_detected ? 'warn' : 'ok', note: '' },
              { key: 'Irrigation Relay', val: latest?.irrigation_active === undefined || latest?.irrigation_active === null ? 'Unavailable' : latest.irrigation_active ? 'Active' : 'Off', status: latest?.irrigation_active ? 'warn' : 'ok', note: '' },
            ].map((row) => (
              <div key={row.key} className="diag-row">
                <span className="diag-key">{row.key}</span>
                <span className="diag-val">{row.val}</span>
                <span className={`diag-status text-${row.status === 'ok' ? 'success' : 'warning'}`}>
                  {row.status === 'ok' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                  {row.note}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Network Metrics</h2>
          </div>
          <div className="net-metrics-grid">
            {[
              { label: 'Requests Today', val: summary.demoMode ? demoRequests : 'Not tracked', color: summary.demoMode ? 'text-success' : '' },
              { label: 'Packets Stored', val: String(history.length), color: 'text-success' },
              { label: 'Error Rate', val: summary.demoMode ? demoErrorRate : 'Not tracked', color: summary.demoMode ? 'text-success' : '' },
              { label: 'Avg. Latency', val: summary.demoMode ? demoLatency : 'Not tracked', color: summary.demoMode ? 'text-success' : '' },
              { label: 'Backend API', val: summary.demoMode ? 'Demo ready' : apiErrors.health ? 'API not available' : 'Available', color: apiErrors.health && !summary.demoMode ? 'text-warning' : 'text-success' },
              { label: 'Weather Provider', val: weather?.available ? weather.provider : summary.demoMode ? 'demo-weather' : 'API not available', color: weather?.available || summary.demoMode ? '' : 'text-warning' },
              { label: 'Live Stream', val: summary.demoMode ? 'Demo Stream' : connected ? 'Connected' : 'Waiting', color: connected ? 'text-success' : 'text-warning' },
            ].map((m) => (
              <div key={m.label} className="net-metric-cell">
                <span className="nm-label">{m.label}</span>
                <span className={`nm-val ${m.color}`}>{m.val}</span>
              </div>
            ))}
            <div className="net-metric-cell net-demo-cell">
              <span className="nm-label">Demo Mode</span>
              <button
                type="button"
                className={`demo-mode-toggle ${summary.demoMode ? 'active' : ''}`}
                onClick={toggleDemoMode}
                aria-pressed={summary.demoMode}
              >
                <Power size={15} />
                <span>{summary.demoMode ? 'On' : 'Start Demo'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">System Event Log</h2>
            <Clock size={14} className="text-muted" />
          </div>
          <div className="log-list">
            {logs.map((log, i) => (
              <div key={`${log.module}-${i}`} className={`log-row ${log.status}`}>
                <span className="log-time">{log.time}</span>
                {statusIcon(log.status)}
                <span className="log-module">{log.module}</span>
                <span className="log-event">{log.event}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SystemStatus;

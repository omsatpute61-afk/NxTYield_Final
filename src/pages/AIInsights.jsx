import { TrendingUp, ShieldAlert, AlertTriangle, CheckCircle, ArrowUpRight, Activity } from 'lucide-react';
import { useFarmData } from '../context/FarmDataContext';
import { buildRiskAssessment, formatUpdated, toNumber } from '../lib/farmUtils';
import './AIInsights.css';

function statusClass(status) {
  const value = (status || '').toLowerCase();
  if (value.includes('good')) return 'text-success';
  if (value.includes('fair')) return 'text-warning';
  return 'text-danger';
}

function cropVigorScore(status) {
  if (status === 'Good') return 85;
  if (status === 'Fair') return 60;
  if (status === 'At Risk') return 35;
  return 0;
}

function safeScore(value) {
  const number = toNumber(value);
  if (number === null) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function radarPoint(index, total, scale, radius = 78, centerX = 150, centerY = 122) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total;
  return {
    x: centerX + Math.cos(angle) * radius * scale,
    y: centerY + Math.sin(angle) * radius * scale,
  };
}

function pointsString(points) {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
}

function connectivityRadarScore(summary) {
  if (summary.hasSensor) return 100;
  if (summary.connected) return 40;
  return 20;
}

function AIInsights() {
  const { latest, history, weather, insights, insightsLoading, insightsError, refreshInsights, summary } = useFarmData();
  const soil = insights?.soil_health;
  const crop = insights?.crop_health;
  const fertilizer = insights?.fertilizer;
  const recommendation = insights?.recommendation;
  const insightSoilScore = toNumber(soil?.score);
  const healthScore = insightSoilScore ?? summary.healthScore;
  const moisture = Number(latest?.moisture);
  const nutrientAverage = ['nitrogen', 'phosphorus', 'potassium']
    .map((key) => Number(latest?.[key]))
    .filter(Number.isFinite);
  const nutrientScore = nutrientAverage.length
    ? Math.round(Math.min(100, nutrientAverage.reduce((sum, value) => sum + value, 0) / nutrientAverage.length))
    : 0;
  const connectivityScore = connectivityRadarScore(summary);

  const radarData = [
    { metric: 'Soil Health', value: safeScore(healthScore) },
    { metric: 'Moisture', value: safeScore(Number.isFinite(moisture) ? moisture : 0) },
    { metric: 'Weather', value: safeScore(weather?.available ? (latest?.rain_detected ? 65 : 80) : 0) },
    { metric: 'Crop Vigor', value: safeScore(cropVigorScore(crop?.status)) },
    { metric: 'Nutrient', value: safeScore(nutrientScore) },
    { metric: 'Connectivity', value: safeScore(connectivityScore) },
  ];

  const reportText = summary.hasSensor
    ? insights?.available
      ? `${soil?.summary || 'Soil summary is pending.'} ${crop?.summary || ''}`
      : insights?.message || insightsError || 'FarmSense AI analysis is waiting for the insights service.'
    : 'No data from sensors currently. Connect live sensor readings to generate the FarmSense AI analysis report.';

  const actions = recommendation?.title
    ? [{ title: recommendation.title, detail: recommendation.detail, impact: 'High Impact', className: 'high', button: 'Review' }]
    : [{ title: 'Waiting for recommendation', detail: 'Connect sensors or refresh once readings arrive.', impact: 'Pending', className: 'medium', button: 'Refresh' }];

  const risks = buildRiskAssessment(latest, history, weather, insights, summary);
  const radarTotal = radarData.length;
  const radarRings = [0.25, 0.5, 0.75, 1].map((scale) => (
    pointsString(radarData.map((_, index) => radarPoint(index, radarTotal, scale)))
  ));
  const radarAxes = radarData.map((_, index) => radarPoint(index, radarTotal, 1));
  const radarShape = pointsString(radarData.map((item, index) => radarPoint(index, radarTotal, item.value / 100)));
  const radarLabels = radarData.map((item, index) => {
    const point = radarPoint(index, radarTotal, 1.2);
    const anchor = Math.abs(point.x - 150) < 8 ? 'middle' : point.x > 150 ? 'start' : 'end';
    return { ...point, anchor, label: item.metric };
  });

  return (
    <div className="container page-ai">
      <div className="ai-top-grid mb-4">
        <div className="panel farm-report">
          <div className="panel-header">
            <h2 className="panel-title">FarmSense AI Analysis Report</h2>
            <span className={`badge ${insightsLoading ? 'badge-warning' : 'badge-success'}`}>
              {insightsLoading ? 'Analyzing' : formatUpdated(latest?.timestamp)}
            </span>
          </div>
          <div className="report-summary">
            <p className="report-text">
              {reportText}
            </p>
          </div>

          <div className="report-metrics mt-4">
            <div className="rm-item">
              <Activity size={16} className="text-success" />
              <div>
                <span className="rm-label">Soil Score</span>
                <span className={`rm-val ${statusClass(soil?.status)}`}>{healthScore === null ? 'Pending' : `${healthScore}/100`}</span>
              </div>
            </div>
            <div className="rm-item">
              <TrendingUp size={16} className="text-success" />
              <div>
                <span className="rm-label">Crop Health</span>
                <span className="rm-val">{crop?.status || 'Pending'}</span>
              </div>
            </div>
            <div className="rm-item">
              <ShieldAlert size={16} className="text-warning" />
              <div>
                <span className="rm-label">Fertilizer Status</span>
                <span className="rm-val text-warning">{fertilizer?.status || 'Pending'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="panel radar-panel">
          <div className="panel-header">
            <h2 className="panel-title">FarmSense AI Matrix</h2>
          </div>
          <div className="radar-net-wrap" aria-label="Farm intelligence scores">
            <svg className="radar-net" viewBox="0 0 300 244" role="img" aria-labelledby="radar-title">
              <title id="radar-title">Farm intelligence radar chart</title>
              <g className="radar-grid">
                {radarRings.map((points) => (
                  <polygon key={points} points={points} />
                ))}
                {radarAxes.map((point, index) => (
                  <line key={radarData[index].metric} x1="150" y1="122" x2={point.x} y2={point.y} />
                ))}
              </g>
              <polygon className="radar-shape" points={radarShape} />
              <polygon className="radar-outline" points={radarShape} />
              {radarLabels.map((item) => (
                <text
                  key={item.label}
                  x={item.x}
                  y={item.y}
                  textAnchor={item.anchor}
                  dominantBaseline="middle"
                >
                  {item.label}
                </text>
              ))}
            </svg>
          </div>
        </div>

      </div>

      <div className="ai-bottom-grid">
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Priority Action Queue</h2>
            <button className="badge badge-warning" onClick={() => refreshInsights(true)} type="button">
              Refresh
            </button>
          </div>
          <div className="action-queue">
            {actions.map((action) => (
              <div className={`action-row ${action.className}`} key={action.title}>
                <div className={`a-impact-badge badge ${action.className === 'high' ? 'badge-danger' : 'badge-warning'}`}>{action.impact}</div>
                <div className="a-content">
                  <div className="a-header">
                    <span className="a-title">{action.title}</span>
                    <ArrowUpRight size={16} className="text-muted" />
                  </div>
                  <p className="a-desc text-muted">{action.detail}</p>
                </div>
                <button className="btn btn-primary a-btn" onClick={() => refreshInsights(true)}>{action.button}</button>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Risk Assessment Matrix</h2>
          </div>
          <div className="risk-grid">
            {risks.map((risk) => {
              const elevated = risk.status !== 'Low';
              return (
                <div className={`risk-item ${elevated ? 'elevated' : 'low'}`} key={risk.label}>
                  {elevated ? <AlertTriangle size={20} className="text-warning" /> : <CheckCircle size={20} className="text-success" />}
                  <div>
                    <span className="risk-label">{risk.label}</span>
                    <span className={`risk-level ${elevated ? 'text-warning' : 'text-success'}`}>{risk.status}</span>
                    <span className="risk-desc">{risk.desc}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AIInsights;

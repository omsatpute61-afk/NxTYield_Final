import { useMemo, useState } from 'react';
import { Sprout, CheckCircle, BarChart2, Droplets, Zap, AlertTriangle } from 'lucide-react';
import { predictCrop } from '../lib/api';
import { useFarmData } from '../context/FarmDataContext';
import { buildDemoCropPrediction } from '../lib/demoData';
import { compactValue, cropName, formatValue, MONTHS, nutrientStatus, phStatus, toNumber } from '../lib/farmUtils';
import './Crop.css';

const growthPhases = [
  { name: 'Seedling', range: 'Day 0-10' },
  { name: 'Vegetative', range: 'Pending' },
  { name: 'Flowering', range: 'Pending' },
  { name: 'Pod Fill', range: 'Pending' },
  { name: 'Maturity & Harvest', range: 'Pending' },
];

function conditionLevel(key, value) {
  if (key === 'ph') return phStatus(value).text;
  return nutrientStatus(key, value).label;
}

function seasonForMonth(month) {
  if (month >= 6 && month <= 10) return 'Kharif';
  if (month >= 11 || month <= 3) return 'Rabi';
  return 'Zaid';
}

function Crop() {
  const { latest, weather, summary } = useFarmData();
  const [hasPlanted, setHasPlanted] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [plantingMonth, setPlantingMonth] = useState(new Date().getMonth() + 1);
  const city = weather?.city && weather?.country ? `${weather.city},${weather.country}` : 'Pune';
  const sensorPh = toNumber(latest?.ph);
  const hasSensorPh = sensorPh !== null;
  const phForModel = hasSensorPh ? sensorPh : null;
  const plantingMonthName = MONTHS[plantingMonth - 1];
  const plantingSeason = seasonForMonth(plantingMonth);

  const modelInputs = useMemo(() => ({
    city: city.split(',')[0],
    planting_month: plantingMonth,
    N: toNumber(latest?.nitrogen),
    P: toNumber(latest?.phosphorus),
    K: toNumber(latest?.potassium),
    ph: phForModel,
  }), [city, plantingMonth, latest, phForModel]);

  const canPredict = summary.hasSensor
    && Number.isFinite(modelInputs.N)
    && Number.isFinite(modelInputs.P)
    && Number.isFinite(modelInputs.K)
    && hasSensorPh;

  const selectedCrop = prediction ? cropName(prediction.prediction) : 'Awaiting model run';
  const modelWeather = prediction?.weather_used || (weather?.available ? weather?.current : {}) || {};
  const soilScore = summary.healthScore;
  const scoreText = soilScore === null ? '--' : soilScore;

  function handleMonthChange(event) {
    setPlantingMonth(Number(event.target.value));
    setPrediction(null);
    setError('');
  }

  async function handlePredict() {
    setError('');
    if (!canPredict) {
      setError('Live NPK and pH readings are required before calling the crop model.');
      return;
    }

    setLoading(true);
    try {
      if (summary.demoMode) {
        setPrediction(buildDemoCropPrediction(modelInputs, latest, weather));
        return;
      }

      const result = await predictCrop(modelInputs);
      if (result.available === false || result.success === false) {
        setPrediction(null);
        setError(result.message || 'Crop model API not available');
        return;
      }
      if (result.prediction === undefined || result.prediction === null) throw new Error('Crop model API not available');
      setPrediction({
        success: true,
        available: true,
        weather_used: result.weather_used,
        provider: result.provider || 'render',
        prediction: result.prediction,
      });
    } catch (err) {
      setError(err.name === 'AbortError' ? 'Model request timed out. Try again in a moment.' : err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container page-crop">
      {!hasPlanted ? (
        <div className="crop-planning-phase">
          <div className="panel mb-4">
            <div className="panel-header">
              <h2 className="panel-title">FarmSense AI Field Conditions</h2>
              <span className={`badge ${summary.hasSensor ? 'badge-success' : 'badge-warning'}`}>
                {summary.hasSensor ? 'Live Sensor Data' : 'Waiting for Sensors'}
              </span>
            </div>
            <div className="conditions-grid">
              <div className="condition-node">
                <span className="cn-label">Nitrogen (N)</span>
                <span className="cn-val text-success">{conditionLevel('nitrogen', latest?.nitrogen)}</span>
                <span className="cn-sub">{formatValue(latest?.nitrogen, { unit: 'mg/kg' })}</span>
              </div>
              <div className="condition-node">
                <span className="cn-label">Phosphorus (P)</span>
                <span className="cn-val text-warning">{conditionLevel('phosphorus', latest?.phosphorus)}</span>
                <span className="cn-sub">{formatValue(latest?.phosphorus, { unit: 'mg/kg' })}</span>
              </div>
              <div className="condition-node">
                <span className="cn-label">Potassium (K)</span>
                <span className="cn-val text-success">{conditionLevel('potassium', latest?.potassium)}</span>
                <span className="cn-sub">{formatValue(latest?.potassium, { unit: 'mg/kg' })}</span>
              </div>
              <div className="condition-node">
                <label className="cn-label" htmlFor="planting-month">Planting Month</label>
                <select id="planting-month" className="month-select" value={plantingMonth} onChange={handleMonthChange}>
                  {MONTHS.map((month, index) => (
                    <option key={month} value={index + 1}>{month}</option>
                  ))}
                </select>
                <span className="cn-sub">{plantingSeason} season</span>
              </div>
              <div className="condition-node">
                <span className="cn-label">Soil pH</span>
                <span className="cn-val">{conditionLevel('ph', modelInputs.ph)}</span>
                <span className="cn-sub">{hasSensorPh ? formatValue(latest?.ph, { unit: 'pH' }) : 'Waiting for live sensor'}</span>
              </div>
              <div className="condition-node">
                <span className="cn-label">Avg. Temperature</span>
                <span className="cn-val">
                  {modelWeather.avg_temperature !== undefined || modelWeather.temperature !== undefined
                    ? formatValue(modelWeather.avg_temperature ?? modelWeather.temperature, { unit: 'C' })
                    : 'API not available'}
                </span>
                <span className="cn-sub">{city}</span>
              </div>
              <div className="condition-node">
                <span className="cn-label">Soil Moisture</span>
                <span className="cn-val">{formatValue(latest?.moisture, { unit: '%' })}</span>
                <span className="cn-sub">Latest field reading</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="panel mb-4">
              <p className="text-warning text-sm">{error}</p>
            </div>
          )}

          <div className="crops-comparison-grid">
            <div className="panel crop-card recommended">
              <div className="crop-card-header">
                <div>
                  <div className="badge badge-success mb-2">Primary Recommendation</div>
                  <h3 className="crop-name">{selectedCrop}</h3>
                  <p className="crop-variety text-muted">
                    {prediction ? `Model result for ${plantingMonthName} in ${modelInputs.city}` : 'Run the ML model with live soil readings'}
                  </p>
                </div>
                <div className="crop-score">
                  <span className="score-val">{scoreText}</span>
                  <span className="score-label text-muted">/ 100</span>
                </div>
              </div>

              <div className="suitability-bar-wrapper mt-3">
                <div className="suitability-bar success" style={{ width: `${soilScore ?? 0}%` }}></div>
              </div>

              <div className="crop-factors mt-4">
                <div className={canPredict ? 'factor success' : 'factor warning'}>
                  {canPredict ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                  Live NPK and pH {canPredict ? 'ready for model input' : 'required before prediction'}
                </div>
                <div className={hasSensorPh ? 'factor success' : 'factor warning'}>
                  {hasSensorPh ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                  pH {hasSensorPh ? 'from live sensor' : 'waiting for live sensor'}
                </div>
                <div className="factor success"><CheckCircle size={14} /> City: {modelInputs.city}</div>
                <div className="factor success"><CheckCircle size={14} /> Planting month: {plantingMonthName}</div>
              </div>

              <div className="crop-metrics mt-4">
                <div className="cm-item">
                  <span className="cm-label">Model Output</span>
                  <span className="cm-val text-success">{prediction ? selectedCrop : 'Not run'}</span>
                </div>
                <div className="cm-item">
                  <span className="cm-label">Climate Window</span>
                  <span className="cm-val">{prediction?.weather_used?.season_length || 'Pending'}</span>
                </div>
                <div className="cm-item">
                  <span className="cm-label">Rainfall Used</span>
                  <span className="cm-val">{prediction?.weather_used?.avg_rainfall !== undefined ? `${prediction.weather_used.avg_rainfall} mm` : 'Pending'}</span>
                </div>
              </div>

              <button className="btn btn-primary w-full mt-4" onClick={prediction ? () => setHasPlanted(true) : handlePredict} disabled={loading}>
                {loading ? 'Calling ML Model...' : prediction ? 'Authorize Deployment' : 'Run FarmSense AI Crop Model'}
              </button>
            </div>

            <div className="panel crop-card">
              <div className="crop-card-header">
                <div>
                  <div className="badge badge-warning mb-2">Alternative</div>
                  <h3 className="crop-name">{prediction ? 'Not Returned' : 'Awaiting Result'}</h3>
                  <p className="crop-variety text-muted">Uses the same live field context for comparison and re-run decisions.</p>
                </div>
                <div className="crop-score">
                  <span className="score-val">--</span>
                  <span className="score-label text-muted">/ 100</span>
                </div>
              </div>

              <div className="suitability-bar-wrapper mt-3">
                <div className="suitability-bar warning" style={{ width: '0%' }}></div>
              </div>

              <div className="crop-factors mt-4">
                <div className="factor success"><CheckCircle size={14} /> Live soil values remain available for re-run</div>
                <div className={hasSensorPh ? 'factor success' : 'factor warning'}>
                  {hasSensorPh ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                  pH {hasSensorPh ? 'from live sensor' : 'waiting for live sensor'}
                </div>
                <div className="factor success"><CheckCircle size={14} /> City: {modelInputs.city}</div>
                <div className="factor success"><CheckCircle size={14} /> Planting month: {plantingMonthName}</div>
              </div>

              <div className="crop-metrics mt-4">
                <div className="cm-item">
                  <span className="cm-label">NPK Sent</span>
                  <span className="cm-val">{compactValue(latest?.nitrogen)} / {compactValue(latest?.phosphorus)} / {compactValue(latest?.potassium)}</span>
                </div>
                <div className="cm-item">
                  <span className="cm-label">pH Sent</span>
                  <span className="cm-val">{compactValue(modelInputs.ph, 1)}</span>
                </div>
                <div className="cm-item">
                  <span className="cm-label">Request Status</span>
                  <span className="cm-val">{prediction ? 'Complete' : 'Pending'}</span>
                </div>
              </div>

              <button className="btn btn-accent w-full mt-4" onClick={handlePredict} disabled={loading || !canPredict}>
                Re-run Model
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="crop-command-center">
          <div className="panel crop-active-header mb-4">
            <div className="flex justify-between items-center">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <Sprout size={24} className="text-success" />
                  <h2 className="font-heading text-xl">FarmSense AI Command Center - {selectedCrop}</h2>
                </div>
                <p className="text-muted text-sm">Deployment authorized - Day 0 - {modelInputs.city}</p>
              </div>
              <div className="badge badge-success text-sm">Active Deployment</div>
            </div>
          </div>

          <div className="cmd-grid">
            <div className="panel" style={{ gridColumn: 'span 2' }}>
              <div className="panel-header">
                <h2 className="panel-title">Growth Phase Timeline</h2>
              </div>
              <div className="phase-timeline">
                {growthPhases.map((phase, index) => (
                  <div key={phase.name} className={`phase-node ${index === 0 ? 'active' : ''}`} aria-current={index === 0 ? 'step' : undefined}>
                    <div className={`phase-dot ${index === 0 ? 'active' : ''}`}></div>
                    <div className="phase-info">
                      <span className="phase-name">{phase.name}</span>
                      <span className="phase-range text-muted">{phase.range}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Active Targets</h2>
              </div>
              <div className="targets-list">
                <div className="target-row">
                  <Droplets size={16} className="text-primary" />
                  <div>
                    <span className="t-name">Soil Moisture</span>
                    <span className="t-range">Target: 40% - 70%</span>
                  </div>
                  <span className="t-current text-success">{formatValue(latest?.moisture, { unit: '%' })}</span>
                </div>
                <div className="target-row">
                  <Zap size={16} className="text-warning" />
                  <div>
                    <span className="t-name">Fertilizer Review</span>
                    <span className="t-range">Based on live NPK</span>
                  </div>
                  <span className="t-current">Monitor</span>
                </div>
                <div className="target-row">
                  <BarChart2 size={16} className="text-success" />
                  <div>
                    <span className="t-name">Model Crop</span>
                    <span className="t-range">Latest prediction</span>
                  </div>
                  <span className="t-current text-success">{selectedCrop}</span>
                </div>
                <div className="target-row warning-row">
                  <AlertTriangle size={16} className="text-warning" />
                  <div>
                    <span className="t-name">pH Watch</span>
                    <span className="t-range">Target: 6.0 - 7.5</span>
                  </div>
                  <span className="t-current text-warning">{formatValue(latest?.ph, { unit: 'pH' })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Crop;

import { Activity, Droplets, Sprout, Cpu } from 'lucide-react';
import { useFarmData } from '../context/FarmDataContext';
import { compactValue } from '../lib/farmUtils';
import './FloatingStatus.css';

function FloatingStatus() {
  const { latest, summary, chatStatus } = useFarmData();
  const health = summary.healthScore === null ? '--' : summary.healthScore.toFixed(1);
  const moisture = compactValue(latest?.moisture);
  const aiStatus = chatStatus?.llm_enabled || summary.demoMode ? chatStatus?.provider : 'API not available';

  return (
    <div className="floating-status panel">
      <div className="status-group">
        <div className="status-item">
          <Activity size={16} className="text-success" />
          <span className="fs-label">Health Score:</span>
          <span className="fs-val text-success">{health}</span>
        </div>
        <div className="status-divider"></div>
        <div className="status-item">
          <Droplets size={16} className="text-primary" />
          <span className="fs-label">Moisture:</span>
          <span className="fs-val">{moisture === '--' ? '--' : `${moisture}%`}</span>
        </div>
        <div className="status-divider"></div>
        <div className="status-item">
          <Sprout size={16} className="text-warning" />
          <span className="fs-label">Crop:</span>
          <span className="fs-val">Not selected</span>
        </div>
        <div className="status-divider"></div>
        <div className="status-item">
          <Cpu size={16} className="text-success" />
          <span className="fs-label">FarmSense AI:</span>
          <span className="fs-val text-success">{aiStatus}</span>
        </div>
      </div>
    </div>
  );
}

export default FloatingStatus;

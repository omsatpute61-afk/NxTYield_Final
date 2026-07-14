import { useEffect, useState } from 'react';
import './StartupLoader.css';

function StartupLoader() {
  const [visible, setVisible] = useState(true);
  const [prefersReducedMotion] = useState(() => (
    typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(false);
    }, prefersReducedMotion ? 500 : 1550);

    return () => window.clearTimeout(timer);
  }, [prefersReducedMotion]);

  if (!visible) return null;

  return (
    <div className="startup-loader" role="status" aria-live="polite" aria-label="NxTYield dashboard loading">
      <div className="startup-loader__grid" aria-hidden="true" />
      <div className="startup-loader__core" aria-hidden="true">
        <span className="startup-loader__ring startup-loader__ring--outer" />
        <span className="startup-loader__ring startup-loader__ring--inner" />
        <span className="startup-loader__scanner" />
        <span className="startup-loader__seed">
          <span className="startup-loader__leaf startup-loader__leaf--left" />
          <span className="startup-loader__leaf startup-loader__leaf--right" />
        </span>
      </div>
      <div className="startup-loader__copy">
        <span className="startup-loader__brand">NxTYield</span>
        <span className="startup-loader__caption">Initializing FarmSense AI</span>
      </div>
    </div>
  );
}

export default StartupLoader;

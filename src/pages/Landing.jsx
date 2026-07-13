import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { ArrowRight, BrainCircuit, CloudRain, Cpu, Droplets, FlaskConical, Radio, RotateCcw, Sprout, Thermometer } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import * as THREE from 'three';
import { FarmTwinScene } from '../components/DigitalFarmTwin';
import { useFarmData } from '../context/FarmDataContext';
import { compactValue, hasSensorData, toNumber } from '../lib/farmUtils';
import { timeLightingFromHour } from '../lib/timeLighting';
import './Landing.css';

gsap.registerPlugin(ScrollTrigger);

const dashboardPreload = () => import('./Home');

const storySections = [
  {
    id: 'surface',
    kicker: 'Field conditions',
    title: 'It starts with understanding the field.',
    copy: 'NxTYield continuously reads the conditions that determine what the farm needs next.',
  },
  {
    id: 'intelligence',
    kicker: 'Data to intelligence',
    title: <>Raw conditions become <span className="landing-title-highlight">clear decisions.</span></>,
    copy: 'Field sensing, environmental data and intelligent analysis are connected so farmers can act before small problems become lost yield.',
  },
  {
    id: 'response',
    kicker: 'Automated response',
    title: "NxTYield doesn't just monitor. It responds.",
    copy: 'Irrigation, weather context, nutrient condition and crop recommendations are sequenced into one operating view.',
  },
  {
    id: 'twin',
    kicker: 'Digital twin reveal',
    title: <>Your entire farm. <span className="landing-title-highlight landing-title-highlight--green">Alive in one view.</span></>,
    copy: 'Monitor the field, understand its condition and control critical actions from one connected dashboard.',
  },
];

const capabilities = [
  ['Live Farm Monitoring', 'Sensor packets, farm health and field status in one operational surface.'],
  ['Weather Intelligence', 'OpenWeather context informs rain, wind and temperature-aware decisions.'],
  ['Crop Planning', 'Nutrient and environment data support crop guidance without pH hardware claims.'],
  ['AI Insights and Recommendations', 'Sensor readings are converted into practical recommendations.'],
  ['Farmer Assistant', 'The assistant answers farm questions using current system context.'],
  ['System and Irrigation Control', 'Relay irrigation status and system health stay visible to the operator.'],
];

const team = [
  ['Shrisamarth Tonmare', 'Field Layer', 'IoT, hardware, sensors, website design and project direction', true],
  ['Om Satpute', 'Experience Layer', 'Dashboard and frontend'],
  ['Ruturaj Patil', 'Integration Layer', 'Frontend-backend integration and video editing'],
  ['Harshvardhan Lokare', 'Intelligence Layer', 'Machine learning'],
  ['Devraj Anand', 'Infrastructure Layer', 'FastAPI, APIs and hosting'],
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const update = () => setReduced(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return reduced;
}

function sensorReadings(latest) {
  const npkValues = [latest?.nitrogen, latest?.phosphorus, latest?.potassium]
    .map((value) => compactValue(value))
    .filter((value) => value !== '--');

  return [
    { icon: Droplets, label: 'Soil moisture probe', value: latest?.moisture == null ? 'Awaiting live feed' : `${compactValue(latest.moisture)}%` },
    { icon: Thermometer, label: 'Soil-temperature probe', value: latest?.soil_temperature == null ? 'Awaiting live feed' : `${compactValue(latest.soil_temperature, 1)} C` },
    { icon: FlaskConical, label: 'NPK sensor', value: npkValues.length ? npkValues.join(' / ') : 'Awaiting live feed' },
    { icon: Radio, label: 'Atmospheric station', value: latest?.air_temperature == null ? 'Awaiting live feed' : `${compactValue(latest.air_temperature, 1)} C air` },
    { icon: CloudRain, label: 'Rain sensor', value: latest?.rain_detected == null ? 'Awaiting live feed' : latest.rain_detected ? 'Rain detected' : 'Clear' },
  ];
}

function buildLandingEnv({ latest, weather, summary, progress }) {
  const hour = 4.75 + progress * 14.7;
  const lighting = timeLightingFromHour(hour);
  const moisture = toNumber(latest?.moisture);
  const health = toNumber(summary?.healthScore);
  const description = String(weather?.current?.description || '').toLowerCase();
  const storyRain = progress > 0.58 && progress < 0.7;
  const storyIrrigation = progress > 0.52 || latest?.irrigation_active === true;
  const liveRain = latest?.rain_detected === true || description.includes('rain') || description.includes('drizzle');

  return {
    moisture,
    health,
    windSpeed: toNumber(weather?.current?.wind_speed) ?? 8,
    windDirection: toNumber(weather?.current?.wind_direction) ?? 45,
    windFromApi: toNumber(weather?.current?.wind_speed) !== null,
    windDirectionFromApi: toNumber(weather?.current?.wind_direction) !== null,
    rainDetected: liveRain || storyRain,
    cloudy: description.includes('cloud') || progress > 0.45,
    irrigationActive: storyIrrigation,
    hasSensor: hasSensorData(latest),
    cropName: 'Field crop',
    updatedAt: latest?.timestamp,
    timeLabel: 'Landing preview',
    ...lighting,
    soilWetness: Math.max(Math.min((moisture ?? 52) / 100 + (storyIrrigation ? 0.16 : 0), 1), 0),
    cropHealth: Math.max(Math.min((health ?? 72) / 100, 1), 0),
    nutrientIssues: progress > 0.34 && progress < 0.48 ? ['nitrogen'] : [],
  };
}

function LandingFarmCanvas({ latest, weather, summary, progress, parallax, reducedMotion }) {
  const env = useMemo(
    () => buildLandingEnv({ latest, weather, summary, progress }),
    [latest, weather, summary, progress],
  );

  return (
    <Canvas
      frameloop="demand"
      shadows={{ type: THREE.PCFShadowMap }}
      orthographic
      dpr={[1, 1.25]}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      camera={{ position: [2.8, 1.05, 4.1], zoom: 62, near: 0.1, far: 80 }}
      onCreated={({ gl }) => {
        gl.setClearColor('#111513');
        gl.shadowMap.autoUpdate = false;
        gl.shadowMap.needsUpdate = true;
      }}
    >
      <FarmTwinScene
        env={env}
        latest={latest}
        labelsVisible={false}
        reducedMotion={reducedMotion}
        sceneActive
        cameraMode="landing"
        storyProgress={reducedMotion ? 1 : progress}
        parallax={parallax}
      />
    </Canvas>
  );
}

function TransitionOverlay({ active }) {
  return (
    <div className={`landing-transition ${active ? 'active' : ''}`} aria-hidden={!active}>
      <div className="landing-transition__veil" />
      <div className="landing-transition__grid" />
      <div className="landing-transition__sweep" />
      <div className="landing-transition__rings">
        <span />
        <span />
        <span />
      </div>
      <div className="landing-transition__nodes">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="landing-transition__dashboard" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="landing-transition__copy">
        <img src="/nxtyield-logo.png" alt="" aria-hidden="true" />
        <span>NXTYIELD</span>
        <strong>Farm intelligence online</strong>
        <div className="landing-transition__status">
          <b>FIELD LOCK</b>
          <b>AI READY</b>
          <b>CONTROL ROOM</b>
        </div>
      </div>
    </div>
  );
}

function Landing() {
  const { latest, weather, summary } = useFarmData();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const rootRef = useRef(null);
  const storyRef = useRef(null);
  const [progress, setProgress] = useState(reducedMotion ? 1 : 0);
  const [activeLayer, setActiveLayer] = useState(0);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const [transitioning, setTransitioning] = useState(false);
  const readings = useMemo(() => sensorReadings(latest), [latest]);

  useEffect(() => {
    dashboardPreload();
  }, []);

  useEffect(() => {
    if (reducedMotion || !storyRef.current) {
      setProgress(1);
      return undefined;
    }

    const trigger = ScrollTrigger.create({
      trigger: storyRef.current,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.35,
      onUpdate: (self) => setProgress(Number(self.progress.toFixed(3))),
    });

    return () => trigger.kill();
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const handleMove = (event) => {
      setParallax({
        x: (event.clientX / window.innerWidth - 0.5) * 2,
        y: (event.clientY / window.innerHeight - 0.5) * 2,
      });
    };
    window.addEventListener('pointermove', handleMove, { passive: true });
    return () => window.removeEventListener('pointermove', handleMove);
  }, [reducedMotion]);

  const enterDashboard = useCallback(async () => {
    if (transitioning) return;
    setTransitioning(true);
    await dashboardPreload();
    window.sessionStorage?.setItem('nxtyield-dashboard-arrival', 'true');
    window.setTimeout(() => navigate('/dashboard'), reducedMotion ? 180 : 1850);
  }, [navigate, reducedMotion, transitioning]);

  const scrollToSystem = () => {
    document.getElementById('system-story')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <div className="landing-page" ref={rootRef}>
      <TransitionOverlay active={transitioning} />
      <header className="landing-topbar" aria-label="NxTYield landing navigation">
        <div className="landing-mark">
          <img className="landing-mark__logo" src="/nxtyield-logo.png" alt="" aria-hidden="true" />
          <span>NxTYield</span>
        </div>
        <button type="button" onClick={enterDashboard} disabled={transitioning}>Enter dashboard</button>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-visual" aria-label="Cinematic 3D farm intelligence preview">
            <Suspense fallback={<div className="landing-canvas-loading"><strong>NXTYIELD</strong><span>INITIALIZING FIELD INTELLIGENCE</span><i /></div>}>
              <LandingFarmCanvas latest={latest} weather={weather} summary={summary} progress={progress} parallax={parallax} reducedMotion={reducedMotion} />
            </Suspense>
            <div className="soil-scanner" aria-hidden="true" />
            <div className="landing-readouts" aria-label="Live sensor preview">
              {readings.map(({ icon: Icon, label, value }) => (
                <div className="landing-readout" key={label}>
                  <Icon size={20} aria-hidden="true" />
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="landing-hero-copy">
            <p className="landing-eyebrow">NXTYIELD / FARMSENSE AI</p>
            <h1 id="landing-title">Know the <span className="landing-title-highlight">field.</span><br />Predict what's next.<br /><span className="landing-title-highlight landing-title-highlight--green">Act in time.</span></h1>
            <p>NxTYield transforms live soil, weather and nutrient data into intelligent recommendations and automated farm actions.</p>
            <div className="landing-actions">
              <button className="landing-primary" type="button" onClick={enterDashboard} disabled={transitioning}>
                Optimize Your Farm <ArrowRight size={18} aria-hidden="true" />
              </button>
              <button className="landing-secondary" type="button" onClick={scrollToSystem}>Explore the System</button>
            </div>
            <span className="landing-trust">Live sensing / AI decisions / Automated irrigation</span>
          </div>
        </section>

        <section className="landing-story" ref={storyRef} aria-label="NxTYield hardware to intelligence story">
          {storySections.map((section, index) => (
            <article className="landing-story-panel" key={section.id}>
              <span>{section.kicker}</span>
              <h2>{section.title}</h2>
              <p>{section.copy}</p>
              {index === 1 && (
                <div className="decision-stack" aria-label="Decision outputs">
                  {['Farm Health Score', 'Irrigation decision', 'Nutrient condition', 'Crop guidance', 'Weather-aware recommendation'].map((item) => <b key={item}>{item}</b>)}
                </div>
              )}
              {index === 2 && (
                <div className="response-list" aria-label="Automated response capabilities">
                  {['Automated irrigation', 'Weather-aware decisions', 'Nutrient monitoring', 'Crop recommendations', 'Continuous farm intelligence'].map((item) => <b key={item}>{item}</b>)}
                </div>
              )}
            </article>
          ))}
        </section>

        <section className="landing-system" id="system-story" aria-labelledby="system-title">
          <div className="landing-section-copy">
            <span>Why NxTYield exists</span>
            <h2 id="system-title">Built for farmers who <span className="landing-title-highlight">cannot afford to guess.</span></h2>
            <p>For small and marginal farmers, every irrigation cycle, nutrient decision and weather change matters. NxTYield brings sensing, intelligence and automation together without turning farm management into a complicated technical system.</p>
          </div>
          <div className="system-path" aria-label="NxTYield operating path">
            {[
              ['Field Sensors', Radio],
              ['NxTYield Intelligence', BrainCircuit],
              ['Farmer Guidance', Sprout],
              ['Automated Action', Cpu],
            ].map(([label, Icon]) => (
              <div className="system-node" key={label}>
                <Icon size={24} aria-hidden="true" />
                <strong>{label}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-capabilities" aria-labelledby="capabilities-title">
          <div className="landing-section-copy">
            <span>System capabilities</span>
            <h2 id="capabilities-title"><span className="landing-title-highlight landing-title-highlight--green">One operating surface</span> for the farm.</h2>
          </div>
          <div className="capability-rail">
            {capabilities.map(([title, copy], index) => (
              <button type="button" className="capability-row" key={title} onFocus={() => setActiveLayer(index)} onMouseEnter={() => setActiveLayer(index)}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{title}</strong>
                <small>{copy}</small>
              </button>
            ))}
          </div>
          <div className="capability-signal" aria-hidden="true">
            <span style={{ transform: `translateY(${activeLayer * 2.1}rem)` }} />
          </div>
        </section>

        <section className="landing-team" aria-labelledby="team-title">
          <div className="landing-section-copy">
            <span>Team</span>
            <h2 id="team-title">Built across every layer.</h2>
            <p>From the soil probe to the intelligence behind the dashboard, NxTYield was engineered as one connected system.</p>
          </div>
          <div className="team-layers">
            {team.map(([name, layer, role, leader], index) => (
              <button type="button" className="team-layer" key={name} onFocus={() => setActiveLayer(index)} onMouseEnter={() => setActiveLayer(index)}>
                <span>{layer}</span>
                <strong>{name}{leader && <em className="team-leader-badge">(Leader)</em>}</strong>
                <small>{role}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="landing-final" aria-labelledby="final-title">
          <p className="landing-eyebrow">Operational dashboard ready</p>
          <h2 id="final-title">The next yield begins with the <span className="landing-title-highlight">next decision.</span></h2>
          <p>Enter the NxTYield Farm Intelligence Dashboard</p>
          <div className="landing-actions">
            <button className="landing-primary" type="button" onClick={enterDashboard} disabled={transitioning}>
              Optimize Your Farm <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button className="landing-secondary" type="button" onClick={() => window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' })}>
              Return to top <RotateCcw size={18} aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Landing;

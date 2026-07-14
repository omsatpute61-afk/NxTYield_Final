/* eslint-disable react-hooks/immutability */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, RoundedBox } from '@react-three/drei';
import { Clock, Maximize2, Pause, Play, RotateCcw, Tag, TimerReset } from 'lucide-react';
import * as THREE from 'three';
import { compactValue, formatShortTime, hasSensorData, toNumber } from '../lib/farmUtils';
import { timeLightingFromHour } from '../lib/timeLighting';
import './DigitalFarmTwin.css';

const DAY_MS = 86400000;
const DEMO_DAY_MS = 55000;
const FARM_WIDTH = 7.6;
const FARM_DEPTH = 4.8;
const ROWS = [-1.45, -0.82, -0.19, 0.44, 1.07, 1.7];
const FARMER_HUT_POSITION = [-3.42, 0.13, 0.92];
const FARMER_HUT_ROTATION_Y = -0.06;
const FARMER_HUT_SCALE = 1.08;
const FARMER_ENTRY_X = -3.45;
const FARMER_LANE_Z = 1.38;
const FARMER_HUT_INNER_X = -3.42;
const FARMER_HUT_INNER_Z = 1.03;
const NUTRIENT_RANGES = {
  nitrogen: [20, 40],
  phosphorus: [12, 35],
  potassium: [150, 250],
};
const CLOUD_PUFFS = [
  [-0.38, -0.02, 0, 0.3],
  [-0.12, 0.08, 0.02, 0.42],
  [0.2, 0.06, 0, 0.36],
  [0.48, -0.02, 0.02, 0.26],
  [0.04, -0.08, 0.08, 0.32],
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function mixNumber(start, end, amount) {
  return start + (end - start) * amount;
}

function mixColor(start, end, amount) {
  return new THREE.Color(start).lerp(new THREE.Color(end), clamp(amount, 0, 1)).getStyle();
}

function currentStoryProgress(fallback = 0) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  const story = document.querySelector('.landing-story');
  const storyDistance = story ? story.offsetHeight - window.innerHeight : 0;
  if (!story || storyDistance <= 0) return fallback;
  return clamp((window.scrollY - story.offsetTop) / storyDistance, 0, 1);
}

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

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

function useInViewport(ref) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element || !window.IntersectionObserver) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.06 },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return visible;
}

function useDemoClock(mode, paused) {
  const [now, setNow] = useState(() => new Date());
  const demoOffset = useRef(7.1 * 60 * 60 * 1000);
  const previousTick = useRef(null);

  useEffect(() => {
    previousTick.current = Date.now();
  }, [mode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const tick = Date.now();
      const delta = previousTick.current === null ? 0 : tick - previousTick.current;
      previousTick.current = tick;

      if (mode === 'demo') {
        if (!paused) demoOffset.current = (demoOffset.current + delta * (DAY_MS / DEMO_DAY_MS)) % DAY_MS;
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        setNow(new Date(dayStart.getTime() + demoOffset.current));
      } else {
        setNow(new Date());
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [mode, paused]);

  return now;
}

function environmentFromData({ latest, weather, insights, summary, currentTime, demoMode }) {
  const moisture = toNumber(latest?.moisture);
  const health = toNumber(summary?.healthScore) ?? toNumber(latest?.health_score);
  const apiWindSpeed = toNumber(weather?.current?.wind_speed);
  const apiWindDirection = toNumber(weather?.current?.wind_direction);
  const description = String(weather?.current?.description || '').toLowerCase();
  const hour = currentTime.getHours() + currentTime.getMinutes() / 60;
  const lighting = timeLightingFromHour(hour);
  const nutrientIssues = Object.entries(NUTRIENT_RANGES)
    .filter(([key, [low, high]]) => {
      const value = toNumber(latest?.[key]);
      return value !== null && (value < low || value > high);
    })
    .map(([key]) => key);

  return {
    moisture,
    health,
    windSpeed: apiWindSpeed ?? 6,
    windDirection: apiWindDirection ?? 45,
    windFromApi: apiWindSpeed !== null,
    windDirectionFromApi: apiWindDirection !== null,
    rainDetected: latest?.rain_detected === true || description.includes('rain') || description.includes('drizzle'),
    cloudy: description.includes('cloud') || description.includes('overcast'),
    irrigationActive: latest?.irrigation_active === true,
    hasSensor: hasSensorData(latest),
    cropName: insights?.crop_health?.crop || insights?.crop_health?.status || 'Field crop',
    updatedAt: latest?.timestamp,
    timeLabel: demoMode ? `Demo ${formatShortTime(currentTime.toISOString())}` : formatShortTime(currentTime.toISOString()),
    ...lighting,
    soilWetness: clamp((moisture ?? 52) / 100, 0, 1),
    cropHealth: clamp((health ?? 70) / 100, 0, 1),
    nutrientIssues,
  };
}

function soilColor(env) {
  if (env.soilWetness < 0.34) return '#8a5a32';
  if (env.soilWetness > 0.72 || env.rainDetected || env.irrigationActive) return '#302119';
  return '#5b351f';
}

function cropColor(env) {
  if (env.cropHealth > 0.72) return '#3f8e55';
  if (env.cropHealth > 0.45) return '#86a64b';
  return '#9b7a36';
}

function FarmBase({ env }) {
  const top = soilColor(env);
  return (
    <group>
      <RoundedBox args={[FARM_WIDTH, 0.55, FARM_DEPTH]} radius={0.12} smoothness={3} position={[0, -0.34, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#3b271b" roughness={0.86} />
      </RoundedBox>
      <RoundedBox args={[FARM_WIDTH - 0.12, 0.16, FARM_DEPTH - 0.12]} radius={0.08} smoothness={2} position={[0, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={top} roughness={0.94} />
      </RoundedBox>
      {ROWS.map((z, index) => (
        <mesh key={z} position={[0, 0.13, z]} receiveShadow>
          <boxGeometry args={[6.75, 0.16, 0.27]} />
          <meshStandardMaterial color={index % 2 ? '#4b2f1f' : top} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function CropField({ env, reducedMotion }) {
  const fieldRef = useRef(null);
  const stemRef = useRef(null);
  const leafRef = useRef(null);
  const plants = useMemo(() => {
    const output = [];
    ROWS.forEach((z, row) => {
      for (let i = 0; i < 8; i += 1) {
        const x = -3.05 + (i / 7) * 6.1 + Math.sin(i * 5.9 + row) * 0.05;
        output.push({ x, z: z + Math.cos(i * 2.7 + row) * 0.04, row, index: output.length });
      }
    });
    return output;
  }, []);

  useEffect(() => {
    if (!stemRef.current || !leafRef.current) return;

    const dummy = new THREE.Object3D();
    plants.forEach((plant) => {
      const scale = 0.86 + (plant.index % 4) * 0.07;
      dummy.position.set(plant.x, 0.33, plant.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      stemRef.current.setMatrixAt(plant.index, dummy.matrix);
    });
    stemRef.current.instanceMatrix.needsUpdate = true;

    plants.forEach((plant) => {
      const scale = 0.86 + (plant.index % 4) * 0.07;
      [0, 1, 2].forEach((leaf) => {
        const leafIndex = plant.index * 3 + leaf;
        const angle = (leaf / 3) * Math.PI * 2 + plant.index * 0.2;
        dummy.position.set(plant.x, 0.52 + leaf * 0.018, plant.z);
        dummy.rotation.set(0.45, angle, 0.25);
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        leafRef.current.setMatrixAt(leafIndex, dummy.matrix);
      });
    });
    leafRef.current.instanceMatrix.needsUpdate = true;
  }, [plants]);

  useFrame(({ clock }) => {
    if (!fieldRef.current || reducedMotion) return;
    const speed = clamp(env.windSpeed, 0, 28);
    const strength = speed <= 3 ? 0.006 : speed <= 10 ? 0.014 : speed <= 20 ? 0.024 : 0.035;
    fieldRef.current.rotation.z = Math.sin(clock.elapsedTime * 1.6) * strength;
    fieldRef.current.rotation.x = Math.cos(clock.elapsedTime * 0.9) * strength * 0.55;
  });

  return (
    <group ref={fieldRef}>
      <instancedMesh ref={stemRef} args={[undefined, undefined, plants.length]} receiveShadow>
        <cylinderGeometry args={[0.025, 0.035, 0.34, 4]} />
        <meshStandardMaterial color="#2f6d3f" roughness={0.75} />
      </instancedMesh>
      <instancedMesh ref={leafRef} args={[undefined, undefined, plants.length * 3]}>
        <coneGeometry args={[0.075, 0.34, 3]} />
        <meshStandardMaterial color={cropColor(env)} roughness={0.72} side={THREE.DoubleSide} />
      </instancedMesh>
      {ROWS.map((z, index) => {
        const issue = env.nutrientIssues[index % 3];
        if (!issue) return null;
        return (
          <mesh key={`issue-${z}`} position={[3.55, 0.26, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.035, 0.035, 0.55, 10]} />
            <meshStandardMaterial color="#d89b2b" emissive="#3a2304" emissiveIntensity={0.45} />
          </mesh>
        );
      })}
    </group>
  );
}

function Pipe({ position, rotation = [0, 0, 0], length, radius = 0.04, active }) {
  return (
    <mesh position={position} rotation={rotation} receiveShadow>
      <cylinderGeometry args={[radius, radius, length, 12]} />
      <meshStandardMaterial color={active ? '#284e5f' : '#273431'} metalness={0.25} roughness={0.45} />
    </mesh>
  );
}

function IrrigationSystem({ env, reducedMotion }) {
  const dots = useRef([]);

  useFrame(({ clock }) => {
    if (!env.irrigationActive || reducedMotion) return;
    dots.current.forEach((dot, index) => {
      if (!dot) return;
      const t = (clock.elapsedTime * 0.72 + index * 0.2) % 1;
      dot.position.x = -3.05 + t * 6.1;
      dot.visible = true;
    });
  });

  useEffect(() => {
    if (!env.irrigationActive) dots.current.forEach((dot) => { if (dot) dot.visible = false; });
  }, [env.irrigationActive]);

  return (
    <group>
      <Pipe position={[-3.45, 0.24, 0]} rotation={[Math.PI / 2, 0, 0]} length={4.1} radius={0.055} active={env.irrigationActive} />
      {ROWS.map((z) => (
        <Pipe key={z} position={[0, 0.22, z - 0.2]} rotation={[0, 0, Math.PI / 2]} length={6.55} radius={0.025} active={env.irrigationActive} />
      ))}
      <RoundedBox args={[0.42, 0.34, 0.42]} radius={0.04} smoothness={2} position={[-3.55, 0.36, -2.0]}>
        <meshStandardMaterial color="#202a27" roughness={0.58} metalness={0.25} />
      </RoundedBox>
      <mesh position={[-3.55, 0.58, -2.0]}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshStandardMaterial color={env.irrigationActive ? '#5ec8e5' : '#445452'} emissive={env.irrigationActive ? '#2d7d92' : '#000'} emissiveIntensity={env.irrigationActive ? 1.2 : 0.1} />
      </mesh>
      {ROWS.map((z, row) => (
        <group key={`flow-${z}`}>
          {[0, 1].map((dot) => (
            <mesh
              key={dot}
              ref={(mesh) => { dots.current[row * 2 + dot] = mesh; }}
              position={[-3.05 + dot * 1.6, 0.255, z - 0.2]}
              visible={env.irrigationActive}
            >
              <sphereGeometry args={[0.035, 10, 10]} />
              <meshStandardMaterial color="#61c7df" emissive="#2f8194" emissiveIntensity={1} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function sensorData(latest, id) {
  if (id === 'moisture') return { label: 'Soil moisture', value: toNumber(latest?.moisture), unit: '%' };
  if (id === 'npk') {
    const values = [latest?.nitrogen, latest?.phosphorus, latest?.potassium];
    return { label: 'NPK sensor', value: values.some((v) => toNumber(v) !== null) ? values.map((v) => compactValue(v)).join(' / ') : null, unit: 'NPK' };
  }
  if (id === 'soil_temperature') return { label: 'Soil temperature', value: toNumber(latest?.soil_temperature), unit: 'C' };
  return { label: 'Weather station', value: toNumber(latest?.air_temperature), unit: 'C air' };
}

function SensorDevice({ id, type, position, latest, env, labelsVisible, selected, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const data = sensorData(latest, id);
  const hasValue = data.value !== null && data.value !== undefined && data.value !== '';
  const warning = !hasValue || (id === 'npk' && env.nutrientIssues.length > 0);
  const showLabel = hovered || labelsVisible || selected;
  const ledColor = hasValue ? (warning ? '#d89b2b' : '#4caf75') : '#6d746f';

  return (
    <group
      position={position}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        setHovered(false);
        document.body.style.cursor = '';
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(id);
      }}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.055, 0]} receiveShadow>
        <circleGeometry args={[0.25, 18]} />
        <meshBasicMaterial color={warning ? '#5a3a13' : '#17382d'} transparent opacity={0.55} />
      </mesh>
      <RoundedBox args={[0.28, 0.22, 0.24]} radius={0.035} smoothness={2} position={[0, 0.27, 0]}>
        <meshStandardMaterial color="#202824" roughness={0.55} metalness={0.18} />
      </RoundedBox>
      <mesh position={[0.09, 0.39, 0.04]}>
        <sphereGeometry args={[0.035, 10, 10]} />
        <meshStandardMaterial color={ledColor} emissive={ledColor} emissiveIntensity={hasValue ? 0.75 : 0.12} />
      </mesh>
      {type === 'station' ? (
        <>
          <mesh position={[0, 0.62, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.55, 8]} />
            <meshStandardMaterial color="#929b95" metalness={0.65} roughness={0.28} />
          </mesh>
          <mesh position={[0, 0.89, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.018, 0.018, 0.46, 8]} />
            <meshStandardMaterial color="#b9c2bd" metalness={0.55} roughness={0.25} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[-0.06, 0.1, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.42, 8]} />
            <meshStandardMaterial color="#9aa39d" metalness={0.7} roughness={0.22} />
          </mesh>
          <mesh position={[0.07, 0.1, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.42, 8]} />
            <meshStandardMaterial color="#9aa39d" metalness={0.7} roughness={0.22} />
          </mesh>
        </>
      )}
      {showLabel && (
        <Html center distanceFactor={5.6} position={[0, 0.78, 0]} className="dft-tooltip-wrap">
          <div className="dft-tooltip">
            <strong>{data.label}</strong>
            <span>{hasValue ? `${data.value} ${data.unit}` : 'Waiting for sensor data'}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

function FarmSensors({ env, latest, labelsVisible, selectedSensor, onSelectSensor }) {
  const sensors = [
    { id: 'moisture', type: 'probe', position: [-2.45, 0.12, -1.1] },
    { id: 'npk', type: 'probe', position: [2.3, 0.12, 1.05] },
    { id: 'soil_temperature', type: 'probe', position: [-0.35, 0.12, 1.95] },
    { id: 'weather_station', type: 'station', position: [3.25, 0.12, -1.9] },
  ];
  return sensors.map((sensor) => (
    <SensorDevice
      key={sensor.id}
      {...sensor}
      env={env}
      latest={latest}
      labelsVisible={labelsVisible}
      selected={selectedSensor === sensor.id}
      onSelect={onSelectSensor}
    />
  ));
}

function FieldTree({ env, reducedMotion }) {
  const canopy = useRef(null);
  const leafColor = env.cropHealth > 0.52 ? '#2f7651' : '#6f8036';
  const leafAccent = env.cropHealth > 0.52 ? '#4d9a64' : '#8b8a3a';

  useFrame(({ clock }) => {
    if (!canopy.current || reducedMotion) return;
    canopy.current.rotation.z = Math.sin(clock.elapsedTime * 0.9) * 0.035;
    canopy.current.rotation.x = Math.cos(clock.elapsedTime * 0.7) * 0.018;
  });

  return (
    <group position={[-3.28, 0.16, -2.05]} scale={[1.18, 1.18, 1.18]}>
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.46, 24]} />
        <meshBasicMaterial color="#17231c" transparent opacity={0.42} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.48, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.11, 0.76, 8]} />
        <meshStandardMaterial color="#5b351f" roughness={0.86} />
      </mesh>
      <mesh position={[0.1, 0.86, 0.02]} rotation={[0.2, 0.1, -0.5]} castShadow>
        <cylinderGeometry args={[0.025, 0.035, 0.42, 7]} />
        <meshStandardMaterial color="#5b351f" roughness={0.82} />
      </mesh>
      <mesh position={[-0.1, 0.82, -0.02]} rotation={[0.25, -0.1, 0.55]} castShadow>
        <cylinderGeometry args={[0.022, 0.032, 0.36, 7]} />
        <meshStandardMaterial color="#5b351f" roughness={0.82} />
      </mesh>
      <group ref={canopy}>
        <mesh position={[0, 1.08, 0]} castShadow>
          <sphereGeometry args={[0.33, 18, 12]} />
          <meshStandardMaterial color={leafColor} roughness={0.8} />
        </mesh>
        <mesh position={[0.24, 0.96, 0.05]} castShadow>
          <sphereGeometry args={[0.26, 16, 10]} />
          <meshStandardMaterial color={leafAccent} roughness={0.82} />
        </mesh>
        <mesh position={[-0.22, 0.98, -0.04]} castShadow>
          <sphereGeometry args={[0.25, 16, 10]} />
          <meshStandardMaterial color="#245f42" roughness={0.84} />
        </mesh>
        <mesh position={[0.02, 1.27, -0.02]} castShadow>
          <sphereGeometry args={[0.23, 16, 10]} />
          <meshStandardMaterial color="#3f8e55" roughness={0.78} />
        </mesh>
      </group>
    </group>
  );
}

function FarmerHut() {
  return (
    <group position={FARMER_HUT_POSITION} rotation={[0, FARMER_HUT_ROTATION_Y, 0]} scale={[FARMER_HUT_SCALE, FARMER_HUT_SCALE, FARMER_HUT_SCALE]}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.82, 28]} />
        <meshBasicMaterial color="#152018" transparent opacity={0.42} depthWrite={false} />
      </mesh>

      <mesh position={[0, 0.32, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.46, 0.5, 0.62, 18]} />
        <meshStandardMaterial color="#6a4329" roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.3, 0.43]} castShadow>
        <boxGeometry args={[0.28, 0.42, 0.035]} />
        <meshStandardMaterial color="#1b1510" roughness={0.9} />
      </mesh>
      <mesh position={[-0.2, 0.38, 0.39]} castShadow>
        <boxGeometry args={[0.12, 0.11, 0.032]} />
        <meshStandardMaterial color="#101916" roughness={0.82} />
      </mesh>

      <mesh position={[0, 0.78, 0]} castShadow>
        <coneGeometry args={[0.7, 0.56, 22]} />
        <meshStandardMaterial color="#c49342" roughness={0.96} />
      </mesh>
      {[0.24, 0.38, 0.52].map((radius, index) => (
        <mesh key={radius} position={[0, 0.71 - index * 0.09, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius, 0.009, 6, 28]} />
          <meshStandardMaterial color="#8d642b" roughness={0.92} />
        </mesh>
      ))}
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2;
        return (
          <mesh
            key={angle}
            position={[Math.cos(angle) * 0.24, 0.67, Math.sin(angle) * 0.24]}
            rotation={[0.72, angle, 0]}
            castShadow
          >
            <cylinderGeometry args={[0.006, 0.01, 0.58, 5]} />
            <meshStandardMaterial color="#d1a34d" roughness={0.98} />
          </mesh>
        );
      })}

      <group position={[0.5, 0.13, 0.66]} rotation={[0, 0.12, 0]}>
        <mesh position={[0, 0.16, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.18, 0.08, 12]} />
          <meshStandardMaterial color="#5d3b25" roughness={0.82} />
        </mesh>
        {[-0.09, 0.09].map((x) => (
          <mesh key={x} position={[x, 0.08, 0]} castShadow>
            <cylinderGeometry args={[0.018, 0.022, 0.18, 6]} />
            <meshStandardMaterial color="#3f2a1c" roughness={0.86} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function LampPost({ env }) {
  const skyLight = env.skyLight ?? env.daylight;
  const lampOn = env.night || skyLight < 0.2;
  const glowOpacity = lampOn ? 0.18 : 0;
  const bulbColor = lampOn ? '#f2c56b' : '#5f6258';

  return (
    <group position={[-3.18, 0.12, 1.62]}>
      <mesh position={[0, 0.43, 0]}>
        <cylinderGeometry args={[0.025, 0.032, 0.86, 8]} />
        <meshStandardMaterial color="#5f6a65" metalness={0.42} roughness={0.36} />
      </mesh>
      <mesh position={[0.16, 0.84, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.34, 8]} />
        <meshStandardMaterial color="#68736d" metalness={0.42} roughness={0.34} />
      </mesh>
      <mesh position={[0.34, 0.79, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.095, 0.16, 14]} />
        <meshStandardMaterial color="#2d3430" metalness={0.24} roughness={0.48} />
      </mesh>
      <mesh position={[0.34, 0.71, 0]}>
        <sphereGeometry args={[0.052, 14, 10]} />
        <meshStandardMaterial color={bulbColor} emissive={bulbColor} emissiveIntensity={lampOn ? 1.65 : 0.12} roughness={0.38} />
      </mesh>
      {lampOn && <pointLight position={[0.34, 0.68, 0]} color="#f1c36b" intensity={1.25} distance={2.8} decay={2} />}
      <mesh position={[0.34, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.72, 28]} />
        <meshBasicMaterial color="#f1c36b" transparent opacity={glowOpacity} depthWrite={false} />
      </mesh>
      <mesh position={[0.34, 0.42, 0]}>
        <coneGeometry args={[0.55, 0.82, 24, 1, true]} />
        <meshBasicMaterial color="#f1c36b" transparent opacity={lampOn ? 0.1 : 0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Rain({ active, reducedMotion }) {
  const group = useRef(null);
  const drops = useMemo(() => Array.from({ length: 36 }, (_, i) => ({
    x: (Math.sin(i * 12.9) - Math.floor(Math.sin(i * 12.9))) * 8 - 4,
    y: 0.8 + ((i * 17) % 30) / 8,
    z: (Math.cos(i * 7.7) - Math.floor(Math.cos(i * 7.7))) * 5 - 2.5,
  })), []);

  useFrame((_, delta) => {
    if (!active || reducedMotion || !group.current) return;
    group.current.children.forEach((drop, index) => {
      drop.position.y -= delta * 3;
      drop.position.x -= delta * 0.12;
      if (drop.position.y < 0.1) {
        drop.position.y = 3.8 + (index % 7) * 0.08;
        drop.position.x = drops[index].x;
      }
    });
  });

  if (!active) return null;
  return (
    <group ref={group}>
      {drops.map((drop, index) => (
        <mesh key={index} position={[drop.x, drop.y, drop.z]} rotation={[0.45, 0, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.28, 4]} />
          <meshBasicMaterial color="#82bfd0" transparent opacity={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function CloudCluster({ position, scale = 1, opacity = 0.35, color = '#c4d1c9', phase = 0, reducedMotion }) {
  const group = useRef(null);

  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return;
    const drift = clock.elapsedTime * 0.12 + phase;
    group.current.position.x = position[0] + Math.sin(drift) * 0.18;
    group.current.position.y = position[1] + Math.cos(drift * 0.8) * 0.04;
    group.current.position.z = position[2] + Math.cos(drift * 0.7) * 0.05;
  });

  return (
    <group ref={group} position={position} scale={[scale, scale, scale]}>
      {CLOUD_PUFFS.map(([x, y, z, radius], index) => (
        <mesh key={`${phase}-${index}`} position={[x, y, z]}>
          <sphereGeometry args={[radius, 18, 12]} />
          <meshStandardMaterial color={color} roughness={0.98} transparent opacity={opacity} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function SunMoonClouds({ env, storyProgress = 1, reducedMotion }) {
  const sunRef = useRef(null);
  const moonRef = useRef(null);
  const p = clamp(storyProgress, 0, 1);
  const sunLight = env.sunLight ?? env.daylight;
  const skyLight = env.skyLight ?? env.daylight;
  const sunOpacity = clamp(sunLight * 0.84 + (env.golden || 0) * 0.24, 0.04, 0.9);
  const moonOpacity = clamp((env.moonLight ?? (1 - skyLight)) * 0.76, 0, 0.76);
  const storming = env.rainDetected;
  const cloudColor = storming ? '#0b0f0d' : '#c4d1c9';
  const cloudOpacity = storming
    ? 0.82
    : clamp((env.cloudy ? 0.5 : 0.22) + (env.rainDetected ? 0.16 : 0), 0.16, 0.7);
  const sunPosition = [-4.2 + p * 7.2, 3.15 + Math.sin(p * Math.PI) * 1.25, -3.4];
  const moonPosition = [4.1 - p * 7.4, 3.85 + Math.sin((1 - p) * Math.PI) * 0.45, -3.65];

  useFrame(({ clock }) => {
    if (reducedMotion) return;
    if (sunRef.current) sunRef.current.rotation.z = clock.elapsedTime * 0.08;
    if (moonRef.current) moonRef.current.rotation.z = -clock.elapsedTime * 0.035;
  });

  return (
    <group>
      <group ref={sunRef} position={sunPosition}>
        <mesh>
          <sphereGeometry args={[0.32, 32, 18]} />
          <meshBasicMaterial color="#f2b85b" transparent opacity={sunOpacity} depthWrite={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.62, 32, 18]} />
          <meshBasicMaterial color="#f2b85b" transparent opacity={sunOpacity * 0.12} depthWrite={false} />
        </mesh>
      </group>

      {moonOpacity > 0 && (
        <group ref={moonRef} position={moonPosition}>
          <mesh>
            <sphereGeometry args={[0.28, 32, 18]} />
            <meshBasicMaterial color="#d8e4df" transparent opacity={moonOpacity} depthWrite={false} />
          </mesh>
          <mesh position={[0.12, 0.03, 0.03]}>
            <sphereGeometry args={[0.27, 32, 18]} />
            <meshBasicMaterial color={mixColor('#111922', '#18231f', skyLight)} transparent opacity={0.9} depthWrite={false} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.54, 32, 18]} />
            <meshBasicMaterial color="#d8e4df" transparent opacity={moonOpacity * 0.08} depthWrite={false} />
          </mesh>
        </group>
      )}

      <CloudCluster position={[-4.65 + p * 0.5, 3.42, -3.35]} scale={0.86} opacity={cloudOpacity * 0.58} color={cloudColor} phase={5.2} reducedMotion={reducedMotion} />
      <CloudCluster position={[-3.9 + p * 0.45, 3.1, -3.1]} scale={1.08} opacity={cloudOpacity * 0.72} color={cloudColor} phase={0.2} reducedMotion={reducedMotion} />
      <CloudCluster position={[-1.72 + p * 0.28, 3.72, -3.72]} scale={1.18} opacity={cloudOpacity * 0.64} color={cloudColor} phase={4.4} reducedMotion={reducedMotion} />
      <CloudCluster position={[0.45 + p * 0.55, 4.1, -3.8]} scale={1.35} opacity={cloudOpacity * 0.56} color={cloudColor} phase={1.7} reducedMotion={reducedMotion} />
      <CloudCluster position={[2.1 - p * 0.22, 3.58, -3.55]} scale={1.16} opacity={cloudOpacity * 0.66} color={cloudColor} phase={2.4} reducedMotion={reducedMotion} />
      <CloudCluster position={[3.8 - p * 0.35, 2.85, -3.25]} scale={0.98} opacity={cloudOpacity * 0.62} color={cloudColor} phase={3.1} reducedMotion={reducedMotion} />
      <CloudCluster position={[4.75 - p * 0.42, 3.75, -3.9]} scale={0.9} opacity={cloudOpacity * 0.5} color={cloudColor} phase={6.0} reducedMotion={reducedMotion} />
    </group>
  );
}

function FarmerFertilizerAction({ storyProgress = 1, reducedMotion }) {
  const group = useRef(null);
  const body = useRef(null);
  const leftArm = useRef(null);
  const rightArm = useRef(null);
  const leftLeg = useRef(null);
  const rightLeg = useRef(null);
  const spray = useRef(null);
  const mist = useRef(null);
  const p = clamp(storyProgress, 0, 1);
  const entrance = smoothstep(0.62, 0.76, p);
  const sprayAmount = smoothstep(0.69, 0.76, p) * (1 - smoothstep(0.78, 0.84, p));
  const returnHome = smoothstep(0.82, 0.94, p);
  const enterHut = smoothstep(0.94, 0.99, p);
  const scale = 0.78 + entrance * 0.22;
  const laneZ = FARMER_LANE_Z;
  const entryX = FARMER_ENTRY_X;
  const workX = entryX + 4.42;
  const hutInnerX = FARMER_HUT_INNER_X;
  const hutInnerZ = FARMER_HUT_INNER_Z;
  const initialX = mixNumber(entryX, workX, entrance);
  const doorX = mixNumber(initialX, entryX, returnHome);
  const position = [mixNumber(doorX, hutInnerX, enterHut), 0.2, mixNumber(laneZ, hutInnerZ, enterHut)];
  const entryScale = scale * mixNumber(1, 0.78, enterHut);
  const initiallyVisible = (reducedMotion || p >= 0.6) && enterHut < 0.985;
  const sprayParticles = useMemo(() => Array.from({ length: 44 }, (_, index) => {
    const seedA = Math.sin(index * 17.91) * 0.5 + 0.5;
    const seedB = Math.cos(index * 11.37) * 0.5 + 0.5;
    return {
      offset: (index * 0.137 + seedA * 0.31) % 1,
      spread: (seedA - 0.5) * 0.76,
      lift: (seedB - 0.5) * 0.11,
      radius: 0.02 + seedB * 0.017,
    };
  }), []);

  useFrame(({ clock }) => {
    if (!group.current) return;

    const scrollProgress = currentStoryProgress(0);
    const activeProgress = Math.max(p, scrollProgress);
    const activeEntrance = smoothstep(0.62, 0.76, activeProgress);
    const activeSprayAmount = smoothstep(0.69, 0.76, activeProgress) * (1 - smoothstep(0.78, 0.84, activeProgress));
    const activeReturnHome = smoothstep(0.82, 0.94, activeProgress);
    const activeEnterHut = smoothstep(0.94, 0.99, activeProgress);
    const activeDuckAmount = smoothstep(0.955, 0.99, activeProgress);
    const entranceWalking = 1 - smoothstep(0.76, 0.84, activeProgress);
    const returnWalking = smoothstep(0.82, 0.88, activeProgress) * (1 - smoothstep(0.98, 1, activeProgress));
    const activeWalking = Math.max(entranceWalking, returnWalking);
    const visible = (reducedMotion || activeProgress >= 0.6) && activeEnterHut < 0.985;

    group.current.visible = visible;
    if (!visible) return;
    const activeWorkX = mixNumber(entryX, workX, activeEntrance);
    const activeDoorX = mixNumber(activeWorkX, entryX, activeReturnHome);
    group.current.position.set(
      mixNumber(activeDoorX, hutInnerX, activeEnterHut),
      0.2 - activeDuckAmount * 0.05,
      mixNumber(laneZ, hutInnerZ, activeEnterHut),
    );
    group.current.rotation.y = mixNumber(-0.04, Math.PI - 0.12, activeReturnHome);
    group.current.scale.setScalar((0.78 + activeEntrance * 0.22) * mixNumber(1, 0.78, activeEnterHut));

    const phase = clock.elapsedTime * 8.6;
    const stride = reducedMotion ? 0 : Math.sin(phase) * 0.34 * activeWalking;
    const bob = reducedMotion ? 0 : Math.abs(Math.sin(phase)) * 0.025 * activeWalking;

    if (body.current) {
      body.current.position.y = bob - activeDuckAmount * 0.08;
      body.current.rotation.x = activeDuckAmount * -0.12;
    }
    if (leftLeg.current) leftLeg.current.rotation.x = mixNumber(stride, 0.22, activeDuckAmount);
    if (rightLeg.current) rightLeg.current.rotation.x = mixNumber(-stride, -0.18, activeDuckAmount);
    if (leftArm.current) leftArm.current.rotation.x = mixNumber(-stride * 0.65, 0.1, activeDuckAmount);
    if (rightArm.current) {
      const sprayPose = -1.22 + Math.sin(clock.elapsedTime * 2.4) * 0.04 * activeSprayAmount;
      rightArm.current.rotation.z = mixNumber(sprayPose, -0.26, activeDuckAmount);
    }

    if (mist.current) {
      const mistVisible = activeSprayAmount > 0.05;
      mist.current.visible = mistVisible;
      if (mist.current.material) mist.current.material.opacity = activeSprayAmount * 0.18;
    }

    if (!spray.current) return;
    spray.current.children.forEach((particle, index) => {
      const source = sprayParticles[index];
      const flow = activeSprayAmount > 0.05;
      particle.visible = flow;
      if (!flow) return;

      const t = reducedMotion ? source.offset : (clock.elapsedTime * 0.92 + source.offset) % 1;
      particle.position.set(
        0.82 + t * 1.65,
        0.6 - t * 0.42 + source.lift,
        source.spread * (0.2 + t),
      );
      particle.scale.setScalar(1.25 - t * 0.35);
      if (particle.material) particle.material.opacity = activeSprayAmount * (0.86 - t * 0.28);
    });
  });

  return (
    <group ref={group} position={position} rotation={[0, -0.04, 0]} scale={entryScale} visible={initiallyVisible}>
      <group ref={body}>
        <mesh ref={leftLeg} position={[-0.07, 0.23, 0.04]} castShadow>
          <cylinderGeometry args={[0.034, 0.04, 0.42, 8]} />
          <meshStandardMaterial color="#263a31" roughness={0.72} />
        </mesh>
        <mesh ref={rightLeg} position={[0.08, 0.23, -0.04]} castShadow>
          <cylinderGeometry args={[0.034, 0.04, 0.42, 8]} />
          <meshStandardMaterial color="#263a31" roughness={0.72} />
        </mesh>
        <mesh position={[-0.08, 0.02, 0.06]} castShadow>
          <boxGeometry args={[0.16, 0.045, 0.08]} />
          <meshStandardMaterial color="#151917" roughness={0.78} />
        </mesh>
        <mesh position={[0.1, 0.02, -0.04]} castShadow>
          <boxGeometry args={[0.16, 0.045, 0.08]} />
          <meshStandardMaterial color="#151917" roughness={0.78} />
        </mesh>

        <RoundedBox args={[0.29, 0.42, 0.18]} radius={0.04} smoothness={2} position={[0, 0.58, 0]} castShadow>
          <meshStandardMaterial color="#3e8e63" roughness={0.7} />
        </RoundedBox>
        <RoundedBox args={[0.15, 0.34, 0.15]} radius={0.04} smoothness={2} position={[-0.2, 0.6, 0]} castShadow>
          <meshStandardMaterial color="#d89b2b" roughness={0.58} metalness={0.12} />
        </RoundedBox>
        <mesh position={[-0.05, 0.65, 0.096]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.008, 0.008, 0.33, 6]} />
          <meshStandardMaterial color="#1d241f" roughness={0.62} />
        </mesh>
        <mesh position={[-0.05, 0.65, -0.096]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.008, 0.008, 0.33, 6]} />
          <meshStandardMaterial color="#1d241f" roughness={0.62} />
        </mesh>

        <mesh ref={leftArm} position={[-0.17, 0.57, 0.1]} rotation={[0.08, 0, 0.28]} castShadow>
          <cylinderGeometry args={[0.023, 0.027, 0.35, 8]} />
          <meshStandardMaterial color="#b68255" roughness={0.68} />
        </mesh>
        <mesh ref={rightArm} position={[0.22, 0.62, -0.02]} rotation={[0, 0, -1.22]} castShadow>
          <cylinderGeometry args={[0.023, 0.027, 0.38, 8]} />
          <meshStandardMaterial color="#b68255" roughness={0.68} />
        </mesh>
        <mesh position={[0.58, 0.58, -0.02]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.011, 0.011, 0.76, 8]} />
          <meshStandardMaterial color="#26312c" roughness={0.46} metalness={0.18} />
        </mesh>
        <mesh position={[0.95, 0.55, -0.02]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[0.035, 0.1, 10]} />
          <meshStandardMaterial color="#7f8d85" roughness={0.44} metalness={0.35} />
        </mesh>

        <mesh position={[0, 0.87, 0]} castShadow>
          <sphereGeometry args={[0.115, 18, 14]} />
          <meshStandardMaterial color="#c99466" roughness={0.72} />
        </mesh>
        <mesh position={[0, 0.99, 0]} castShadow>
          <cylinderGeometry args={[0.17, 0.17, 0.028, 18]} />
          <meshStandardMaterial color="#d89b2b" roughness={0.66} />
        </mesh>
        <mesh position={[0, 1.05, 0]} castShadow>
          <coneGeometry args={[0.12, 0.12, 18]} />
          <meshStandardMaterial color="#d89b2b" roughness={0.66} />
        </mesh>
      </group>

      <mesh ref={mist} position={[1.65, 0.38, 0]} rotation={[0, 0, Math.PI * 0.42]} visible={sprayAmount > 0.05}>
        <coneGeometry args={[0.42, 1.45, 20, 1, true]} />
        <meshBasicMaterial color="#f1cf70" transparent opacity={sprayAmount * 0.18} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      <group ref={spray}>
        {sprayParticles.map((particle, index) => (
          <mesh key={index} position={[0.82 + particle.offset * 1.65, 0.6 - particle.offset * 0.42 + particle.lift, particle.spread * (0.2 + particle.offset)]} visible={sprayAmount > 0.05}>
            <sphereGeometry args={[particle.radius, 8, 6]} />
            <meshBasicMaterial color="#f1cf70" transparent opacity={sprayAmount * 0.72} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Lighting({ env }) {
  const sun = useRef(null);
  const skyLight = env.skyLight ?? env.daylight;
  const sunLight = env.sunLight ?? env.daylight;
  const sunTravel = env.sunTravel ?? skyLight;
  const weatherShade = (env.cloudy ? 0.18 : 0) + (env.rainDetected ? 0.24 : 0);
  const directLight = clamp(sunLight - weatherShade, 0, 1);
  const ambientLight = clamp(skyLight - weatherShade * 0.42, 0, 1);
  const intensity = mixNumber(0.06, 2.25, directLight);
  const hemiIntensity = mixNumber(0.34, 0.88, ambientLight);
  const moonIntensity = clamp((env.moonLight ?? (1 - skyLight)) * 0.34, 0, 0.34);
  const dayColor = mixColor('#8eb6d8', '#ecf1dc', ambientLight);
  const color = mixColor(dayColor, '#f1a45c', clamp((env.golden || 0) * 0.72, 0, 0.72));

  useEffect(() => {
    if (!sun.current) return;
    sun.current.position.set(-4.8 + sunTravel * 9.6, 1.35 + sunLight * 5.1, 3.4);
    sun.current.target.position.set(0, 0, 0);
    sun.current.target.updateMatrixWorld();
  }, [sunLight, sunTravel]);

  return (
    <>
      <hemisphereLight
        color={mixColor('#132c3c', '#d7e9da', ambientLight)}
        groundColor={mixColor('#121512', '#1b1712', ambientLight)}
        intensity={hemiIntensity}
      />
      <directionalLight
        ref={sun}
        color={color}
        intensity={intensity}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
      />
      {moonIntensity > 0.02 && <directionalLight position={[-3, 3, -4]} color="#8eb6d8" intensity={moonIntensity} />}
    </>
  );
}

function CameraRig() {
  const controls = useRef(null);
  const { camera } = useThree();

  const reset = useCallback(() => {
    camera.position.set(6.9, 5.4, 6.7);
    camera.zoom = 62;
    camera.updateProjectionMatrix();
    controls.current?.target.set(0, 0.05, 0);
    controls.current?.update();
  }, [camera]);

  useEffect(() => {
    reset();
    window.addEventListener('dft-reset-camera', reset);
    return () => window.removeEventListener('dft-reset-camera', reset);
  }, [reset]);

  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      minZoom={42}
      maxZoom={88}
      minPolarAngle={0.62}
      maxPolarAngle={1.22}
      minAzimuthAngle={-1.28}
      maxAzimuthAngle={0.55}
      dampingFactor={0.08}
      enableDamping
      makeDefault
    />
  );
}

function FrameInvalidator({ active }) {
  const { invalidate } = useThree();

  useEffect(() => {
    if (!active) {
      invalidate();
      return undefined;
    }

    const tick = () => {
      if (!document.hidden) invalidate();
    };
    const handleVisibility = () => {
      if (!document.hidden) invalidate();
    };
    const interval = window.setInterval(tick, 1000 / 28);
    document.addEventListener('visibilitychange', handleVisibility);
    tick();

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [active, invalidate]);

  return null;
}

function LandingCamera({ progress = 0, parallax = { x: 0, y: 0 } }) {
  const { camera } = useThree();

  useFrame(() => {
    const p = clamp(progress, 0, 1);
    const close = new THREE.Vector3(2.8, 1.05, 4.1);
    const reveal = new THREE.Vector3(5.4, 3.9, 5.2);
    const dashboard = new THREE.Vector3(6.9, 5.4, 6.7);
    const target = new THREE.Vector3();

    if (p < 0.55) {
      target.lerpVectors(close, reveal, p / 0.55);
    } else {
      target.lerpVectors(reveal, dashboard, (p - 0.55) / 0.45);
    }

    target.x += parallax.x * 0.16;
    target.y += parallax.y * 0.1;
    camera.position.lerp(target, 0.08);
    camera.zoom += (62 - camera.zoom) * 0.08;
    camera.lookAt(0, 0.05, 0);
    camera.updateProjectionMatrix();
  });

  return null;
}

export function FarmTwinScene({
  env,
  latest = null,
  labelsVisible = false,
  selectedSensor = '',
  onSelectSensor = () => {},
  reducedMotion = false,
  sceneActive = true,
  cameraMode = 'dashboard',
  storyProgress = 1,
  parallax,
}) {
  const skyLight = env.skyLight ?? env.daylight;
  const backgroundColor = mixColor('#111922', '#18231f', skyLight);
  const fogColor = mixColor('#111922', '#1a2621', skyLight);

  return (
    <>
      <FrameInvalidator active={!reducedMotion && sceneActive} />
      <color attach="background" args={[backgroundColor]} />
      <fog attach="fog" args={[fogColor, 9, 17]} />
      {cameraMode === 'landing' ? <LandingCamera progress={storyProgress} parallax={parallax} /> : <CameraRig />}
      <Lighting env={env} />
      {cameraMode === 'landing' && <SunMoonClouds env={env} storyProgress={storyProgress} reducedMotion={reducedMotion} />}
      <group rotation={[0, -0.2, 0]} position={[0, -0.18, 0]}>
        <FarmBase env={env} />
        <CropField env={env} reducedMotion={reducedMotion} />
        <FieldTree env={env} reducedMotion={reducedMotion} />
        <FarmerHut />
        {cameraMode === 'landing' && <FarmerFertilizerAction storyProgress={storyProgress} reducedMotion={reducedMotion} />}
        <IrrigationSystem env={env} reducedMotion={reducedMotion} />
        <FarmSensors env={env} latest={latest} labelsVisible={labelsVisible} selectedSensor={selectedSensor} onSelectSensor={onSelectSensor} />
        <LampPost env={env} />
      </group>
      <Rain active={env.rainDetected} reducedMotion={reducedMotion} />
      <StaticGroundShadow />
    </>
  );
}

function StaticGroundShadow() {
  return (
    <mesh position={[0, -0.65, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
      <circleGeometry args={[4.15, 48]} />
      <meshBasicMaterial color="#050807" transparent opacity={0.28} depthWrite={false} />
    </mesh>
  );
}

function Fallback({ latest, weather }) {
  return (
    <div className="dft-fallback" role="status">
      <strong>3D farm twin unavailable</strong>
      <span>Moisture: {compactValue(latest?.moisture)}%</span>
      <span>Weather: {weather?.current?.description || weather?.message || 'Waiting'}</span>
      <span>Irrigation: {latest?.irrigation_active ? 'Active' : 'Off'}</span>
    </div>
  );
}

function WindCompass({ env }) {
  const direction = Number.isFinite(env.windDirection) ? env.windDirection : 0;
  const speedText = env.windSpeed === null ? '--' : compactValue(env.windSpeed, 1);
  const sourceLabel = env.windFromApi && env.windDirectionFromApi ? 'Live' : env.windFromApi ? 'Speed live' : 'Fallback';
  return (
    <div className="dft-wind-card" aria-label={`North is up. Wind ${speedText} kilometers per hour from ${Math.round(direction)} degrees`}>
      <div className="dft-north-row"><span>N</span><span>Up</span></div>
      <div className="dft-wind-arrow" style={{ transform: `rotate(${direction}deg)` }}>^</div>
      <div className="dft-wind-speed">{speedText} km/h</div>
      <div className="dft-wind-source">{sourceLabel}</div>
    </div>
  );
}

function StatusStrip({ env, selectedSensor }) {
  const updated = env.updatedAt ? formatShortTime(env.updatedAt) : 'waiting';
  const wind = env.windSpeed === null ? 'Wind waiting' : `Wind ${compactValue(env.windSpeed, 1)} km/h`;
  const status = selectedSensor
    ? `Sensor ${selectedSensor.replace(/_/g, ' ')} selected`
    : `Moisture ${compactValue(env.moisture)}% | ${env.irrigationActive ? 'Irrigation Active' : 'Irrigation Off'} | Crop: ${env.cropName} | ${wind} | Updated ${updated}`;
  return <div className="dft-status-strip">{status}</div>;
}

function SensorLabelOverlay({ latest, env, visible }) {
  if (!visible) return null;

  const labels = [
    sensorData(latest, 'moisture'),
    sensorData(latest, 'npk'),
    sensorData(latest, 'soil_temperature'),
    sensorData(latest, 'weather_station'),
  ];

  return (
    <div className="dft-sensor-label-panel" aria-label="Visible sensor readings">
      {labels.map((label) => {
        const hasValue = label.value !== null && label.value !== undefined && label.value !== '';
        const warning = !hasValue || (label.label === 'NPK sensor' && env.nutrientIssues.length > 0);
        return (
          <div className={`dft-sensor-label-row ${warning ? 'warning' : ''}`} key={label.label}>
            <span>{label.label}</span>
            <strong>{hasValue ? `${label.value} ${label.unit}` : 'Waiting'}</strong>
          </div>
        );
      })}
    </div>
  );
}

export default function DigitalFarmTwin({ latest, weather, insights, summary, connected }) {
  const viewportRef = useRef(null);
  const [mode, setMode] = useState('live');
  const [paused, setPaused] = useState(false);
  const [labelsVisible, setLabelsVisible] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState('');
  const [canvasError, setCanvasError] = useState(false);
  const reducedMotion = useReducedMotion();
  const sceneVisible = useInViewport(viewportRef);
  const currentTime = useDemoClock(mode, paused);
  const env = useMemo(
    () => environmentFromData({ latest, weather, insights, summary, currentTime, demoMode: mode === 'demo' }),
    [latest, weather, insights, summary, currentTime, mode],
  );
  const canRender = !canvasError && webglAvailable();

  function resetCamera() {
    window.dispatchEvent(new Event('dft-reset-camera'));
  }

  function toggleFullscreen() {
    const element = viewportRef.current;
    if (!document.fullscreenElement) element?.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  return (
    <div className={`dft-shell ${env.windSpeed > 20 ? 'wind-warning' : ''}`}>
      <div ref={viewportRef} className="dft-viewport" aria-label="Interactive 3D digital farm twin">
        {canRender ? (
          <Canvas
            frameloop={sceneVisible ? 'always' : 'demand'}
            shadows={{ type: THREE.PCFShadowMap }}
            orthographic
            dpr={[1, 1]}
            gl={{ antialias: false, powerPreference: 'high-performance' }}
            camera={{ position: [6.9, 5.4, 6.7], zoom: 62, near: 0.1, far: 80 }}
            onCreated={({ gl }) => {
              gl.setClearColor('#18231f');
              gl.shadowMap.autoUpdate = false;
              gl.shadowMap.needsUpdate = true;
            }}
            onError={() => setCanvasError(true)}
          >
            <FarmTwinScene
              env={env}
              latest={latest}
              labelsVisible={labelsVisible}
              selectedSensor={selectedSensor}
              onSelectSensor={setSelectedSensor}
              reducedMotion={reducedMotion}
              sceneActive={sceneVisible}
            />
          </Canvas>
        ) : (
          <Fallback latest={latest} weather={weather} />
        )}

        {!env.hasSensor && mode !== 'demo' && <div className="dft-waiting">Waiting for sensor data</div>}

        <div className="dft-controls" aria-label="Digital farm twin controls">
          <button type="button" className={mode === 'live' ? 'active' : ''} onClick={() => setMode('live')} aria-label="Use live time"><Clock size={18} aria-hidden="true" /><span>Live</span></button>
          <button type="button" className={mode === 'demo' ? 'active' : ''} onClick={() => setMode('demo')} aria-label="Use demo time"><TimerReset size={18} aria-hidden="true" /><span>Demo</span></button>
          {mode === 'demo' && (
            <button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? 'Resume demo time' : 'Pause demo time'}>{paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}</button>
          )}
          <button type="button" onClick={resetCamera} aria-label="Reset camera"><RotateCcw size={18} aria-hidden="true" /></button>
          <button type="button" className={labelsVisible ? 'active' : ''} onClick={() => setLabelsVisible((value) => !value)} aria-label="Toggle sensor labels"><Tag size={18} aria-hidden="true" /></button>
          <button type="button" onClick={toggleFullscreen} aria-label="Expand farm twin"><Maximize2 size={18} aria-hidden="true" /></button>
        </div>

        <div className="dft-time-chip">{env.timeLabel}</div>
        <WindCompass env={env} />
        <SensorLabelOverlay latest={latest} env={env} visible={labelsVisible} />
        <StatusStrip env={env} selectedSensor={selectedSensor} />
      </div>
      <div className={`dft-live-dot ${connected ? 'is-live' : ''}`} aria-hidden="true" />
    </div>
  );
}

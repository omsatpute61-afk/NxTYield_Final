import { compactValue, toNumber } from './farmUtils';

const DEMO_SOURCE = 'demo-hardware';
const HISTORY_STEP_MS = 5 * 60 * 1000;
const LIVE_CYCLE_MS = 5000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function wave(seed, phase = 0, amplitude = 1) {
  return Math.sin(seed * 0.72 + phase) * amplitude;
}

function liveSeed(time) {
  return Math.floor(time / LIVE_CYCLE_MS);
}

function numberOr(value, fallback) {
  const number = toNumber(value);
  return number === null ? fallback : number;
}

function usableWeather(weather) {
  return Boolean(weather?.available !== false && weather?.current);
}

export function buildDemoWeather(time = Date.now()) {
  const date = new Date(time);
  const hour = date.getHours() + date.getMinutes() / 60;
  const seed = liveSeed(time);
  const temperature = round(27 + wave(seed, 0.2, 2.4) + Math.sin((hour - 6) / 24 * Math.PI * 2) * 3.2, 1);
  const humidity = Math.round(clamp(68 + wave(seed, 1.6, 12), 44, 91));
  const rainProbability = Math.round(clamp(36 + humidity * 0.34 + wave(seed, 3.1, 18), 12, 88));
  const rainfall = rainProbability > 62 ? round((rainProbability - 58) / 14, 1) : 0;

  const forecast = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date);
    day.setDate(date.getDate() + index);
    const daySeed = seed + index * 3;
    const high = round(temperature + 2.2 + wave(daySeed, 0.8, 1.5), 1);
    const low = round(temperature - 4.5 + wave(daySeed, 2.2, 1.2), 1);
    const probability = Math.round(clamp(rainProbability + wave(daySeed, 4.4, 18), 8, 92));
    return {
      date: day.toISOString().slice(0, 10),
      day: index === 0 ? 'Today' : day.toLocaleDateString('en', { weekday: 'short' }),
      high,
      low,
      rain_probability: probability,
      rainfall: probability > 60 ? round((probability - 55) / 12, 1) : 0,
      description: probability > 60 ? 'Light Rain' : probability > 35 ? 'Partly Cloudy' : 'Clear',
      icon: probability > 60 ? '10d' : probability > 35 ? '03d' : '01d',
    };
  });

  return {
    available: true,
    provider: 'demo-weather',
    city: 'Pune',
    country: 'IN',
    updated_at: date.toISOString(),
    current: {
      temperature,
      feels_like: round(temperature + 1.4, 1),
      humidity,
      pressure: Math.round(clamp(1009 + wave(seed, 2.7, 5), 998, 1020)),
      wind_speed: round(clamp(9 + wave(seed, 1.1, 4), 3, 18), 1),
      wind_direction: Math.round((115 + seed * 9) % 360),
      cloud_cover: Math.round(clamp(42 + wave(seed, 0.9, 28), 8, 94)),
      description: rainProbability > 60 ? 'Light Rain' : rainProbability > 35 ? 'Partly Cloudy' : 'Clear',
      icon: rainProbability > 60 ? '10d' : rainProbability > 35 ? '03d' : '01d',
      rainfall,
      rain_probability: rainProbability,
      timestamp: date.toISOString(),
    },
    forecast,
    message: null,
  };
}

export function weatherForDemo(weather, time = Date.now()) {
  return usableWeather(weather) ? weather : buildDemoWeather(time);
}

export function buildDemoReading(weather, time = Date.now()) {
  const demoWeather = weatherForDemo(weather, time);
  const current = demoWeather.current || {};
  const seed = liveSeed(time);
  const temperature = numberOr(current.temperature, 27);
  const humidity = numberOr(current.humidity, 68);
  const pressure = numberOr(current.pressure, 1010);
  const rainProbability = numberOr(current.rain_probability, 40);
  const rainfall = numberOr(current.rainfall, 0);
  const rainfallPulse = rainProbability >= 58 && seed % 6 >= 3;
  const rainDetected = rainfall > 0 || rainProbability >= 68 || rainfallPulse;
  const moisture = round(clamp(39 + humidity * 0.25 + rainProbability * 0.09 + rainfall * 2.2 + wave(seed, 1.4, 8), 34, 84), 1);
  const nitrogen = round(clamp(31 + wave(seed, 0.3, 5.4), 21, 39), 1);
  const phosphorus = round(clamp(22 + wave(seed, 1.9, 4.2), 14, 30), 1);
  const potassium = Math.round(clamp(188 + wave(seed, 2.8, 28), 145, 235));
  const ph = round(clamp(6.7 + wave(seed, 4.1, 0.32), 6.1, 7.2), 1);
  const soilTemperature = round(clamp(temperature - 2.1 + wave(seed, 0.7, 1.4), 19, 34), 1);
  const airTemperature = round(clamp(temperature + wave(seed, 2.1, 0.9), 18, 38), 1);
  const healthScore = Math.round(clamp(86 - Math.abs(moisture - 58) * 0.32 - (rainDetected ? 3 : 0) + wave(seed, 2.4, 4), 72, 93));

  return {
    available: true,
    provider: 'demo',
    message: null,
    source: DEMO_SOURCE,
    nitrogen,
    phosphorus,
    potassium,
    moisture,
    ph,
    soil_temperature: soilTemperature,
    air_temperature: airTemperature,
    humidity: Math.round(clamp(humidity + wave(seed, 3.3, 4), 35, 95)),
    pressure: Math.round(clamp(pressure + wave(seed, 4.7, 3), 995, 1024)),
    rain_detected: rainDetected,
    irrigation_active: !rainDetected && moisture < 43,
    health_score: healthScore,
    timestamp: new Date(time).toISOString(),
  };
}

export function buildDemoHistory(weather, count = 60, time = Date.now()) {
  return Array.from({ length: count }, (_, index) => {
    const entryTime = time - (count - index - 1) * HISTORY_STEP_MS;
    return buildDemoReading(weather, entryTime);
  });
}

export function buildDemoHealth(reading, time = Date.now()) {
  return {
    available: true,
    provider: 'demo',
    status: 'ok',
    message: null,
    timestamp: new Date(time).toISOString(),
    sensor: reading?.source || DEMO_SOURCE,
  };
}

export function buildDemoInsights(reading, weather) {
  const moisture = numberOr(reading?.moisture, 58);
  const score = numberOr(reading?.health_score, 84);
  const rainProbability = numberOr(weather?.current?.rain_probability, 42);
  const rainDetected = reading?.rain_detected === true;
  const fertilizerStatus = numberOr(reading?.nitrogen, 0) < 25 ? 'Nitrogen Review' : 'Balanced';
  const irrigationTitle = rainDetected || rainProbability > 60
    ? 'Hold irrigation while rainfall is active'
    : moisture < 45
      ? 'Schedule a short irrigation cycle'
      : 'Maintain current irrigation plan';

  return {
    available: true,
    provider: 'demo',
    message: null,
    soil_health: {
      score,
      status: score >= 80 ? 'Good' : 'Fair',
      summary: `FarmSense AI demo soil profile is stable at ${score}/100 with moisture near ${compactValue(moisture, 1)}%.`,
    },
    crop_health: {
      status: score >= 80 ? 'Good' : 'Fair',
      crop: 'Field crop',
      summary: rainDetected
        ? 'Rain is active, so disease pressure and irrigation timing should be watched.'
        : 'Crop vigor is steady under the current demo field conditions.',
    },
    fertilizer: {
      status: fertilizerStatus,
      summary: fertilizerStatus === 'Balanced'
        ? 'Demo NPK levels are inside the preferred operating band.'
        : 'Demo nitrogen is trending low; review fertilizer timing.',
    },
    recommendation: {
      title: irrigationTitle,
      detail: rainDetected
        ? 'Rain sensor is active, so the demo recommendation is to pause irrigation and monitor moisture.'
        : `Moisture is ${compactValue(moisture, 1)}%; keep irrigation aligned with the next weather window.`,
    },
  };
}

export function buildDemoChatStatus(status) {
  if (status?.llm_enabled) return status;
  return {
    available: true,
    llm_enabled: false,
    provider: 'demo fallback',
    message: 'Demo assistant fallback active.',
  };
}

export function buildDemoAssistantReply(question, reading, weather, insights) {
  const q = question.toLowerCase();
  const moisture = compactValue(reading?.moisture, 1);
  const temp = compactValue(reading?.air_temperature ?? weather?.current?.temperature, 1);
  const rain = reading?.rain_detected || numberOr(weather?.current?.rain_probability, 0) >= 64;
  const npk = `${compactValue(reading?.nitrogen, 1)} / ${compactValue(reading?.phosphorus, 1)} / ${compactValue(reading?.potassium)}`;
  const recommendation = insights?.recommendation?.title || 'Maintain current monitoring.';

  if (q.includes('water') || q.includes('irrigation') || q.includes('rain')) {
    return rain
      ? `Demo mode: it is currently raining, so hold irrigation. Soil moisture is ${moisture}%.`
      : `Demo mode: soil moisture is ${moisture}%. ${recommendation}`;
  }
  if (q.includes('npk') || q.includes('fertilizer') || q.includes('nutrient')) {
    return `Demo mode: NPK is ${npk} mg/kg. ${insights?.fertilizer?.summary || 'Nutrient balance is acceptable for the demo field.'}`;
  }
  if (q.includes('weather') || q.includes('temperature')) {
    return `Demo mode: the field is at ${temp} C with ${compactValue(weather?.current?.rain_probability)}% rain probability.`;
  }
  return `Demo mode: FarmSense AI sees health ${compactValue(reading?.health_score)}/100, moisture ${moisture}%, and NPK ${npk}. ${recommendation}`;
}

export function buildDemoCropPrediction(modelInputs, reading, weather) {
  const rainProbability = numberOr(weather?.current?.rain_probability, 35);
  const moisture = numberOr(reading?.moisture, 55);
  const temperature = numberOr(weather?.current?.temperature ?? reading?.air_temperature, 27);
  const crop = rainProbability > 62 || moisture > 65 ? 'rice' : temperature > 30 ? 'cotton' : 'maize';

  return {
    success: true,
    available: true,
    provider: 'demo',
    prediction: crop,
    weather_used: {
      avg_temperature: round(temperature, 1),
      avg_rainfall: rainProbability > 62 ? 780 : 540,
      season_length: crop === 'rice' ? '110-130 days' : '90-115 days',
      city: modelInputs?.city || 'Pune',
    },
  };
}

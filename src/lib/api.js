const API_BASE = import.meta.env.VITE_API_BASE_URL?.trim() || '';
const CROP_MODEL_URL = import.meta.env.VITE_CROP_MODEL_URL || '/api/predict';
const DEFAULT_TIMEOUT_MS = 12000;

function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE) return path;
  return new URL(path, API_BASE).toString();
}

function requestErrorMessage(error) {
  if (error?.name === 'AbortError') return 'API not available: request timed out';
  return error?.message || 'API not available';
}

async function fetchJson(path, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries,
    ...fetchOptions
  } = options;
  const method = (fetchOptions.method || 'GET').toUpperCase();
  const retryCount = retries ?? (method === 'GET' ? 1 : 0);

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(apiUrl(path), {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(fetchOptions.headers || {}),
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || data.detail || data.message || 'API not available');
      }
      return data;
    } catch (error) {
      if (attempt >= retryCount) {
        throw new Error(requestErrorMessage(error), { cause: error });
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }

  throw new Error('API not available');
}

function normalizeSensorPayload(payload, fallbackSource = 'hardware') {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  if (!data || typeof data !== 'object') {
    return {
      available: false,
      provider: payload?.provider || 'sensor',
      message: payload?.message || 'Sensor API not available',
      source: 'none',
    };
  }

  const source = data.source || payload?.source || fallbackSource;
  return {
    available: payload?.available ?? data.available ?? Boolean(source && !['none', 'example'].includes(source)),
    provider: payload?.provider || data.provider || source,
    message: payload?.message || data.message || null,
    nitrogen: data.nitrogen ?? data.N ?? null,
    phosphorus: data.phosphorus ?? data.P ?? null,
    potassium: data.potassium ?? data.K ?? null,
    moisture: data.moisture ?? data.soil_moisture ?? data.soilMoisture ?? null,
    ph: data.ph ?? data.pH ?? data.soil_ph ?? data.soil_pH ?? data.soilPh ?? null,
    soil_temperature: data.soil_temperature ?? data.soilTemperature ?? null,
    air_temperature: data.air_temperature ?? data.airTemperature ?? data.temperature ?? null,
    humidity: data.humidity ?? null,
    pressure: data.pressure ?? null,
    rain_detected: data.rain_detected ?? data.rainDetected ?? null,
    irrigation_active: data.irrigation_active ?? data.irrigationActive ?? null,
    health_score: data.health_score ?? data.healthScore ?? null,
    timestamp: data.timestamp || payload?.received_at || null,
    source,
  };
}

function hasUsableSensor(reading) {
  return Boolean(reading?.available && reading.source && !['none', 'example'].includes(reading.source));
}

export function getHealth() {
  return fetchJson('/api/health');
}

export async function getLatestSensor() {
  return normalizeSensorPayload(await fetchJson('/api/sensors/latest'), 'hardware');
}

export async function getSensorHistory() {
  const localHistory = await fetchJson('/api/sensors/history');
  if (!Array.isArray(localHistory)) return [];
  return localHistory
    .map((entry) => normalizeSensorPayload(entry, entry?.source || 'hardware'))
    .filter(hasUsableSensor);
}

export function getInsights() {
  return fetchJson('/api/insights');
}

export function getChatStatus() {
  return fetchJson('/api/chat/status');
}

export function sendChatMessage(message, history, sensor) {
  return fetchJson('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history, sensor }),
  });
}

export function getWeather(city = 'Pune,IN') {
  const params = new URLSearchParams({ city });
  return fetchJson(`/api/weather?${params.toString()}`);
}

export function getRemoteIrrigation() {
  return fetchJson('/api/irrigation/remote');
}

export function setRemoteIrrigation(enabled) {
  return fetchJson('/api/irrigation/remote', {
    method: 'POST',
    body: JSON.stringify({ enabled: Boolean(enabled) }),
  });
}

export async function predictCrop(payload) {
  const data = await fetchJson(CROP_MODEL_URL, {
    method: 'POST',
    body: JSON.stringify(payload),
    timeoutMs: 90000,
    retries: 0,
  });
  if (typeof data === 'string') {
    return { available: true, success: true, provider: 'direct', prediction: data };
  }
  return data;
}

export function openSensorStream({ onOpen, onError, onMessage }) {
  const source = new EventSource(apiUrl('/api/stream'));
  source.onopen = onOpen;
  source.onerror = onError;
  source.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      onError?.();
    }
  };
  return source;
}

export function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export const DEFAULT_SENSOR_API_URL = 'https://sensor-data-7jqu.onrender.com/sensor-data';
export const DEFAULT_CROP_MODEL_API_URL = 'https://crop-model-api-1.onrender.com/predict';
export const DEFAULT_IRRIGATION_API_URL = 'http://127.0.0.1:8000/irrigation-active';

export function methodNotAllowed(res, methods) {
  res.setHeader('Allow', methods.join(', '));
  json(res, 405, { available: false, message: `Use ${methods.join(' or ')}` });
}

export function publicErrorMessage(error, secrets = []) {
  let message = error?.message || String(error || 'Unknown error');
  secrets.filter(Boolean).forEach((secret) => {
    message = message.replaceAll(secret, '[redacted]');
  });
  return message;
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function unavailable(provider, message, extra = {}) {
  return {
    available: false,
    provider,
    message,
    ...extra,
  };
}

function localFallbacksEnabled() {
  return process.env.VERCEL !== '1' && process.env.LOCAL_API_FALLBACKS !== 'false';
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toBoolean(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Boolean(value);
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return null;
}

function hasMeaningfulSensorValues(reading) {
  return [
    'nitrogen',
    'phosphorus',
    'potassium',
    'moisture',
    'ph',
    'soil_temperature',
    'air_temperature',
    'humidity',
    'pressure',
    'health_score',
  ].some((key) => {
    const value = toNumber(reading[key]);
    return value !== null && value !== 0;
  }) || reading.rain_detected === true || reading.irrigation_active === true;
}

export function normalizeSensorPayload(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  const reading = {
    nitrogen: toNumber(data?.nitrogen ?? data?.N),
    phosphorus: toNumber(data?.phosphorus ?? data?.P),
    potassium: toNumber(data?.potassium ?? data?.K),
    moisture: toNumber(data?.moisture ?? data?.soil_moisture ?? data?.soilMoisture),
    ph: toNumber(data?.ph ?? data?.pH ?? data?.soil_ph ?? data?.soil_pH ?? data?.soilPh),
    soil_temperature: toNumber(data?.soil_temperature ?? data?.soilTemperature),
    air_temperature: toNumber(data?.air_temperature ?? data?.airTemperature ?? data?.temperature),
    humidity: toNumber(data?.humidity),
    pressure: toNumber(data?.pressure),
    rain_detected: toBoolean(data?.rain_detected ?? data?.rainDetected),
    irrigation_active: toBoolean(data?.irrigation_active ?? data?.irrigationActive),
    health_score: toNumber(data?.health_score ?? data?.healthScore),
    timestamp: payload?.received_at || data?.timestamp || null,
    source: 'hardware',
  };

  if (!hasMeaningfulSensorValues(reading)) {
    return unavailable('sensor', 'Sensor API not available. No usable telemetry returned.', {
      ...reading,
      source: 'none',
    });
  }

  return {
    ...reading,
    available: true,
    provider: 'sensor',
    message: null,
  };
}

let localIrrigationState = {
  enabled: false,
  mode: 'relay_logic',
  updated_at: null,
};

function localSensorFallback(reason = '') {
  const now = Date.now();
  const slow = Math.sin(now / 420000);
  const slower = Math.sin(now / 720000 + 1.4);
  const moisture = Math.round(74 + slow * 4);
  const ph = Math.round((6.5 + slower * 0.25) * 10) / 10;
  const soilTemperature = Math.round((22.6 + slower * 0.4) * 10) / 10;
  const airTemperature = Math.round((24.8 + slow * 0.3) * 10) / 10;
  const humidity = Math.round(50 + slower * 4);

  return {
    available: true,
    provider: 'local',
    message: reason ? `Using local fallback: ${reason}` : null,
    nitrogen: 34 + Math.round(slow * 2),
    phosphorus: 22 + Math.round(slower),
    potassium: 205 + Math.round(slow * 6),
    moisture,
    ph,
    soil_temperature: soilTemperature,
    air_temperature: airTemperature,
    humidity,
    pressure: Math.round((1011 + slower * 2) * 10) / 10,
    rain_detected: false,
    irrigation_active: localIrrigationState.enabled && moisture < 75,
    health_score: 82,
    timestamp: new Date().toISOString(),
    source: 'local-fallback',
  };
}

export async function fetchSensorLatest() {
  const url = process.env.SENSOR_API_URL || DEFAULT_SENSOR_API_URL;
  if (!url) {
    return unavailable('sensor', 'Set SENSOR_API_URL in Vercel environment variables.', {
      source: 'none',
    });
  }

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Sensor API returned ${response.status}`);
    return normalizeSensorPayload(await response.json());
  } catch (error) {
    if (localFallbacksEnabled()) {
      return localSensorFallback(publicErrorMessage(error));
    }

    return unavailable('sensor', `Sensor API not available: ${publicErrorMessage(error)}`, {
      source: 'none',
    });
  }
}

function normalizeIrrigationCommand(payload) {
  if (typeof payload === 'boolean') {
    return {
      enabled: payload,
      mode: payload ? 'remote_on' : 'relay_logic',
      updated_at: null,
    };
  }

  return {
    enabled: Boolean(payload?.enabled ?? payload?.value ?? payload?.remote_irrigation ?? payload?.irrigation_active),
    mode: payload?.mode || ((payload?.enabled ?? payload?.value ?? payload?.remote_irrigation ?? payload?.irrigation_active) ? 'remote_on' : 'relay_logic'),
    updated_at: payload?.updated_at || null,
  };
}

function irrigationApiUrl() {
  return process.env.IRRIGATION_API_URL || DEFAULT_IRRIGATION_API_URL;
}

export async function fetchRemoteIrrigation() {
  const url = irrigationApiUrl();
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Irrigation API returned ${response.status}`);
    localIrrigationState = normalizeIrrigationCommand(await response.json());
    return localIrrigationState;
  } catch (error) {
    if (localFallbacksEnabled()) {
      return {
        ...localIrrigationState,
        available: true,
        provider: 'local',
        message: `Using local irrigation fallback: ${publicErrorMessage(error)}`,
      };
    }

    return unavailable('irrigation', `Irrigation API not available: ${publicErrorMessage(error)}`, {
      enabled: false,
      mode: 'relay_logic',
      updated_at: null,
    });
  }
}

export async function sendRemoteIrrigation(enabled) {
  const url = irrigationApiUrl();
  localIrrigationState = {
    enabled: Boolean(enabled),
    mode: enabled ? 'remote_on' : 'relay_logic',
    updated_at: new Date().toISOString(),
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Boolean(enabled)),
    });
    if (!response.ok) throw new Error(`Irrigation API returned ${response.status}`);
    localIrrigationState = normalizeIrrigationCommand(await response.json());
    return localIrrigationState;
  } catch (error) {
    if (localFallbacksEnabled()) {
      return {
        ...localIrrigationState,
        available: true,
        provider: 'local',
        message: `Using local irrigation fallback: ${publicErrorMessage(error)}`,
      };
    }

    throw error;
  }
}

export function normalizeCropPrediction(value) {
  if (value && typeof value === 'object') {
    return value.prediction ?? value.crop ?? value.result ?? value.recommended_crop ?? value;
  }
  return typeof value === 'string' ? value.trim().replace(/^['"]|['"]$/g, '') : value;
}

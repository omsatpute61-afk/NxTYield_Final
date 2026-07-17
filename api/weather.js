import { json, methodNotAllowed, publicErrorMessage, unavailable } from '../server/apiUtils.js';

function groupForecastDays(items = []) {
  const groups = new Map();
  items.forEach((item) => {
    const date = item?.dt_txt?.split(' ')[0];
    if (!date) return;
    groups.set(date, [...(groups.get(date) || []), item]);
  });

  const today = new Date().toISOString().slice(0, 10);
  return [...groups.entries()].slice(0, 7).map(([date, bucket]) => {
    const temps = bucket.map((entry) => entry?.main?.temp).filter((value) => value !== undefined);
    const pop = bucket.map((entry) => entry?.pop || 0);
    const rain = bucket.map((entry) => entry?.rain?.['3h'] || 0);
    const noon = bucket.reduce((best, item) => {
      const hour = Number(item?.dt_txt?.split(' ')[1]?.split(':')[0] || 0);
      const bestHour = Number(best?.dt_txt?.split(' ')[1]?.split(':')[0] || 0);
      return Math.abs(hour - 12) < Math.abs(bestHour - 12) ? item : best;
    }, bucket[0]);
    const weather = noon?.weather?.[0] || {};

    return {
      date,
      day: date === today ? 'Today' : new Date(`${date}T00:00:00`).toLocaleDateString('en', { weekday: 'short' }),
      high: temps.length ? Math.round(Math.max(...temps) * 10) / 10 : null,
      low: temps.length ? Math.round(Math.min(...temps) * 10) / 10 : null,
      rain_probability: pop.length ? Math.round(Math.max(...pop) * 100) : 0,
      rainfall: Math.round(rain.reduce((sum, value) => sum + value, 0) * 10) / 10,
      description: weather.description ? weather.description.replace(/\b\w/g, (char) => char.toUpperCase()) : null,
      icon: weather.icon,
    };
  });
}

const WEATHER_CODE_DESCRIPTIONS = {
  0: 'Clear Sky',
  1: 'Mainly Clear',
  2: 'Partly Cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing Rime Fog',
  51: 'Light Drizzle',
  53: 'Moderate Drizzle',
  55: 'Dense Drizzle',
  61: 'Slight Rain',
  63: 'Moderate Rain',
  65: 'Heavy Rain',
  71: 'Slight Snow',
  73: 'Moderate Snow',
  75: 'Heavy Snow',
  80: 'Slight Rain Showers',
  81: 'Moderate Rain Showers',
  82: 'Violent Rain Showers',
  95: 'Thunderstorm',
};

function openMeteoIcon(code) {
  if (code === 0) return '01d';
  if ([1, 2].includes(code)) return '02d';
  if (code === 3) return '04d';
  if ([45, 48].includes(code)) return '50d';
  if (code >= 51 && code <= 82) return '10d';
  if (code >= 95) return '11d';
  return '03d';
}

async function openMeteoFallback(city) {
  const latitude = 18.5204;
  const longitude = 73.8567;
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'pressure_msl',
      'wind_speed_10m',
      'wind_direction_10m',
      'cloud_cover',
      'rain',
      'weather_code',
    ].join(','),
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'precipitation_sum',
      'weather_code',
    ].join(','),
    timezone: 'auto',
    forecast_days: '7',
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`);
  const data = await response.json();
  const current = data.current || {};
  const daily = data.daily || {};
  const code = current.weather_code;

  return {
    available: true,
    provider: 'open-meteo',
    city: city || 'Pune,IN',
    country: 'IN',
    updated_at: new Date().toISOString(),
    current: {
      temperature: current.temperature_2m ?? null,
      feels_like: current.apparent_temperature ?? null,
      humidity: current.relative_humidity_2m ?? null,
      pressure: current.pressure_msl ?? null,
      wind_speed: current.wind_speed_10m ?? null,
      wind_direction: current.wind_direction_10m ?? null,
      cloud_cover: current.cloud_cover ?? null,
      description: WEATHER_CODE_DESCRIPTIONS[code] || 'Weather Available',
      icon: openMeteoIcon(code),
      rainfall: current.rain ?? 0,
      rain_probability: daily.precipitation_probability_max?.[0] ?? null,
      timestamp: current.time ? new Date(current.time).toISOString() : new Date().toISOString(),
    },
    forecast: (daily.time || []).map((date, index) => ({
      date,
      day: index === 0 ? 'Today' : new Date(`${date}T00:00:00`).toLocaleDateString('en', { weekday: 'short' }),
      high: daily.temperature_2m_max?.[index] ?? null,
      low: daily.temperature_2m_min?.[index] ?? null,
      rain_probability: daily.precipitation_probability_max?.[index] ?? 0,
      rainfall: daily.precipitation_sum?.[index] ?? 0,
      description: WEATHER_CODE_DESCRIPTIONS[daily.weather_code?.[index]] || 'Weather Available',
      icon: openMeteoIcon(daily.weather_code?.[index]),
    })),
    message: null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const key = process.env.OPENWEATHER_API_KEY;
  const city = String(req.query.city || process.env.WEATHER_CITY || 'Pune,IN').trim();
  if (!key) {
    try {
      return json(res, 200, await openMeteoFallback(city));
    } catch (error) {
      return json(res, 200, unavailable('open-meteo', `Weather API not available: ${publicErrorMessage(error)}`, {
        city,
        current: null,
        forecast: [],
      }));
    }
  }

  try {
    const params = new URLSearchParams({ q: city, appid: key, units: 'metric' });
    const [currentResponse, forecastResponse] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?${params.toString()}`),
      fetch(`https://api.openweathermap.org/data/2.5/forecast?${params.toString()}`),
    ]);
    if (!currentResponse.ok) throw new Error(`OpenWeather current returned ${currentResponse.status}`);
    if (!forecastResponse.ok) throw new Error(`OpenWeather forecast returned ${forecastResponse.status}`);

    const current = await currentResponse.json();
    const forecast = await forecastResponse.json();
    const forecastDays = groupForecastDays(forecast.list);
    const weather = current.weather?.[0] || {};
    const windSpeed = current.wind?.speed;
    const windDirection = current.wind?.deg;

    return json(res, 200, {
      available: true,
      provider: 'openweather',
      city: current.name || city,
      country: current.sys?.country,
      updated_at: new Date().toISOString(),
      current: {
        temperature: current.main?.temp,
        feels_like: current.main?.feels_like,
        humidity: current.main?.humidity,
        pressure: current.main?.pressure,
        wind_speed: windSpeed === undefined ? null : Math.round(windSpeed * 36) / 10,
        wind_direction: windDirection === undefined ? null : windDirection,
        cloud_cover: current.clouds?.all,
        description: weather.description ? weather.description.replace(/\b\w/g, (char) => char.toUpperCase()) : null,
        icon: weather.icon,
        rainfall: current.rain?.['1h'] || current.rain?.['3h'] || 0,
        rain_probability: forecastDays[0]?.rain_probability ?? null,
        timestamp: new Date().toISOString(),
      },
      forecast: forecastDays,
      message: null,
    });
  } catch (error) {
    return json(res, 200, unavailable('openweather', `Weather API not available: ${publicErrorMessage(error, [key])}`, {
      city,
      current: null,
      forecast: [],
    }));
  }
}

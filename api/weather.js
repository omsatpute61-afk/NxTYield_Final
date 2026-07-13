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

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const key = process.env.OPENWEATHER_API_KEY;
  const city = String(req.query.city || process.env.WEATHER_CITY || 'Pune,IN').trim();
  if (!key) {
    return json(res, 200, unavailable('openweather', 'Set OPENWEATHER_API_KEY in Vercel.', {
      city,
      current: null,
      forecast: [],
    }));
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

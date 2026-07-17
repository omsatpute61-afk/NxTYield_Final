import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSun,
  Droplets,
  Moon,
  Snowflake,
  Sun,
  Thermometer,
  Wind,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useFarmData } from '../context/FarmDataContext';
import { compactValue, formatValue } from '../lib/farmUtils';
import './Weather.css';

function weatherIcon(iconCode, description = '') {
  const code = String(iconCode || '').toLowerCase();
  const condition = String(description || '').toLowerCase();
  const isNight = code.endsWith('n');

  if (code.startsWith('11') || condition.includes('thunder')) {
    return { Icon: CloudLightning, tone: 'storm' };
  }
  if (code.startsWith('13') || condition.includes('snow') || condition.includes('sleet')) {
    return { Icon: Snowflake, tone: 'snow' };
  }
  if (
    code.startsWith('50') ||
    ['fog', 'mist', 'haze', 'smoke'].some((term) => condition.includes(term))
  ) {
    return { Icon: CloudFog, tone: 'fog' };
  }
  if (
    code.startsWith('09') ||
    code.startsWith('10') ||
    ['rain', 'drizzle', 'shower'].some((term) => condition.includes(term))
  ) {
    return { Icon: CloudRain, tone: 'rain' };
  }
  if (code.startsWith('04') || code.startsWith('03') || condition.includes('overcast')) {
    return { Icon: Cloud, tone: 'cloud' };
  }
  if (code.startsWith('02') || condition.includes('partly cloud') || condition.includes('mainly clear')) {
    return { Icon: isNight ? CloudMoon : CloudSun, tone: isNight ? 'night' : 'partly' };
  }
  if (code.startsWith('01') || condition.includes('clear') || condition.includes('sun')) {
    return { Icon: isNight ? Moon : Sun, tone: isNight ? 'night' : 'sun' };
  }
  if (condition.includes('cloud')) return { Icon: Cloud, tone: 'cloud' };
  return { Icon: CloudSun, tone: 'partly' };
}

function WeatherConditionIcon({ icon, description, size = 22 }) {
  const { Icon, tone } = weatherIcon(icon, description);
  return (
    <Icon
      size={size}
      className={`weather-condition-icon weather-condition-icon--${tone}`}
      aria-hidden="true"
    />
  );
}

function Weather() {
  const { weather, weatherLoading, weatherError, latest } = useFarmData();
  const current = weather?.current || {};
  const weatherUnavailable = weather?.available === false || Boolean(weatherError);
  const forecastData = weather?.forecast?.length ? weather.forecast : [];
  const chartData = forecastData.slice(0, 5).map((day) => ({
    month: day.day,
    currTemp: day.high,
    currRain: day.rainfall,
  }));
  const temperature = current.temperature;
  const humidity = current.humidity;
  const pressure = current.pressure;
  const rainProbability = current.rain_probability;
  const location = weather?.city
    ? `${weather.city}${weather.country ? `, ${weather.country}` : ''}`
    : 'Weather location pending';
  const description = weatherUnavailable
    ? weather?.message || weatherError || 'Weather API not available'
    : current.description || 'Waiting for weather data';

  return (
    <div className="container page-weather">
      <div className="panel weather-hero mb-4">
        <div className="weather-main">
          <div className="temp-display">
            <WeatherConditionIcon icon={current.icon} description={current.description} size={64} />
            <div>
              <span className="w-temp-large">{formatValue(temperature, { unit: 'C' })}</span>
              <p className="text-muted" style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {weatherLoading ? 'Loading weather...' : `${description} - ${location}`}
              </p>
              {weatherUnavailable && (
                <p className="text-warning" style={{ fontSize: '0.8125rem', marginTop: '0.35rem' }}>
                  API not available
                </p>
              )}
            </div>
          </div>

          <div className="w-metrics-grid">
            <div className="w-metric-box">
              <Droplets size={18} className="text-primary" />
              <span className="w-m-label">Humidity</span>
              <span className="w-m-val">{formatValue(humidity, { unit: '%' })}</span>
            </div>
            <div className="w-metric-box">
              <CloudRain size={18} className="text-primary" />
              <span className="w-m-label">Rain Prob.</span>
              <span className="w-m-val">{formatValue(rainProbability, { unit: '%' })}</span>
            </div>
            <div className="w-metric-box">
              <Wind size={18} className="text-primary" />
              <span className="w-m-label">Wind Speed</span>
              <span className="w-m-val">{formatValue(current.wind_speed, { unit: 'km/h' })}</span>
            </div>
            <div className="w-metric-box">
              <Thermometer size={18} className="text-warning" />
              <span className="w-m-label">Feels Like</span>
              <span className="w-m-val">{formatValue(current.feels_like, { unit: 'C' })}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel mb-4 forecast-ribbon-panel">
        <div className="panel-header">
          <h2 className="panel-title">Forecast</h2>
        </div>
        <div className="ribbon-container">
          {forecastData.length ? forecastData.map((day, i) => (
            <div key={day.date || day.day} className={`ribbon-node ${i === 0 ? 'active' : ''}`}>
              <span className="r-day">{day.day}</span>
              <div className="r-icon">
                <WeatherConditionIcon icon={day.icon} description={day.description} />
              </div>
              <span className="r-high">{compactValue(day.high)} deg</span>
              <span className="r-low text-muted">{compactValue(day.low)} deg</span>
              <div className="r-rain-bar">
                <div className="r-rain-fill" style={{ height: `${day.rain_probability || 0}%` }}></div>
              </div>
              <span className="r-rain-label">{compactValue(day.rain_probability)}%</span>
            </div>
          )) : (
            <div className="ribbon-node active">
              <span className="r-day">Waiting</span>
              <div className="r-icon"><CloudRain size={22} className="text-muted" /></div>
              <span className="r-high">--</span>
              <span className="r-low text-muted">--</span>
              <div className="r-rain-bar">
                <div className="r-rain-fill" style={{ height: '0%' }}></div>
              </div>
              <span className="r-rain-label">--</span>
            </div>
          )}
        </div>
      </div>

      <div className="weather-bottom-grid">
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Forecast Trend</h2>
            <div className="flex gap-2">
              <span className="legend-dot success" /> <span className="legend-text">Forecast</span>
              <span className="legend-dot muted" /> <span className="legend-text">Historical unavailable</span>
            </div>
          </div>

          <div className="chart-wrapper mb-4">
            <h3 className="chart-title"><Thermometer size={14}/> Temperature (C)</h3>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorCurrT" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-amber)" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="var(--color-amber)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="var(--border-color)" tick={{fill: 'var(--text-muted)', fontSize: 12}} />
                <YAxis domain={['dataMin - 2', 'dataMax + 2']} stroke="var(--border-color)" tick={{fill: 'var(--text-muted)', fontSize: 12}} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.75rem' }} />
                <Area type="monotone" dataKey="currTemp" stroke="var(--color-amber)" strokeWidth={2} fillOpacity={1} fill="url(#colorCurrT)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-wrapper">
            <h3 className="chart-title"><CloudRain size={14}/> Rainfall (mm)</h3>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData}>
                <XAxis dataKey="month" stroke="var(--border-color)" tick={{fill: 'var(--text-muted)', fontSize: 12}} />
                <YAxis stroke="var(--border-color)" tick={{fill: 'var(--text-muted)', fontSize: 12}} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.75rem' }} />
                <Bar dataKey="currRain" fill="var(--color-blue)" radius={[2,2,0,0]} opacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Crop Suitability - Current Conditions</h2>
          </div>
          <div className="rec-matrix">
            <div className="rec-matrix-item optimal">
              <div className="rec-m-header">
                <span className="r-crop-name">Moisture</span>
                <span className="badge badge-success">{formatValue(latest?.moisture, { unit: '%' })}</span>
              </div>
              <div className="suitability-bar-wrapper">
                <div className="suitability-bar success" style={{width: `${Math.min(Number(latest?.moisture) || 0, 100)}%`}}></div>
              </div>
              <p className="rec-reason">Uses the latest field moisture reading. Run the Crop Plan model for a crop-specific recommendation.</p>
            </div>

            <div className="rec-matrix-item">
              <div className="rec-m-header">
                <span className="r-crop-name">Humidity</span>
                <span className="badge badge-warning">{formatValue(humidity, { unit: '%' })}</span>
              </div>
              <div className="suitability-bar-wrapper">
                <div className="suitability-bar warning" style={{width: `${Math.min(Number(humidity) || 0, 100)}%`}}></div>
              </div>
              <p className="rec-reason">Humidity is shown only when the Weather API returns it.</p>
            </div>

            <div className="rec-matrix-item">
              <div className="rec-m-header">
                <span className="r-crop-name">Pressure</span>
                <span className="badge badge-warning">{formatValue(pressure, { unit: 'hPa' })}</span>
              </div>
              <div className="suitability-bar-wrapper">
                <div className="suitability-bar warning" style={{width: `${pressure ? 70 : 0}%`}}></div>
              </div>
              <p className="rec-reason">Pressure is displayed for environmental context; no historical weather baseline is connected yet.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Weather;

# NxTYield Frontend

React/Vite dashboard for NxTYield with same-origin Vercel API functions.

## Local Development

```bash
npm install
npm run dev
```

For local development, Vite can still proxy `/api` to the FastAPI backend from `vite.config.js`.

## Deploy On Vercel

1. Import `SamsDevForge/NxTYield_FInal` in Vercel.
2. Leave the project root as the repository root.
3. Use the default build command: `npm run build`.
4. Use the output directory: `dist`.
5. Add these Vercel Environment Variables:

```bash
SENSOR_API_URL=https://sensor-data-7jqu.onrender.com/sensor-data
IRRIGATION_API_URL=https://sensor-data-7jqu.onrender.com/irrigation-active
SENSOR_HISTORY_API_URL=
CROP_MODEL_API_URL=https://crop-model-api-1.onrender.com/predict
OPENWEATHER_API_KEY=your-openweather-key
WEATHER_CITY=Pune,IN
GROQ_API_KEY=your-groq-key
GROQ_MODEL=llama-3.3-70b-versatile
```

Do not set `VITE_API_BASE_URL` on Vercel unless you intentionally want the browser to call a different backend. The app uses same-origin `/api/*` Vercel functions by default.

`SENSOR_API_URL` and `CROP_MODEL_API_URL` have the same Render defaults in the Vercel API functions, so the app can still start if you forget those two. Set them in Vercel when you want to override the endpoints. OpenWeather and Groq still require real API keys.

## API Behavior

The Vercel API functions never fabricate sensor, weather, crop, or AI results. If an upstream API is missing or unavailable, they return `available: false` and the UI displays an API unavailable state.

/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  getChatStatus,
  getHealth,
  getInsights,
  getLatestSensor,
  getSensorHistory,
  getWeather,
  openSensorStream,
} from '../lib/api';
import {
  buildDemoChatStatus,
  buildDemoHealth,
  buildDemoHistory,
  buildDemoInsights,
  buildDemoReading,
  buildDemoWeather,
  weatherForDemo,
} from '../lib/demoData';
import { calculateHealthScore, getSeason, hasSensorData, hasSensorPacket } from '../lib/farmUtils';

const FarmDataContext = createContext(null);
const INSIGHTS_COOLDOWN_MS = 120000;
const MAX_HISTORY = 60;
const SENSOR_POLL_MS = 1500;
const DEMO_TICK_MS = 5000;
const DEMO_MODE_STORAGE_KEY = 'nxtyield-demo-mode';

function storedDemoMode() {
  try {
    return window.localStorage?.getItem(DEMO_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistDemoMode(enabled) {
  try {
    window.localStorage?.setItem(DEMO_MODE_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Demo mode remains available for this session if localStorage is blocked.
  }
}

function readingKey(reading) {
  if (!reading) return '';
  return [
    reading.source,
    reading.timestamp,
    reading.nitrogen,
    reading.phosphorus,
    reading.potassium,
    reading.moisture,
    reading.ph,
    reading.soil_temperature,
    reading.air_temperature,
    reading.humidity,
    reading.pressure,
    reading.rain_detected,
    reading.irrigation_active,
    reading.health_score,
  ].map((value) => value ?? '').join('|');
}

export function FarmDataProvider({ children }) {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [connected, setConnected] = useState(false);
  const [health, setHealth] = useState(null);
  const [apiErrors, setApiErrors] = useState({});
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState('');
  const [chatStatus, setChatStatus] = useState(null);
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [demoMode, setDemoModeState] = useState(storedDemoMode);
  const [demoTick, setDemoTick] = useState(() => Date.now());
  const lastInsightsFetch = useRef(0);
  const lastReadingKey = useRef('');

  const setApiError = useCallback((key, message = '') => {
    setApiErrors((prev) => ({ ...prev, [key]: message }));
  }, []);

  const setDemoMode = useCallback((enabled) => {
    const next = Boolean(enabled);
    persistDemoMode(next);
    setDemoModeState(next);
    setDemoTick(Date.now());
  }, []);

  const toggleDemoMode = useCallback(() => {
    setDemoModeState((current) => {
      const next = !current;
      persistDemoMode(next);
      return next;
    });
    setDemoTick(Date.now());
  }, []);

  const applyReading = useCallback((reading) => {
    if (!reading) return;
    const key = readingKey(reading);
    if (key && key === lastReadingKey.current) return;
    lastReadingKey.current = key;

    setLatest(reading);
    setApiError('sensor', reading.available === false ? reading.message || 'Sensor API not available' : '');
    setHistory((prev) => {
      if (!hasSensorData(reading)) return prev;
      const next = [...prev, reading].filter(Boolean);
      return next.slice(-MAX_HISTORY);
    });
  }, [setApiError]);

  const refreshHealth = useCallback(async () => {
    try {
      const data = await getHealth();
      setHealth(data);
      setApiError('health', '');
    } catch (error) {
      setHealth(null);
      setApiError('health', error.message || 'Backend API not available');
    }
  }, [setApiError]);

  const refreshInsights = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastInsightsFetch.current < INSIGHTS_COOLDOWN_MS) return;

    setInsightsLoading(true);
    setInsightsError('');
    try {
      const data = await getInsights();
      setInsights(data);
      setInsightsError(data?.available === false ? data.message || 'AI insights API not available' : '');
      setApiError('insights', data?.available === false ? data.message || 'AI insights API not available' : '');
      lastInsightsFetch.current = Date.now();
    } catch (error) {
      setInsightsError(error.message);
      setApiError('insights', error.message);
      setInsights({
        available: false,
        provider: 'api',
        message: error.message || 'AI insights API not available',
        soil_health: null,
        crop_health: null,
        fertilizer: null,
        recommendation: null,
      });
    } finally {
      setInsightsLoading(false);
    }
  }, [setApiError]);

  const refreshWeather = useCallback(async () => {
    setWeatherLoading(true);
    setWeatherError('');
    try {
      const data = await getWeather('Pune,IN');
      setWeather(data);
      const unavailable = data?.available === false ? data.message || 'Weather API not available' : '';
      setWeatherError(unavailable);
      setApiError('weather', unavailable);
    } catch (error) {
      setWeatherError(error.message);
      setApiError('weather', error.message);
      setWeather({
        available: false,
        provider: 'openweather',
        city: 'Pune,IN',
        current: null,
        forecast: [],
        message: error.message || 'Weather API not available',
      });
    } finally {
      setWeatherLoading(false);
    }
  }, [setApiError]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      const [latestResult, historyResult, chatResult] = await Promise.allSettled([
        getLatestSensor(),
        getSensorHistory(),
        getChatStatus(),
      ]);

      if (cancelled) return;

      if (historyResult.status === 'fulfilled') {
        const cleanHistory = historyResult.value.filter(hasSensorData).slice(-MAX_HISTORY);
        setHistory(cleanHistory);
        if (cleanHistory.length) {
          const latestHistoryReading = cleanHistory[cleanHistory.length - 1];
          lastReadingKey.current = readingKey(latestHistoryReading);
          setLatest(latestHistoryReading);
        }
      } else {
        setApiError('history', historyResult.reason?.message || 'Sensor history API not available');
      }

      if (latestResult.status === 'fulfilled') {
        if (hasSensorPacket(latestResult.value)) {
          lastReadingKey.current = readingKey(latestResult.value);
          setLatest(latestResult.value);
        }
        setApiError('sensor', latestResult.value?.available === false ? latestResult.value.message || 'Sensor API not available' : '');
      } else if (latestResult.status === 'rejected') {
        setApiError('sensor', latestResult.reason?.message || 'Sensor API not available');
      }

      if (chatResult.status === 'fulfilled') {
        setChatStatus(chatResult.value);
        setApiError('chat', chatResult.value?.available === false ? chatResult.value.message || 'AI API not available' : '');
      } else {
        setApiError('chat', chatResult.reason?.message || 'AI API not available');
      }
    }

    loadInitialData();
    window.setTimeout(refreshHealth, 0);
    window.setTimeout(() => refreshInsights(true), 0);
    window.setTimeout(refreshWeather, 0);

    const healthTimer = window.setInterval(refreshHealth, 60000);
    const weatherTimer = window.setInterval(refreshWeather, 10 * 60 * 1000);
    const sensorTimer = window.setInterval(async () => {
      try {
        const reading = await getLatestSensor();
        if (hasSensorPacket(reading)) {
          applyReading(reading);
        } else if (reading?.available === false) {
          setApiError('sensor', reading.message || 'Sensor API not available');
        }
      } catch (error) {
        setApiError('sensor', error.message || 'Sensor API not available');
        // The SSE stream will keep retrying; this poll is only a fallback.
      }
    }, SENSOR_POLL_MS);
    const chatTimer = window.setInterval(async () => {
      try {
        const status = await getChatStatus();
        setChatStatus(status);
        setApiError('chat', status?.available === false ? status.message || 'AI API not available' : '');
      } catch (error) {
        setChatStatus(null);
        setApiError('chat', error.message || 'AI API not available');
      }
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(healthTimer);
      window.clearInterval(weatherTimer);
      window.clearInterval(sensorTimer);
      window.clearInterval(chatTimer);
    };
  }, [applyReading, refreshHealth, refreshInsights, refreshWeather, setApiError]);

  useEffect(() => {
    const stream = openSensorStream({
      onOpen: () => setConnected(true),
      onError: () => {
        setConnected(false);
        setApiError('stream', 'Live sensor stream not available');
      },
      onMessage: (reading) => {
        setConnected(true);
        setApiError('stream', '');
        applyReading(reading);
      },
    });

    return () => stream.close();
  }, [applyReading, setApiError]);

  useEffect(() => {
    if (!demoMode) return undefined;

    const timer = window.setInterval(() => setDemoTick(Date.now()), DEMO_TICK_MS);
    return () => window.clearInterval(timer);
  }, [demoMode]);

  useEffect(() => {
    if (hasSensorData(latest)) {
      const timer = window.setTimeout(() => refreshInsights(false), 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [latest, refreshInsights]);

  const effectiveWeather = useMemo(() => {
    if (!demoMode) return weather;
    return weather?.available !== false && weather?.current ? weather : buildDemoWeather(demoTick);
  }, [demoMode, demoTick, weather]);

  const effectiveLatest = useMemo(() => (
    demoMode ? buildDemoReading(weatherForDemo(effectiveWeather, demoTick), demoTick) : latest
  ), [demoMode, demoTick, effectiveWeather, latest]);

  const effectiveHistory = useMemo(() => (
    demoMode ? buildDemoHistory(weatherForDemo(effectiveWeather, demoTick), MAX_HISTORY, demoTick) : history
  ), [demoMode, demoTick, effectiveWeather, history]);

  const effectiveInsights = useMemo(() => {
    if (!demoMode) return insights;
    if (insights?.available && insights?.soil_health) return insights;
    return buildDemoInsights(effectiveLatest, effectiveWeather);
  }, [demoMode, effectiveLatest, effectiveWeather, insights]);

  const effectiveChatStatus = useMemo(() => (
    demoMode ? buildDemoChatStatus(chatStatus) : chatStatus
  ), [chatStatus, demoMode]);

  const effectiveConnected = demoMode ? true : connected || hasSensorData(effectiveLatest);
  const effectiveHealth = demoMode && !health ? buildDemoHealth(effectiveLatest, demoTick) : health;
  const effectiveApiErrors = useMemo(() => {
    if (!demoMode) return apiErrors;
    return {
      ...apiErrors,
      sensor: '',
      history: '',
      stream: '',
      health: '',
      weather: '',
      insights: '',
      chat: '',
    };
  }, [apiErrors, demoMode]);

  const summary = useMemo(() => {
    const healthScore = calculateHealthScore(effectiveLatest, effectiveInsights);
    return {
      connected: effectiveConnected,
      streamConnected: demoMode ? true : connected,
      backendAvailable: demoMode ? true : !effectiveApiErrors.health,
      source: effectiveLatest?.source || 'none',
      season: getSeason(),
      hasSensor: demoMode ? true : hasSensorData(effectiveLatest),
      healthScore,
      demoMode,
    };
  }, [connected, demoMode, effectiveApiErrors.health, effectiveConnected, effectiveInsights, effectiveLatest]);

  const value = useMemo(() => ({
    latest: effectiveLatest,
    history: effectiveHistory,
    connected: effectiveConnected,
    health: effectiveHealth,
    apiErrors: effectiveApiErrors,
    demoMode,
    setDemoMode,
    toggleDemoMode,
    insights: effectiveInsights,
    insightsLoading: demoMode && effectiveInsights?.provider === 'demo' ? false : insightsLoading,
    insightsError: demoMode ? '' : insightsError,
    chatStatus: effectiveChatStatus,
    weather: effectiveWeather,
    weatherLoading: demoMode ? false : weatherLoading,
    weatherError: demoMode ? '' : weatherError,
    summary,
    refreshHealth,
    refreshInsights,
    refreshWeather,
  }), [
    effectiveLatest,
    effectiveHistory,
    effectiveConnected,
    effectiveHealth,
    effectiveApiErrors,
    demoMode,
    setDemoMode,
    toggleDemoMode,
    effectiveInsights,
    insightsLoading,
    insightsError,
    effectiveChatStatus,
    effectiveWeather,
    weatherLoading,
    weatherError,
    summary,
    refreshHealth,
    refreshInsights,
    refreshWeather,
  ]);

  return (
    <FarmDataContext.Provider value={value}>
      {children}
    </FarmDataContext.Provider>
  );
}

export function useFarmData() {
  const context = useContext(FarmDataContext);
  if (!context) {
    throw new Error('useFarmData must be used inside FarmDataProvider');
  }
  return context;
}

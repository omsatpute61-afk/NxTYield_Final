import { json, methodNotAllowed, publicErrorMessage, readBody, unavailable } from '../../server/apiUtils.js';

function sensorContext(sensor = {}) {
  if (!sensor || sensor.available === false || !sensor.source || sensor.source === 'none') {
    return 'No live sensor data is available.';
  }

  return [
    'Live sensor context:',
    `N: ${sensor.nitrogen ?? 'unavailable'} mg/kg`,
    `P: ${sensor.phosphorus ?? 'unavailable'} mg/kg`,
    `K: ${sensor.potassium ?? 'unavailable'} mg/kg`,
    `Moisture: ${sensor.moisture ?? 'unavailable'}%`,
    `pH: ${sensor.ph ?? 'unavailable'}`,
    `Source: ${sensor.source}`,
  ].join('\n');
}

function valueOrWaiting(value, suffix = '') {
  if (value === null || value === undefined || value === '') return 'waiting';
  return `${value}${suffix}`;
}

function localReply(message, sensor = {}) {
  const normalized = message.toLowerCase();
  const moisture = Number(sensor.moisture);
  const ph = Number(sensor.ph);

  if (normalized.includes('irrig') || normalized.includes('pump') || normalized.includes('water')) {
    if (Number.isFinite(moisture)) {
      if (moisture >= 75) return `Soil moisture is ${moisture}%, so keep the pump off. The wet-soil safety cutoff should block irrigation.`;
      if (moisture < 40) return `Soil moisture is ${moisture}%, so irrigation can run if rain is not detected.`;
    }
    return 'Irrigation should follow the relay logic: dry soil and no rain turns the pump on; wet soil keeps it off.';
  }

  if (normalized.includes('ph') || normalized.includes('soil')) {
    const phText = Number.isFinite(ph) ? `pH is ${ph.toFixed(1)}` : 'pH is waiting for data';
    return `${phText}. For most crops, keep soil pH near 5.5 to 7.5 and verify with a calibrated probe when available.`;
  }

  if (normalized.includes('npk') || normalized.includes('nutrient') || normalized.includes('fertil')) {
    return `Latest NPK is N ${valueOrWaiting(sensor.nitrogen)}, P ${valueOrWaiting(sensor.phosphorus)}, K ${valueOrWaiting(sensor.potassium)} mg/kg. Use this as a trend signal, then confirm fertilizer decisions with crop-specific needs.`;
  }

  return [
    'Local NxTYield assistant is active.',
    `Moisture: ${valueOrWaiting(sensor.moisture, '%')}`,
    `pH: ${valueOrWaiting(sensor.ph)}`,
    `NPK: ${valueOrWaiting(sensor.nitrogen)} / ${valueOrWaiting(sensor.phosphorus)} / ${valueOrWaiting(sensor.potassium)} mg/kg`,
    'Ask about irrigation, pH, NPK, or crop conditions for a more focused answer.',
  ].join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const key = process.env.GROQ_API_KEY;
  const body = await readBody(req);
  if (!key) {
    return json(res, 200, {
      available: true,
      reply: localReply(String(body.message || ''), body.sensor),
      provider: 'local',
      message: null,
    });
  }

  try {
    const message = String(body.message || '').trim();
    if (!message) return json(res, 400, { available: false, message: 'Message is required' });

    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    const messages = [
      {
        role: 'system',
        content: `You are NxTYield's farm assistant. Be concise and practical. Do not invent sensor values.\n\n${sensorContext(body.sensor)}`,
      },
      ...history
        .filter((turn) => ['user', 'assistant'].includes(turn.role) && turn.content)
        .map((turn) => ({ role: turn.role, content: String(turn.content) })),
      { role: 'user', content: message },
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.7,
        max_tokens: 600,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || `Groq returned ${response.status}`);

    return json(res, 200, {
      available: true,
      reply: payload.choices?.[0]?.message?.content?.trim() || '',
      provider: 'groq',
      message: null,
    });
  } catch (error) {
    return json(res, 200, unavailable('groq', `AI API not available: ${publicErrorMessage(error, [key])}`, {
      reply: 'AI API not available.',
    }));
  }
}

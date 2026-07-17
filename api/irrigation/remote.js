import {
  fetchRemoteIrrigation,
  json,
  methodNotAllowed,
  readBody,
  sendRemoteIrrigation,
} from '../../server/apiUtils.js';

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return Boolean(value);
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return json(res, 200, await fetchRemoteIrrigation());
  }

  if (req.method === 'POST') {
    try {
      const body = await readBody(req);
      const enabled = body?.enabled ?? body?.value ?? body?.remote_irrigation;
      return json(res, 200, await sendRemoteIrrigation(parseBoolean(enabled)));
    } catch (error) {
      return json(res, 502, {
        available: false,
        provider: 'irrigation',
        message: error?.message || 'Irrigation API not available',
        enabled: false,
        mode: 'relay_logic',
        updated_at: null,
      });
    }
  }

  return methodNotAllowed(res, ['GET', 'POST']);
}

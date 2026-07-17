import { fetchSensorLatest } from '../server/apiUtils.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).end();
    return;
  }

  const payload = await fetchSensorLatest();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.write('retry: 1500\n');
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  res.end();
}

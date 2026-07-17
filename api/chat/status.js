import { json, methodNotAllowed } from '../../server/apiUtils.js';

export default function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const hasGroq = Boolean(process.env.GROQ_API_KEY);
  return json(res, 200, {
    available: true,
    llm_enabled: hasGroq,
    provider: hasGroq ? 'groq' : 'local',
    message: hasGroq ? null : 'Local farm assistant active. Set GROQ_API_KEY for LLM replies.',
  });
}

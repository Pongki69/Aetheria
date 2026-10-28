import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Role = 'USER' | 'ADMIN';
type Account = { id: string; email: string; name: string; role: Role; avatar: string; uid: string; joinedDate: string; passwordHash: string; verified: boolean; createdAt: string };
type PublicAccount = Omit<Account, 'passwordHash' | 'verified' | 'createdAt'> & { verified: boolean };
type PendingCode = { email: string; name: string; purpose: 'register' | 'reset' | 'invite'; hash: string; expires: number; attempts: number; passwordHash?: string };
type AiProvider = 'openrouter' | 'gemini' | 'groq' | 'lmstudio';
type LocalProfile = 'high' | 'medium' | 'low' | 'lowest';
type AiModelOption = { id: string; name: string; provider: AiProvider; free: boolean; local: boolean };
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const root = path.dirname(fileURLToPath(import.meta.url));
const storePath = path.join(root, 'data', 'users.json');
let users: Account[] = [];
const pending = new Map<string, PendingCode>();
const sessions = new Map<string, { userId: string; expires: number }>();
let writeQueue = Promise.resolve();
const emailRate = new Map<string, number>();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(',').map((value) => value.trim()).filter(Boolean) || ['http://localhost:5173'] }));
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

function publicUser(user: Account): PublicAccount {
  const { passwordHash: _passwordHash, createdAt: _createdAt, ...safe } = user;
  return safe;
}
function normalizedEmail(input: unknown): string { return typeof input === 'string' ? input.trim().toLowerCase() : ''; }
function validEmail(email: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254; }
function otpPepper(): string {
  const pepper = process.env.OTP_PEPPER?.trim();
  if (!pepper || pepper.length < 32 || pepper.startsWith('replace-')) {
    throw new Error('OTP delivery is not configured. Set OTP_PEPPER to a random secret of at least 32 characters in backend/.env.');
  }
  return pepper;
}
function hashCode(code: string): string { return crypto.createHmac('sha256', otpPepper()).update(code).digest('hex'); }
function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(`${salt}:${key.toString('hex')}`));
  });
}
async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, encoded] = stored.split(':');
  if (!salt || !encoded) return false;
  return new Promise((resolve) => crypto.scrypt(password, salt, 64, (error, key) => {
    if (error) return resolve(false);
    const expected = Buffer.from(encoded, 'hex');
    resolve(expected.length === key.length && crypto.timingSafeEqual(expected, key));
  }));
}
async function saveUsers(): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    const temporary = `${storePath}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(users, null, 2), { mode: 0o600 });
    await fs.rename(temporary, storePath);
  });
  await writeQueue;
}
async function sendEmailCode(email: string, code: string, purpose: 'register' | 'reset' | 'invite'): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error('Email delivery is not configured. Add RESEND_API_KEY and EMAIL_FROM to backend/.env.');
  const subject = purpose === 'reset' ? 'Reset your Aetheria password' : 'Verify your Aetheria account';
  const action = purpose === 'reset' ? 'reset your password' : 'verify your email and finish setting up your account';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject, html: `<div style="font-family:Arial,sans-serif;color:#0f172a"><h2>Aetheria verification</h2><p>Use this code to ${action}:</p><p style="font-size:30px;font-weight:bold;letter-spacing:8px">${code}</p><p>This code expires in 10 minutes. If you did not request it, ignore this email.</p></div>` })
  });
  if (!response.ok) throw new Error(`Email provider rejected the request (${response.status}). Check the sender configuration.`);
}
function getBearer(req: express.Request): string | undefined {
  const value = req.header('authorization');
  return value?.startsWith('Bearer ') ? value.slice(7) : undefined;
}
function authenticated(req: express.Request): Account | undefined {
  const token = getBearer(req);
  if (!token) return undefined;
  const session = sessions.get(token);
  if (!session || session.expires <= Date.now()) { sessions.delete(token); return undefined; }
  return users.find((user) => user.id === session.userId);
}
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const user = authenticated(req);
  if (!user) { res.status(401).json({ error: 'Please sign in again.' }); return; }
  res.locals.user = user;
  next();
}
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const user = res.locals.user as Account | undefined;
  if (!user || user.role !== 'ADMIN') { res.status(403).json({ error: 'Administrator access is required.' }); return; }
  next();
}
function startSession(user: Account): { token: string; user: PublicAccount } {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { userId: user.id, expires: Date.now() + 30 * 24 * 60 * 60 * 1000 });
  return { token, user: publicUser(user) };
}

const localProfiles: Record<LocalProfile, { context_length: number; eval_batch_size: number; flash_attention: boolean; offload_kv_cache_to_gpu: boolean }> = {
  high: { context_length: 16_384, eval_batch_size: 512, flash_attention: true, offload_kv_cache_to_gpu: true },
  medium: { context_length: 8_192, eval_batch_size: 256, flash_attention: true, offload_kv_cache_to_gpu: true },
  low: { context_length: 4_096, eval_batch_size: 128, flash_attention: true, offload_kv_cache_to_gpu: false },
  lowest: { context_length: 2_048, eval_batch_size: 64, flash_attention: false, offload_kv_cache_to_gpu: false }
};

function localStudioUrl(endpoint: string): string {
  const base = process.env.LM_STUDIO_BASE_URL?.trim() || 'http://127.0.0.1:1234';
  const url = new URL(base);
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname)) throw new Error('LM Studio must use a local address for this connection.');
  return `${url.origin}${endpoint}`;
}

function localStudioHeaders(json = false): HeadersInit {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(process.env.LM_STUDIO_API_KEY ? { Authorization: `Bearer ${process.env.LM_STUDIO_API_KEY}` } : {})
  };
}

async function fetchLocalStudioModels(): Promise<AiModelOption[]> {
  const response = await fetch(localStudioUrl('/api/v1/models'), { headers: localStudioHeaders(), signal: AbortSignal.timeout(2500) });
  if (!response.ok) return [];
  const body = await response.json() as { models?: Array<{ type?: string; key?: string; display_name?: string }> };
  return (body.models || []).filter((model) => model.type === 'llm' && model.key).map((model) => ({ id: model.key!, name: model.display_name || model.key!, provider: 'lmstudio', free: true, local: true }));
}

async function openRouterChat(apiKey: string, preferredModel: string, messages: Array<{ role: string; content: string }>, maxTokens = 1200): Promise<{ text: string; providerUsed: string }> {
  let fallbackModels: string[] = [];
  try {
    const catalogResponse = await fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(8000) });
    if (catalogResponse.ok) {
      const catalog = await catalogResponse.json() as { data?: Array<{ id?: string; pricing?: { prompt?: string; completion?: string } }> };
      fallbackModels = (catalog.data || []).filter((model) => model.id && model.id !== preferredModel && model.pricing?.prompt === '0' && model.pricing?.completion === '0').slice(0, 4).map((model) => model.id!);
    }
  } catch { /* OpenRouter can still try the requested route if its catalog is briefly unavailable. */ }
  const models = [preferredModel, ...fallbackModels];
  let lastError: Error & { status?: number } = Object.assign(new Error('OpenRouter did not return a response.'), { status: 502 });
  for (const model of models) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'http://localhost:5173', 'X-Title': 'Aetheria' }, body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: maxTokens }), signal: AbortSignal.timeout(90_000) });
    if (response.ok) {
      const body = await response.json() as { choices?: Array<{ message?: { content?: string } }>; model?: string };
      const text = body.choices?.[0]?.message?.content;
      if (!text) { lastError = Object.assign(new Error('OpenRouter returned an empty response.'), { status: 502 }); continue; }
      return { text, providerUsed: `OpenRouter · ${body.model || model}` };
    }
    const failure = await response.json().catch(() => ({})) as { error?: { message?: string } };
    const detail = failure.error?.message?.slice(0, 300);
    lastError = Object.assign(new Error(detail ? `OpenRouter rejected ${model} (${response.status}): ${detail}` : `OpenRouter request failed for ${model} (${response.status}).`), { status: response.status });
  }
  throw lastError;
}

app.get('/api/ai/models', requireAuth, async (_req, res) => {
  const models: AiModelOption[] = [];
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (openRouterKey) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${openRouterKey}` }, signal: AbortSignal.timeout(8000) });
      if (response.ok) {
        const body = await response.json() as { data?: Array<{ id?: string; name?: string; pricing?: { prompt?: string; completion?: string } }> };
        for (const model of body.data || []) if (model.id && model.pricing?.prompt === '0' && model.pricing?.completion === '0') models.push({ id: model.id, name: model.name || model.id, provider: 'openrouter', free: true, local: false });
        models.unshift({ id: 'openrouter/free', name: 'Auto · OpenRouter free models', provider: 'openrouter', free: true, local: false });
      }
    } catch { /* A temporarily unavailable catalog should not block local models. */ }
  }
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiKey)}`, { signal: AbortSignal.timeout(8000) });
      if (response.ok) {
        const body = await response.json() as { models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }> };
        for (const model of body.models || []) if (model.name && model.supportedGenerationMethods?.includes('generateContent') && /flash|gemma/i.test(model.name)) models.push({ id: model.name.replace(/^models\//, ''), name: `Gemini · ${model.displayName || model.name}`, provider: 'gemini', free: true, local: false });
      }
    } catch { /* Keep other configured providers available. */ }
  }
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${groqKey}` }, signal: AbortSignal.timeout(8000) });
      if (response.ok) {
        const body = await response.json() as { data?: Array<{ id?: string; display_name?: string }> };
        for (const model of body.data || []) if (model.id) models.push({ id: model.id, name: `Groq · ${model.display_name || model.id}`, provider: 'groq', free: true, local: false });
      }
    } catch { /* Keep other configured providers available. */ }
  }
  try { models.push(...await fetchLocalStudioModels()); } catch { /* LM Studio may be closed. */ }
  res.json(models);
});

app.post('/api/ai/chat', requireAuth, async (req, res) => {
  const provider = req.body.provider as AiProvider;
  const modelId = typeof req.body.modelId === 'string' ? req.body.modelId.slice(0, 200) : '';
  const prompt = typeof req.body.prompt === 'string' ? req.body.prompt.slice(0, 250_000) : '';
  const systemInstruction = typeof req.body.systemInstruction === 'string' ? req.body.systemInstruction.slice(0, 20_000) : '';
  const maxTokens = req.body.purpose === 'ambient-thought' ? 2500 : Number.isInteger(req.body.maxTokens) ? Math.max(1200, Math.min(req.body.maxTokens, 12_000)) : 1200;
  const profile = (['high', 'medium', 'low', 'lowest'].includes(req.body.localModelProfile) ? req.body.localModelProfile : 'medium') as LocalProfile;
  if (!['openrouter', 'gemini', 'groq', 'lmstudio'].includes(provider) || !modelId || !prompt) { res.status(400).json({ error: 'Choose an AI model and enter a message.' }); return; }
  const messages = [
    ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
    { role: 'user', content: prompt }
  ];
  try {
    if (provider === 'lmstudio') {
      const options = localProfiles[profile];
      const catalogResponse = await fetch(localStudioUrl('/api/v1/models'), { headers: localStudioHeaders(), signal: AbortSignal.timeout(3000) });
      if (!catalogResponse.ok) throw new Error('LM Studio local server is unavailable. Start it from the Developer tab.');
      const catalog = await catalogResponse.json() as { models?: Array<{ type?: string; key?: string; loaded_instances?: Array<{ id: string; config?: { context_length?: number; eval_batch_size?: number; flash_attention?: boolean; offload_kv_cache_to_gpu?: boolean } }> }> };
      const model = (catalog.models || []).find((entry) => entry.type === 'llm' && entry.key === modelId);
      if (!model) throw new Error('That local model is no longer available in LM Studio. Refresh the model list.');
      const active = model.loaded_instances?.[0];
      const matches = active && Object.entries(options).every(([key, value]) => active.config?.[key as keyof typeof active.config] === value);
      if (!matches) {
        if (active) {
          const unload = await fetch(localStudioUrl('/api/v1/models/unload'), { method: 'POST', headers: localStudioHeaders(true), body: JSON.stringify({ instance_id: active.id }), signal: AbortSignal.timeout(30_000) });
          if (!unload.ok) throw new Error('LM Studio could not unload the current model configuration.');
        }
        const load = await fetch(localStudioUrl('/api/v1/models/load'), { method: 'POST', headers: localStudioHeaders(true), body: JSON.stringify({ model: modelId, ...options }), signal: AbortSignal.timeout(120_000) });
        if (!load.ok) throw new Error('LM Studio could not load this model at the selected resource level. Try a lower profile or a smaller model.');
      }
      const response = await fetch(localStudioUrl('/v1/chat/completions'), { method: 'POST', headers: localStudioHeaders(true), body: JSON.stringify({ model: modelId, messages, temperature: 0.7, max_tokens: maxTokens }), signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`LM Studio request failed (${response.status}).`);
      const body = await response.json() as { choices?: Array<{ message?: { content?: string } }>; model?: string };
      const text = body.choices?.[0]?.message?.content;
      if (!text) throw new Error('The local model returned an empty response.');
      res.json({ text, providerUsed: `LM Studio · ${body.model || modelId}` }); return;
    }

    if (provider === 'openrouter') {
      const apiKey = process.env.OPENROUTER_API_KEY?.trim();
      if (!apiKey) throw new Error('Add OPENROUTER_API_KEY to backend/.env to use hosted free models.');
      try { res.json(await openRouterChat(apiKey, modelId, messages, maxTokens)); }
      catch (error) { const status = (error as { status?: number }).status; res.status(status === 429 ? 429 : 502).json({ error: status === 429 ? 'All configured free OpenRouter models are rate-limited. Try again later or select a local model.' : error instanceof Error ? error.message : 'OpenRouter request failed.' }); }
      return;
    }

    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey) throw new Error('Add GEMINI_API_KEY to backend/.env to use Gemini.');
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system_instruction: { parts: [{ text: systemInstruction }] }, contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens } }), signal: AbortSignal.timeout(90_000) });
      if (response.status === 429) {
        const routerKey = process.env.OPENROUTER_API_KEY?.trim();
        if (routerKey) { try { res.json(await openRouterChat(routerKey, 'openrouter/free', messages, maxTokens)); } catch { res.status(429).json({ error: 'Gemini and the available OpenRouter free models are rate-limited.' }); } }
        else res.status(429).json({ error: 'Gemini is rate-limited. Choose another available model and try again.' });
        return;
      }
      if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);
      const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('');
      if (!text) throw new Error('Gemini returned an empty response.');
      res.json({ text, providerUsed: `Gemini · ${modelId}` }); return;
    }

    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) throw new Error('Add GROQ_API_KEY to backend/.env to use Groq.');
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelId, messages, temperature: 0.7, max_tokens: maxTokens }), signal: AbortSignal.timeout(90_000) });
    if (response.status === 429) {
      const routerKey = process.env.OPENROUTER_API_KEY?.trim();
      if (routerKey) { try { res.json(await openRouterChat(routerKey, 'openrouter/free', messages, maxTokens)); } catch { res.status(429).json({ error: 'Groq and the available OpenRouter free models are rate-limited.' }); } }
      else res.status(429).json({ error: 'Groq is rate-limited. Choose another available model and try again.' });
      return;
    }
    if (!response.ok) throw new Error(`Groq request failed (${response.status}).`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }>; model?: string };
    const text = body.choices?.[0]?.message?.content;
    if (!text) throw new Error('Groq returned an empty response.');
    res.json({ text, providerUsed: `Groq · ${body.model || modelId}` });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'The model request failed.' });
  }
});

app.post('/api/sketchfab/download', requireAuth, async (req, res) => {
  const rawUrl = typeof req.body.url === 'string' ? req.body.url.trim() : '';
  let parsedUrl: URL;
  try { parsedUrl = new URL(rawUrl); }
  catch { res.status(400).json({ error: 'Enter a valid Sketchfab model URL.' }); return; }
  if (parsedUrl.protocol !== 'https:' || !['sketchfab.com', 'www.sketchfab.com', 'm.sketchfab.com'].includes(parsedUrl.hostname.toLowerCase())) {
    res.status(400).json({ error: 'Use a model page URL from sketchfab.com.' }); return;
  }
  const uidMatch = parsedUrl.pathname.match(/(?:^|[-/])([a-f0-9]{32})\/?$/i);
  if (!uidMatch) { res.status(400).json({ error: 'Could not find a 32-character model ID at the end of that Sketchfab URL.' }); return; }
  const apiToken = process.env.SKETCHFAB_API_TOKEN?.trim();
  if (!apiToken) { res.status(503).json({ error: 'Sketchfab is not configured. Add SKETCHFAB_API_TOKEN to backend/.env and restart the backend.' }); return; }

  try {
    const downloadInfoResponse = await fetch(`https://api.sketchfab.com/v3/models/${uidMatch[1]}/download`, {
      headers: { Authorization: `Token ${apiToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000)
    });
    if (!downloadInfoResponse.ok) {
      const message = downloadInfoResponse.status === 401 ? 'Sketchfab rejected the API token.'
        : downloadInfoResponse.status === 403 ? 'This model is not downloadable by the connected Sketchfab account.'
          : downloadInfoResponse.status === 404 ? 'Sketchfab model not found.'
            : `Sketchfab could not prepare this model (${downloadInfoResponse.status}).`;
      res.status(downloadInfoResponse.status === 429 ? 429 : 502).json({ error: message }); return;
    }
    const info = await downloadInfoResponse.json() as { gltf?: { url?: string; size?: number } };
    if (!info.gltf?.url) { res.status(422).json({ error: 'Sketchfab did not provide a glTF download for this model.' }); return; }
    const archiveUrl = new URL(info.gltf.url);
    if (archiveUrl.protocol !== 'https:' || !archiveUrl.hostname.toLowerCase().endsWith('.amazonaws.com')) {
      res.status(502).json({ error: 'Sketchfab returned an unexpected download location.' }); return;
    }
    const archiveResponse = await fetch(archiveUrl, { signal: AbortSignal.timeout(120_000) });
    if (!archiveResponse.ok || !archiveResponse.body) { res.status(502).json({ error: 'Could not download the Sketchfab model archive.' }); return; }
    const maxArchiveBytes = 150 * 1024 * 1024;
    const declaredSize = Number(archiveResponse.headers.get('content-length') || info.gltf.size || 0);
    if (declaredSize > maxArchiveBytes) { res.status(413).json({ error: 'This Sketchfab archive is over the 150 MB import limit.' }); return; }
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const reader = archiveResponse.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const data = Buffer.from(value);
      totalBytes += data.length;
      if (totalBytes > maxArchiveBytes) { await reader.cancel().catch(() => undefined); res.status(413).json({ error: 'This Sketchfab archive is over the 150 MB import limit.' }); return; }
      chunks.push(data);
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', totalBytes);
    res.send(Buffer.concat(chunks, totalBytes));
  } catch (error) {
    res.status(502).json({ error: error instanceof Error && error.name === 'TimeoutError' ? 'Sketchfab took too long to respond.' : 'Could not retrieve this Sketchfab model.' });
  }
});

app.post('/api/spriters-resource/preview', requireAuth, async (req, res) => {
  const rawUrl = typeof req.body.url === 'string' ? req.body.url.trim() : '';
  let pageUrl: URL;
  try { pageUrl = new URL(rawUrl); }
  catch { res.status(400).json({ error: 'Enter a valid The Models Resource asset page URL.' }); return; }
  if (pageUrl.protocol !== 'https:' || pageUrl.hostname.toLowerCase() !== 'models.spriters-resource.com' || !/\/asset\/\d+\/?$/i.test(pageUrl.pathname)) {
    res.status(400).json({ error: 'Use a model asset page from models.spriters-resource.com.' }); return;
  }

  try {
    const pageResponse = await fetch(pageUrl, { headers: { Accept: 'text/html', 'User-Agent': 'Aetheria/1.0 model importer' }, redirect: 'error', signal: AbortSignal.timeout(20_000) });
    if (!pageResponse.ok) { res.status(502).json({ error: pageResponse.status === 403 ? 'The Models Resource blocks automatic downloads (403). Open the model page in your browser, download its ZIP, then choose Upload File here. ZIP files containing GLB, glTF, FBX, DAE, PMX, or PMD are supported.' : `The Models Resource page could not be opened (${pageResponse.status}).` }); return; }
    const pageHtml = (await pageResponse.text()).replace(/\\u002f/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
    const candidates = [...pageHtml.matchAll(/(?:https?:\/\/|\/\/|\/)[^"'<>\s\\]*?\.(?:glb|zip)(?:\?[^"'<>\s\\]*)?/gi)].map((match) => match[0]);
    const modelUrls = candidates.map((candidate) => {
      try { return new URL(candidate, pageUrl); } catch { return null; }
    }).filter((candidate): candidate is URL => !!candidate && candidate.protocol === 'https:' && /(?:^|\.)spriters-resource\.com$/i.test(candidate.hostname) && /\.(?:glb|zip)$/i.test(candidate.pathname));
    const previewUrl = modelUrls.find((candidate) => candidate.pathname.toLowerCase().endsWith('.glb')) || modelUrls.find((candidate) => candidate.pathname.toLowerCase().endsWith('.zip'));
    if (!previewUrl) {
      res.status(422).json({ error: 'Could not find a downloadable GLB preview or model ZIP on this asset page.' }); return;
    }
    const modelResponse = await fetch(previewUrl, { headers: { Referer: 'https://models.spriters-resource.com/' }, redirect: 'error', signal: AbortSignal.timeout(90_000) });
    if (!modelResponse.ok || !modelResponse.body) { res.status(502).json({ error: 'Could not retrieve the Models Resource preview model.' }); return; }
    const maxModelBytes = 100 * 1024 * 1024;
    const declaredSize = Number(modelResponse.headers.get('content-length') || 0);
    if (declaredSize > maxModelBytes) { res.status(413).json({ error: 'This preview model exceeds the 100 MB import limit.' }); return; }
    const reader = modelResponse.body.getReader();
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      totalBytes += chunk.length;
      if (totalBytes > maxModelBytes) { await reader.cancel().catch(() => undefined); res.status(413).json({ error: 'This preview model exceeds the 100 MB import limit.' }); return; }
      chunks.push(chunk);
    }
    res.setHeader('Content-Type', previewUrl.pathname.toLowerCase().endsWith('.zip') ? 'application/zip' : 'model/gltf-binary');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', totalBytes);
    res.send(Buffer.concat(chunks, totalBytes));
  } catch (error) {
    res.status(502).json({ error: error instanceof Error && error.name === 'TimeoutError' ? 'The Models Resource took too long to respond.' : 'Could not retrieve the Models Resource preview model.' });
  }
});

function emailThrottle(email: string): boolean {
  const last = emailRate.get(email) || 0;
  if (Date.now() - last < 60_000) return false;
  emailRate.set(email, Date.now());
  return true;
}
async function issueCode(email: string, name: string, purpose: 'register' | 'reset' | 'invite', passwordHash?: string): Promise<void> {
  // Fail before reserving the email throttle when delivery or OTP hashing is not configured.
  otpPepper();
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    throw new Error('Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM in backend/.env.');
  }
  if (!emailThrottle(email)) throw new Error('Please wait one minute before requesting another code.');
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  pending.set(`${purpose}:${email}`, { email, name, purpose, hash: hashCode(code), expires: Date.now() + 10 * 60_000, attempts: 0, ...(passwordHash ? { passwordHash } : {}) });
  try { await sendEmailCode(email, code, purpose); }
  catch (error) { pending.delete(`${purpose}:${email}`); throw error; }
}

app.post('/api/auth/register/request-code', async (req, res) => {
  const email = normalizedEmail(req.body.email);
  const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!validEmail(email) || name.length < 2 || password.length < 10 || password.length > 200) {
    res.status(400).json({ error: 'Enter a valid email, a name, and a password with at least 10 characters.' }); return;
  }
  if (users.some((user) => user.email === email)) { res.status(409).json({ error: 'An account already uses this email. Sign in or reset its password.' }); return; }
  try { await issueCode(email, name, 'register'); res.json({ ok: true, message: 'Verification code sent. Check your inbox.' }); }
  catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : 'Unable to send email.' }); }
});

app.post('/api/auth/register/verify-code', async (req, res) => {
  const email = normalizedEmail(req.body.email); const code = String(req.body.code || '').trim();
  const key = pending.has(`register:${email}`) ? `register:${email}` : `invite:${email}`;
  const record = pending.get(key);
  if (!record || record.expires < Date.now() || record.attempts >= 5) { pending.delete(key); res.status(400).json({ error: 'Code expired or unavailable. Request a new code.' }); return; }
  record.attempts++;
  if (!/^\d{6}$/.test(code) || !crypto.timingSafeEqual(Buffer.from(record.hash), Buffer.from(hashCode(code)))) { res.status(400).json({ error: 'That verification code is not correct.' }); return; }
  let user = users.find((entry) => entry.email === email);
  let passwordHash = record.passwordHash;
  if (!passwordHash) {
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (password.length < 10 || password.length > 200) { res.status(400).json({ error: 'Choose a password with at least 10 characters to finish setting up your account.' }); return; }
    passwordHash = await hashPassword(password);
  }
  if (user && user.verified) { pending.delete(key); res.status(409).json({ error: 'An account already uses this email.' }); return; }
  if (!user) {
    user = { id: `usr-${crypto.randomUUID()}`, email, name: record.name, role: 'USER', avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(record.name)}&background=0284c7&color=ffffff&bold=true`, uid: `AET-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, joinedDate: new Date().toISOString().slice(0, 10), passwordHash, verified: true, createdAt: new Date().toISOString() };
    users.push(user);
  } else { user.passwordHash = passwordHash; user.verified = true; }
  await saveUsers(); pending.delete(key); res.status(201).json(startSession(user));
});

app.post('/api/auth/invite/request-code', async (req, res) => {
  const email = normalizedEmail(req.body.email);
  const user = users.find((entry) => entry.email === email && !entry.verified);
  if (!user) { res.status(404).json({ error: 'No pending invitation was found for that email.' }); return; }
  try { await issueCode(email, user.name, 'invite'); res.json({ ok: true, message: 'A fresh verification code was sent to your email.' }); }
  catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : 'Unable to send email.' }); }
});

app.post('/api/auth/login', async (req, res) => {
  const email = normalizedEmail(req.body.email); const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = users.find((entry) => entry.email === email);
  if (!user || !user.verified || !(await verifyPassword(password, user.passwordHash))) { res.status(401).json({ error: 'Email or password is incorrect.' }); return; }
  res.json(startSession(user));
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const email = normalizedEmail(req.body.email); const user = users.find((entry) => entry.email === email && entry.verified);
  if (user) {
    try { await issueCode(email, user.name, 'reset'); }
    catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : 'Unable to send email.' }); return; }
  }
  res.json({ ok: true, message: 'If that verified account exists, a reset code has been sent.' });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const email = normalizedEmail(req.body.email); const code = String(req.body.code || '').trim();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const record = pending.get(`reset:${email}`); const user = users.find((entry) => entry.email === email && entry.verified);
  if (!record || !user || record.expires < Date.now() || record.attempts >= 5) { pending.delete(`reset:${email}`); res.status(400).json({ error: 'Code expired or unavailable. Request a new code.' }); return; }
  record.attempts++;
  if (!/^\d{6}$/.test(code) || !crypto.timingSafeEqual(Buffer.from(record.hash), Buffer.from(hashCode(code)))) { res.status(400).json({ error: 'That reset code is not correct.' }); return; }
  if (password.length < 10 || password.length > 200) { res.status(400).json({ error: 'Choose a password with at least 10 characters.' }); return; }
  user.passwordHash = await hashPassword(password); await saveUsers(); pending.delete(`reset:${email}`);
  for (const [token, session] of sessions) if (session.userId === user.id) sessions.delete(token);
  res.json({ ok: true, message: 'Password updated. You can now sign in.' });
});

app.post('/api/auth/google', async (req, res) => {
  const idToken = typeof req.body.idToken === 'string' ? req.body.idToken : '';
  const expectedAudience = process.env.GOOGLE_CLIENT_ID;
  if (!idToken || !expectedAudience) { res.status(503).json({ error: 'Google sign-in is not configured on the server.' }); return; }
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!response.ok) { res.status(401).json({ error: 'Google could not verify this sign-in.' }); return; }
    const claims = await response.json() as { aud?: string; email?: string; email_verified?: string; name?: string; picture?: string };
    const email = normalizedEmail(claims.email);
    if (claims.aud !== expectedAudience || claims.email_verified !== 'true' || !validEmail(email)) { res.status(401).json({ error: 'Google account verification failed.' }); return; }
    let user = users.find((entry) => entry.email === email);
    if (!user) {
      const newUser: Account = { id: `usr-${crypto.randomUUID()}`, email, name: claims.name || email.split('@')[0] || email, role: 'USER', avatar: claims.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(email)}`, uid: `AET-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, joinedDate: new Date().toISOString().slice(0, 10), passwordHash: '', verified: true, createdAt: new Date().toISOString() };
      user = newUser; users.push(newUser); await saveUsers();
    } else if (!user.verified) {
      user.verified = true;
      await saveUsers();
    }
    res.json(startSession(user));
  } catch { res.status(502).json({ error: 'Could not verify Google sign-in right now.' }); }
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json(publicUser(res.locals.user as Account)));
app.patch('/api/auth/profile', requireAuth, async (req, res) => {
  const user = res.locals.user as Account;
  const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 80) : user.name;
  if (name.length < 2) { res.status(400).json({ error: 'Display name must contain at least two characters.' }); return; }
  user.name = name; await saveUsers(); res.json(publicUser(user));
});
app.post('/api/auth/logout', requireAuth, (req, res) => { const token = getBearer(req); if (token) sessions.delete(token); res.json({ ok: true }); });

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => res.json(users.map(publicUser)));
app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const email = normalizedEmail(req.body.email); const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
  if (!validEmail(email) || name.length < 2) { res.status(400).json({ error: 'Enter a valid email and a name.' }); return; }
  if (users.some((user) => user.email === email)) { res.status(409).json({ error: 'An account already uses this email.' }); return; }
  const user: Account = { id: `usr-${crypto.randomUUID()}`, email, name, role: 'USER', avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0284c7&color=ffffff&bold=true`, uid: `AET-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, joinedDate: new Date().toISOString().slice(0, 10), passwordHash: '', verified: false, createdAt: new Date().toISOString() };
  users.push(user); await saveUsers();
  try { await issueCode(email, name, 'invite'); res.status(201).json({ user: publicUser(user), message: 'Account created. A verification email was sent; the user sets their password after verifying.' }); }
  catch (error) { res.status(201).json({ user: publicUser(user), warning: error instanceof Error ? error.message : 'Email could not be sent.' }); }
});
app.patch('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const user = users.find((entry) => entry.id === req.params.id);
  if (!user) { res.status(404).json({ error: 'User not found.' }); return; }
  const actingAdmin = res.locals.user as Account;
  const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 80) : user.name;
  const email = req.body.email === undefined ? user.email : normalizedEmail(req.body.email);
  const role: Role = req.body.role === 'ADMIN' ? 'ADMIN' : req.body.role === 'USER' ? 'USER' : user.role;
  if (name.length < 2 || !validEmail(email)) { res.status(400).json({ error: 'Enter a valid name and email.' }); return; }
  if (user.id === actingAdmin.id && role !== 'ADMIN') { res.status(400).json({ error: 'You cannot remove administrator access from your own account.' }); return; }
  if (users.some((entry) => entry.id !== user.id && entry.email === email)) { res.status(409).json({ error: 'Another account already uses this email.' }); return; }
  user.name = name; user.email = email; user.role = role; await saveUsers(); res.json(publicUser(user));
});
app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const admin = res.locals.user as Account;
  if (req.params.id === admin.id) { res.status(400).json({ error: 'You cannot delete the account you are currently using.' }); return; }
  const exists = users.some((user) => user.id === req.params.id);
  if (!exists) { res.status(404).json({ error: 'User not found.' }); return; }
  users = users.filter((user) => user.id !== req.params.id);
  for (const [token, session] of sessions) if (session.userId === req.params.id) sessions.delete(token);
  await saveUsers(); res.status(204).send();
});

let agents: any[] = [];
app.get('/api/agents', (req, res) => res.json(agents));
app.post('/api/agents', (req, res) => {
  const newAgent = { id: `agent-${Date.now()}`, name: req.body.name || 'New Agent', role: req.body.role || 'Unassigned', instructions: req.body.instructions || '', status: 'STANDBY', statusText: 'Initialized', modelName: 'GPT-5.2 Ops', modelContext: '128K CONTEXT', modelUrl: '/models/mint.glb', posX: (Math.random() - 0.5) * 6, posZ: (Math.random() - 0.5) * 6, ...req.body };
  agents.push(newAgent); broadcast({ type: 'AGENT_CREATED', agent: newAgent }); res.status(201).json(newAgent);
});
app.patch('/api/agents/:id', (req, res) => { const index = agents.findIndex((agent) => agent.id === req.params.id); if (index === -1) { res.status(404).json({ error: 'Agent not found' }); return; } agents[index] = { ...agents[index], ...req.body }; broadcast({ type: 'AGENT_UPDATED', agent: agents[index] }); res.json(agents[index]); });
app.delete('/api/agents/:id', (req, res) => { agents = agents.filter((agent) => agent.id !== req.params.id); broadcast({ type: 'AGENT_DELETED', id: req.params.id }); res.status(204).send(); });
function broadcast(data: unknown): void { wss.clients.forEach((client) => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data)); }); }

async function bootstrap(): Promise<void> {
  try { users = JSON.parse(await fs.readFile(storePath, 'utf8')) as Account[]; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const adminEmail = normalizedEmail(process.env.ADMIN_EMAIL); const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword && validEmail(adminEmail) && !adminEmail.endsWith('.example') && !adminPassword.startsWith('replace-') && adminPassword.length >= 10 && !users.some((user) => user.email === adminEmail)) {
    const name = process.env.ADMIN_NAME?.trim() || 'Aetheria Admin';
    users.push({ id: `usr-${crypto.randomUUID()}`, email: adminEmail, name, role: 'ADMIN', avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0284c7&color=ffffff&bold=true`, uid: `AET-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, joinedDate: new Date().toISOString().slice(0, 10), passwordHash: await hashPassword(adminPassword), verified: true, createdAt: new Date().toISOString() });
    await saveUsers();
    console.info('Initial administrator account created from environment configuration.');
  }
  const port = Number(process.env.PORT || 5000);
  server.listen(port, () => console.log(`Backend server running at http://localhost:${port}`));
}
void bootstrap().catch((error: unknown) => { console.error('Backend startup failed:', error); process.exitCode = 1; });

import { createHash, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import net from 'node:net';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '.data');
const STORE_PATH = join(DATA_DIR, 'trial-store.json');
const DAY_MS = 24 * 60 * 60 * 1000;
const ANON_LIMIT = 3;
const EMAIL_LIMIT = 8;
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || process.env.CODEX_BASE_URL || 'https://9router.phamphunguyenhung.com/v1').replace(/\/$/, '');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.NINEROUTER_API_KEY || process.env.ROUTER_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || process.env.SEO_TRIAL_MODEL || 'cx/gpt-5.3-codex-none';

mkdirSync(DATA_DIR, { recursive: true });

function loadStore() {
  if (!existsSync(STORE_PATH)) return { usage: {}, leads: [] };
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return { usage: {}, leads: [] };
  }
}

function saveStore(store) {
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)])
  );
}

function getSession(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  const session = cookies.sm_trial || randomUUID();
  if (!cookies.sm_trial) {
    res.setHeader('Set-Cookie', `sm_trial=${encodeURIComponent(session)}; Path=/; Max-Age=2592000; SameSite=Lax; HttpOnly`);
  }
  return session;
}

function ipKey(req) {
  const raw = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local';
  return String(raw).split(',')[0].trim();
}

function identityKey(req, session, email) {
  const basis = email ? `email:${email.toLowerCase()}` : `anon:${session}:${ipKey(req)}`;
  return createHash('sha256').update(basis).digest('hex').slice(0, 32);
}

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 100_000) throw new Error('Payload too large');
  }
  return body ? JSON.parse(body) : {};
}

function usageFor(req, session, email) {
  const store = loadStore();
  const key = `${todayKey()}:${identityKey(req, session, email)}`;
  const record = store.usage[key] || { count: 0, email: email || null, createdAt: Date.now() };
  const limit = email ? EMAIL_LIMIT : ANON_LIMIT;
  return { store, key, record, limit, remaining: Math.max(0, limit - record.count) };
}

function consumeUsage(req, session, email, tool) {
  const state = usageFor(req, session, email);
  if (state.record.count >= state.limit) {
    return { ok: false, limit: state.limit, remaining: 0 };
  }
  state.record.count += 1;
  state.record.email = email || state.record.email || null;
  state.record.updatedAt = Date.now();
  state.record.lastTool = tool;
  state.store.usage[state.key] = state.record;
  saveStore(state.store);
  return { ok: true, limit: state.limit, remaining: Math.max(0, state.limit - state.record.count) };
}

function emailFromRequest(req, payload = {}) {
  const headerEmail = req.headers['x-trial-email'];
  const value = payload.email || headerEmail || '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? String(value).toLowerCase() : '';
}

function requireText(value, min, max, label) {
  const text = String(value || '').trim();
  if (text.length < min || text.length > max) {
    const error = new Error(`${label} không hợp lệ.`);
    error.status = 400;
    throw error;
  }
  return text;
}

function titleCase(text) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function generateMeta(topic) {
  const clean = requireText(topic, 2, 160, 'Chủ đề');
  const titled = titleCase(clean);
  const titles = [
    `${titled}: Hướng Dẫn SEO Thực Chiến`,
    `Cách Tối Ưu ${titled} Để Tăng Chuyển Đổi`,
    `${titled} Cho Người Mới: Checklist 2026`,
    `Chiến Lược ${titled} Giúp Tăng Traffic Bền Vững`,
    `${titled}: Lỗi Thường Gặp Và Cách Sửa`
  ];
  const descriptions = [
    `Khám phá cách triển khai ${clean} bằng quy trình SEO rõ ràng, dễ áp dụng và phù hợp cho đội ngũ nội dung nhỏ.`,
    `Bản hướng dẫn ${clean} tập trung vào intent, cấu trúc bài viết, CTA và các bước tối ưu giúp tăng traffic chất lượng.`,
    `Tối ưu ${clean} nhanh hơn với checklist thực chiến, ví dụ cụ thể và gợi ý cải thiện có thể áp dụng ngay hôm nay.`,
    `Xây dựng nội dung ${clean} có khả năng xếp hạng tốt hơn nhờ research, outline, meta và internal link đúng hướng.`,
    `Tránh các lỗi phổ biến khi làm ${clean}; nhận khung triển khai giúp nội dung rõ hơn, hữu ích hơn và dễ chuyển đổi hơn.`
  ];
  return { titles, descriptions };
}

async function callRouterJson(system, user, fallback) {
  if (!OPENAI_API_KEY) return fallback();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);
  try {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${OPENAI_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0.4,
        max_tokens: 1200,
        stream: false,
        response_format: { type: 'json_object' }
      })
    });
    if (!response.ok) return fallback();
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(content);
    return { ...parsed, aiPowered: true, model: OPENAI_MODEL };
  } catch {
    return fallback();
  } finally {
    clearTimeout(timeout);
  }
}

function generateBriefLocal(keyword) {
  const clean = requireText(keyword, 2, 120, 'Keyword');
  const intent = /giá|mua|dịch vụ|tool|phần mềm|agency/i.test(clean)
    ? 'Commercial investigation'
    : /cách|hướng dẫn|là gì|how|guide/i.test(clean)
      ? 'Informational'
      : 'Mixed informational + commercial';
  return {
    keyword: clean,
    intent,
    audience: 'Marketer, founder hoặc SEO freelancer cần quyết định nhanh hướng nội dung.',
    angle: `Biến "${clean}" thành bài viết có cấu trúc rõ, dễ skim, có checklist và CTA tự nhiên.`,
    outline: [
      `H1: ${titleCase(clean)}: Hướng dẫn thực chiến`,
      'H2: Vấn đề người đọc đang gặp',
      'H2: Search intent và kỳ vọng nội dung',
      'H2: Quy trình triển khai từng bước',
      'H2: Checklist tối ưu SEO on-page',
      'H2: Ví dụ ứng dụng trong thực tế',
      'H2: Lỗi thường gặp và cách tránh',
      'H2: Kết luận và bước tiếp theo'
    ],
    questions: [
      `${clean} phù hợp với ai?`,
      `Cần chuẩn bị gì trước khi triển khai ${clean}?`,
      `Làm sao đo hiệu quả của ${clean}?`,
      `Sai lầm nào khiến ${clean} không tạo chuyển đổi?`
    ],
    internalLinks: [
      'Trang dịch vụ chính',
      'Bài pillar cùng topic cluster',
      'Case study hoặc landing page có CTA'
    ],
    meta: generateMeta(clean)
  };
}

async function generateBrief(keyword) {
  const clean = requireText(keyword, 2, 120, 'Keyword');
  const system = [
    'Bạn là SEO strategist cho thị trường Việt Nam.',
    'Trả về JSON hợp lệ, không markdown.',
    'Schema: {"keyword": string, "intent": string, "audience": string, "angle": string, "outline": string[], "questions": string[], "internalLinks": string[], "meta": {"titles": string[], "descriptions": string[]}}.',
    'outline 8 mục, questions 4 mục, internalLinks 3 mục, meta titles 5 mục, descriptions 5 mục.',
    'Visible copy phải là tiếng Việt có dấu, cụ thể, không chung chung.'
  ].join(' ');
  const user = `Tạo content brief SEO cho keyword: ${clean}`;
  const result = await callRouterJson(system, user, () => generateBriefLocal(clean));
  return normalizeBrief(result, clean);
}

async function generateMetaAi(topic) {
  const clean = requireText(topic, 2, 160, 'Chủ đề');
  const system = [
    'Bạn là SEO copywriter.',
    'Trả về JSON hợp lệ, không markdown.',
    'Schema: {"titles": string[], "descriptions": string[]}.',
    'Tạo đúng 5 title và 5 meta description bằng tiếng Việt có dấu.',
    'Title nên dưới 70 ký tự. Description nên 130-165 ký tự.'
  ].join(' ');
  const user = `Tạo title/meta cho chủ đề: ${clean}`;
  const result = await callRouterJson(system, user, () => generateMeta(clean));
  return normalizeMeta(result, clean);
}

function normalizeMeta(value, fallbackTopic) {
  const fallback = generateMeta(fallbackTopic);
  const titles = Array.isArray(value?.titles) ? value.titles.map(String).filter(Boolean).slice(0, 5) : fallback.titles;
  const descriptions = Array.isArray(value?.descriptions) ? value.descriptions.map(String).filter(Boolean).slice(0, 5) : fallback.descriptions;
  return {
    titles: titles.length ? titles : fallback.titles,
    descriptions: descriptions.length ? descriptions : fallback.descriptions,
    aiPowered: Boolean(value?.aiPowered),
    model: value?.model || null
  };
}

function normalizeBrief(value, fallbackKeyword) {
  const fallback = generateBriefLocal(fallbackKeyword);
  return {
    keyword: String(value?.keyword || fallback.keyword),
    intent: String(value?.intent || fallback.intent),
    audience: String(value?.audience || fallback.audience),
    angle: String(value?.angle || fallback.angle),
    outline: Array.isArray(value?.outline) && value.outline.length ? value.outline.map(String).slice(0, 10) : fallback.outline,
    questions: Array.isArray(value?.questions) && value.questions.length ? value.questions.map(String).slice(0, 6) : fallback.questions,
    internalLinks: Array.isArray(value?.internalLinks) && value.internalLinks.length ? value.internalLinks.map(String).slice(0, 5) : fallback.internalLinks,
    meta: normalizeMeta(value?.meta || fallback.meta, fallbackKeyword),
    aiPowered: Boolean(value?.aiPowered),
    model: value?.model || null
  };
}

function isPrivateIp(ip) {
  if (!net.isIP(ip)) return true;
  if (ip.includes(':')) {
    return ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 169;
}

async function assertPublicUrl(rawUrl) {
  const text = requireText(rawUrl, 8, 300, 'URL');
  const url = new URL(text);
  if (!['http:', 'https:'].includes(url.protocol)) throw Object.assign(new Error('Chỉ hỗ trợ HTTP/HTTPS.'), { status: 400 });
  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.some((item) => isPrivateIp(item.address))) {
    throw Object.assign(new Error('URL này bị chặn để bảo vệ hệ thống.'), { status: 400 });
  }
  return url;
}

function textBetween(html, pattern) {
  const match = html.match(pattern);
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

async function auditUrl(rawUrl) {
  const url = await assertPublicUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'SEO Machine Trial Bot/0.1'
      }
    });
    const html = await response.text();
    const title = textBetween(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = textBetween(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i)
      || textBetween(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
    const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
    const h2Count = (html.match(/<h2[\s>]/gi) || []).length;
    const canonical = /rel=["']canonical["']/i.test(html);
    const ogTitle = /property=["']og:title["']/i.test(html);
    const wordCount = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    const checks = [
      { label: 'Title tag', ok: title.length >= 35 && title.length <= 70, detail: title || 'Thiếu title.' },
      { label: 'Meta description', ok: description.length >= 110 && description.length <= 170, detail: description || 'Thiếu meta description.' },
      { label: 'H1 duy nhất', ok: h1Count === 1, detail: `${h1Count} H1 được tìm thấy.` },
      { label: 'Heading H2', ok: h2Count >= 2, detail: `${h2Count} H2 được tìm thấy.` },
      { label: 'Canonical', ok: canonical, detail: canonical ? 'Có canonical.' : 'Thiếu canonical.' },
      { label: 'Open Graph title', ok: ogTitle, detail: ogTitle ? 'Có og:title.' : 'Thiếu og:title.' },
      { label: 'Nội dung đủ dài', ok: wordCount >= 600, detail: `Khoảng ${wordCount} từ.` }
    ];
    const score = Math.round((checks.filter((item) => item.ok).length / checks.length) * 100);
    return {
      url: url.toString(),
      status: response.status,
      score,
      summary: score >= 80 ? 'Nền tảng SEO khá ổn.' : score >= 55 ? 'Có nền tảng, cần tối ưu thêm.' : 'Cần sửa các yếu tố SEO cơ bản.',
      checks,
      nextActions: checks.filter((item) => !item.ok).slice(0, 4).map((item) => `Sửa: ${item.label} - ${item.detail}`)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function handleApi(req, res, path) {
  const session = getSession(req, res);
  if (req.method === 'GET' && path === '/api/trial/usage') {
    const state = usageFor(req, session, '');
    return json(res, 200, { limit: state.limit, used: state.record.count, remaining: state.remaining, resetAt: new Date(Date.now() + DAY_MS).toISOString() });
  }

  if (req.method === 'POST' && path === '/api/leads/request-access') {
    const payload = await readJson(req);
    const email = requireText(payload.email, 5, 160, 'Email').toLowerCase();
    const goal = requireText(payload.goal || 'Dùng thử SEO Machine', 2, 240, 'Mục tiêu');
    const store = loadStore();
    store.leads.push({ email, goal, createdAt: new Date().toISOString(), ip: ipKey(req) });
    saveStore(store);
    return json(res, 200, { ok: true, message: 'Đã mở giới hạn email trial trong phiên này.', email });
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const payload = await readJson(req);
  const email = emailFromRequest(req, payload);
  const tool = path.split('/').pop();
  const usage = consumeUsage(req, session, email, tool);
  if (!usage.ok) return json(res, 429, { error: 'Bạn đã dùng hết lượt trial hôm nay.', limit: usage.limit, remaining: usage.remaining });

  if (path === '/api/trial/meta') return json(res, 200, { usage, result: await generateMetaAi(payload.topic) });
  if (path === '/api/trial/brief') return json(res, 200, { usage, result: await generateBrief(payload.keyword) });
  if (path === '/api/trial/audit') return json(res, 200, { usage, result: await auditUrl(payload.url) });
  return json(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, pathname) {
  const filePath = pathname === '/' || pathname === '/trial' ? 'index.html' : pathname.slice(1);
  const safePath = resolve(__dirname, filePath);
  if (!safePath.startsWith(resolve(__dirname))) return json(res, 403, { error: 'Forbidden' });
  if (!existsSync(safePath)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  const type = {
    '.html': 'text/html; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8'
  }[extname(safePath)] || 'text/plain; charset=utf-8';
  res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=120' });
  res.end(readFileSync(safePath));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url.pathname);
    return serveStatic(req, res, url.pathname);
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || 'Unexpected error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SEO Machine trial listening on ${PORT}`);
});

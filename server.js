'use strict';
// ProductPulse AI - zero-dependency Node backend. Run: npm start  (no npm install needed)
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), DATA = path.join(ROOT, 'data');
try { // tiny .env loader
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
} catch (e) {}
const E = process.env, PORT = E.PORT || 3000, BANK = 'azurenest-hotel';
const BIZ = { id: 'azurenest', name: 'AzureNest Hotel', city: 'Hyderabad', type: 'Hotel' };
const log = m => console.log('[ProductPulse]', m);
const STATUSES = ['New', 'Reviewing', 'In Progress', 'Addressed', 'Monitoring', 'Resolved', 'Open', 'Improving', 'Small Signal'];
const SIM_MSG = 'Room service was much faster today. Really appreciated the improvement.';

// Detection order matters (first match wins)
const ISSUE_DEFS = [
  { key: 'menu', id: 'ISSUE-006', name: 'Menu Readability', category: 'Food', status: 'Small Signal', re: /menu/i },
  { key: 'room-service', id: 'ISSUE-001', name: 'Room-Service Delay', category: 'Service', status: 'Monitoring', re: /room service|dinner|food (delivery|arrived)|delivery/i },
  { key: 'check-in', id: 'ISSUE-002', name: 'Check-in Waiting Time', category: 'Service', status: 'Open', re: /check-?in|reception|queue|get our room/i },
  { key: 'breakfast', id: 'ISSUE-003', name: 'Breakfast Quality', category: 'Food', status: 'Improving', re: /breakfast/i },
  { key: 'staff', id: 'ISSUE-004', name: 'Staff Helpfulness', category: 'Staff', status: 'Resolved', re: /staff|helpful|friendly/i },
  { key: 'room', id: 'ISSUE-005', name: 'Room Cleanliness', category: 'Room', status: 'Monitoring', re: /clean|room was|bed|towel/i }
];
const POS = /excellent|great|helpful|friendly|beautiful|clean|faster|improv|amazing|love|appreciat|good|lovely|quick|wonderful|spotless/gi;
const NEG = /slow|late|wait|too long|too small|difficult|busy|took|needs|poor|bad|dirty|cold|rude|terrible|noisy|forever|hour|queue/gi;

// ---------- seed data ----------
function seedData() {
  const T = {
    'room-service': { neg: ['Room service took 40 minutes.', 'Dinner arrived very late.', 'Food delivery was too slow.', 'I had to wait almost an hour for room service.', 'Room service needs to be faster.', 'Had to wait forever for dinner.', 'Our room service order arrived cold and late.'], pos: ['Room service was quick this time, thank you.', 'Dinner arrived fast and hot.', 'Room service has improved a lot.'] },
    'check-in': { neg: ['Check-in queue was too long.', 'Reception was very busy.', 'We waited too long to get our room.'] },
    breakfast: { pos: ['Breakfast was excellent.', 'Breakfast spread was great, loved the fresh fruit.', 'Wonderful breakfast, very tasty.'] },
    staff: { pos: ['The staff were extremely helpful.', 'Very friendly staff at the front desk.', 'Staff went out of their way to help us.'] },
    room: { pos: ['The room was beautiful and clean.', 'Spotless room and comfortable bed.', 'Loved the clean, spacious room.'] },
    menu: { neg: ['The menu text was difficult to read.', 'The restaurant menu was too small.'] },
    other: { pos: ['The pool area was lovely and quiet.', 'Great location, close to everything.', 'Wi-Fi was fast and reliable.'] }
  };
  const spec = [], add = (k, s, ms) => ms.forEach(m => spec.push({ k, s, m }));
  const cyc = n => Array.from({ length: n }, (_, i) => i % 9 + 1);
  add('room-service', 'neg', [1,1,1,1,1,2,2,2,2,2,3,3,3,3,3]); add('room-service', 'pos', [4,4,4,4,5,5]); add('room-service', 'neg', [7,8]);
  add('check-in', 'neg', [2,3,3,4,5,5,6,7,7,8,9]);
  add('breakfast', 'pos', cyc(40)); add('staff', 'pos', cyc(45)); add('room', 'pos', cyc(35)); add('menu', 'neg', [6,8]); add('other', 'pos', cyc(28));
  const names = ['Rahul','Priya','Anita','Vikram','Sneha','Arjun','Meera','Karthik','Divya','Imran','Neha','Sanjay'], seen = {};
  const feedback = spec.map((s, i) => {
    const pool = T[s.k][s.s], n = seen[s.k + s.s] = (seen[s.k + s.s] || 0) + 1, def = ISSUE_DEFS.find(d => d.key === s.k);
    const createdAt = new Date(Date.UTC(2026, s.m - 1, 2 + (i * 11) % 26, 9 + i % 8, (i * 7) % 60)).toISOString();
    return { customer: names[i % names.length], rating: s.s === 'neg' ? 2 + i % 2 : 4 + i % 2, message: pool[(n - 1) % pool.length],
      category: def ? def.category : 'Facilities', sentiment: s.s === 'neg' ? 'Negative' : 'Positive', issue: def ? def.name : null, issueId: def ? def.id : null,
      summary: def ? `Guest ${s.s === 'neg' ? 'reported a problem with' : 'praised'} ${def.name.toLowerCase()}.` : 'General guest feedback.',
      source: 'AzureNest', businessId: BIZ.id, createdAt, status: 'Analyzed' };
  }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map((f, i) => ({ id: 'PP-' + (1001 + i), ...f }));
  const act = (n, issueId, action, status, date) => ({ id: 'ACT-' + n, businessId: BIZ.id, issueId, action, status, date: date + 'T10:00:00.000Z' });
  const actions = [
    act(1, 'ISSUE-001', 'Reviewed room-service complaints with kitchen team', 'Reviewing', '2026-02-20'),
    act(2, 'ISSUE-001', 'Changed kitchen workflow', 'Monitoring', '2026-03-12'),
    act(3, 'ISSUE-002', 'Added a second front-desk agent at peak hours', 'In Progress', '2026-04-02'),
    act(4, 'ISSUE-002', 'Piloted mobile pre-check-in', 'In Progress', '2026-06-10'),
    act(5, 'ISSUE-003', 'Introduced new breakfast menu', 'Addressed', '2026-02-05'),
    act(6, 'ISSUE-004', 'Hospitality training refresher', 'Addressed', '2026-01-25'),
    act(7, 'ISSUE-005', 'Updated housekeeping checklist', 'Monitoring', '2026-03-03'),
    act(8, 'ISSUE-006', 'Logged menu font-size review', 'New', '2026-08-15')];
  const ev = (n, type, title, text, at) => ({ id: 'MEM-' + n, type, title, text, issueId: 'ISSUE-001', at: at + 'T09:00:00.000Z' });
  const events = [
    ev(1, 'issue_detected', 'Problem detected', 'Room-service delay appears in feedback.', '2026-01-18'),
    ev(2, 'pattern_updated', 'Pattern confirmed', 'Multiple customers describe the same room-service delay.', '2026-02-16'),
    ev(3, 'pattern_updated', 'Recurring issue confirmed', 'Room-Service Delay confirmed as a recurring issue.', '2026-03-05'),
    ev(4, 'business_action', 'Business action', 'AzureNest changes kitchen workflow.', '2026-03-12'),
    ev(5, 'outcome_observed', 'Outcome signal', 'New feedback becomes more positive about room service.', '2026-04-14')];
  return { feedback, issues: ISSUE_DEFS.map(d => ({ id: d.id, key: d.key, name: d.name, category: d.category, status: d.status })), actions, memory: { events, retained: false } };
}
const FILES = { feedback: 'feedback.json', issues: 'issues.json', actions: 'actions.json', memory: 'memory.json' };
let D = {};
function load(reset) {
  fs.mkdirSync(DATA, { recursive: true }); const s = seedData();
  for (const k in FILES) { try { if (reset) throw 0; D[k] = JSON.parse(fs.readFileSync(path.join(DATA, FILES[k]), 'utf8')); } catch (e) { D[k] = s[k]; } }
  save();
}
function save() { for (const k in FILES) try { fs.writeFileSync(path.join(DATA, FILES[k]), JSON.stringify(D[k], null, 1)); } catch (e) { log('Could not save ' + k); } }

// ---------- Hindsight memory layer (retain / recall) with local fallback ----------
async function hs(suffix, body) {
  if (!E.HINDSIGHT_BASE_URL) return null;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 7000);
  try {
    const r = await fetch(E.HINDSIGHT_BASE_URL.replace(/\/$/, '') + '/v1/default/banks/' + BANK + suffix, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', ...(E.HINDSIGHT_API_KEY ? { Authorization: 'Bearer ' + E.HINDSIGHT_API_KEY } : {}) },
      body: JSON.stringify(body) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) { log('Hindsight unavailable (' + e.message + ') - using local memory'); return null; } finally { clearTimeout(t); }
}
async function retain(type, title, text, issueId, at) {
  const ev = { id: 'MEM-' + (D.memory.events.length + 1), type, title, text, issueId: issueId || null, at: at || new Date().toISOString() };
  D.memory.events.push(ev); save();
  const r = await hs('/memories', { items: [{ content: `[${type}] ${title}: ${text}`, context: BIZ.name + ' feedback story', timestamp: ev.at }] });
  return { event: ev, hindsight: !!r };
}
async function recall(query, issueId) {
  const r = await hs('/memories/recall', { query });
  const words = query.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const local = D.memory.events.map(e => ({ e, s: (issueId && e.issueId === issueId ? 3 : 0) + words.filter(w => (e.title + ' ' + e.text).toLowerCase().includes(w)).length }))
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 6).map(x => x.e).sort(byDate).map(e => ({ type: e.type, text: `${e.title}: ${e.text}`, at: e.at }));
  const remote = r && Array.isArray(r.results) ? r.results.slice(0, 5).map(x => ({ type: 'hindsight', text: x.text || x.content || JSON.stringify(x) })) : [];
  return { via: remote.length ? 'hindsight' : 'local-fallback', memories: remote.length ? remote : local };
}
async function seedHindsight() {
  if (!E.HINDSIGHT_BASE_URL || D.memory.retained) return;
  for (const e of D.memory.events) if (!(await hs('/memories', { items: [{ content: `[${e.type}] ${e.title}: ${e.text}`, context: BIZ.name + ' feedback story', timestamp: e.at }] }))) return;
  D.memory.retained = true; save(); log('Seeded Hindsight bank "' + BANK + '"');
}

// ---------- LLM (optional) + rule-based fallback ----------
async function llm(system, user) {
  if (!E.LLM_API_KEY) return null;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'x-api-key': E.LLM_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: E.LLM_MODEL || 'claude-haiku-4-5-20251001', max_tokens: 400, system, messages: [{ role: 'user', content: user }] }) });
    return (await r.json()).content[0].text;
  } catch (e) { log('LLM unavailable - using fallback analysis'); return null; }
}
function ruleAnalyze(msg, rating, cat) {
  const def = ISSUE_DEFS.find(d => d.re.test(msg)), p = (msg.match(POS) || []).length, n = (msg.match(NEG) || []).length;
  const sentiment = p > n ? 'Positive' : n > p ? 'Negative' : rating >= 4 ? 'Positive' : rating <= 2 ? 'Negative' : 'Neutral';
  const nm = def && def.name.toLowerCase();
  return { issueKey: def ? def.key : null, issue: def ? def.name : null, category: def ? def.category : (cat || 'Other'), sentiment,
    summary: def ? (sentiment === 'Negative' ? `Guest reported a problem with ${nm}.` : sentiment === 'Positive' ? `Guest gave positive feedback about ${nm}.` : `Guest mentioned ${nm}.`) : 'General guest feedback.', method: 'rules' };
}
async function analyze(msg, rating, cat) {
  const base = ruleAnalyze(msg, rating, cat);
  const t = await llm('You classify hotel guest feedback. Reply with JSON only: {"issueKey": one of ' + ISSUE_DEFS.map(d => d.key).join('|') + ' or null, "sentiment":"Positive|Neutral|Negative","category":"Service|Food|Room|Staff|Booking|Accessibility|Facilities|Other","summary":"one sentence"}', `Feedback: ${msg}\nRating: ${rating}`);
  if (!t) return E.LLM_API_KEY ? { ...base, note: 'AI analysis unavailable. Using fallback analysis.' } : base;
  try {
    const j = JSON.parse(t.replace(/```json|```/g, '').trim()), def = ISSUE_DEFS.find(d => d.key === j.issueKey);
    if (!['Positive', 'Neutral', 'Negative'].includes(j.sentiment)) throw 0;
    return { issueKey: def ? def.key : null, issue: def ? def.name : null, category: j.category || base.category, sentiment: j.sentiment, summary: String(j.summary || base.summary), method: 'llm' };
  } catch (e) { return { ...base, note: 'AI analysis unavailable. Using fallback analysis.' }; }
}

// ---------- views / insight logic ----------
const byDate = (a, b) => new Date(a.createdAt || a.date || a.at) - new Date(b.createdAt || b.date || b.at);
const issueFb = i => D.feedback.filter(f => f.issueId === i.id).sort(byDate);
const issueActs = i => D.actions.filter(a => a.issueId === i.id).sort(byDate);
function trend(i) {
  const last = issueActs(i).at(-1); if (!last) return { label: 'no-action' };
  const post = issueFb(i).filter(f => new Date(f.createdAt) > new Date(last.date)).slice(-6);
  const pos = post.filter(f => f.sentiment === 'Positive').length, neg = post.filter(f => f.sentiment === 'Negative').length;
  return { label: pos > neg ? 'improving' : neg > pos ? 'not-yet' : 'mixed', pos, neg, action: last };
}
function insightText(i, t) {
  const nm = i.name.toLowerCase();
  if (t.label === 'improving') return `Recent feedback suggests the previously reported ${nm} is improving.`;
  if (t.label === 'not-yet') return `Feedback about ${nm} is still appearing after "${t.action.action}"; evidence points toward the issue not being resolved yet.`;
  if (t.label === 'mixed') return `Recent feedback about ${nm} is mixed since "${t.action.action}"; keep monitoring.`;
  return `No business action is recorded for ${nm} yet.`;
}
function issueView(i) {
  const fb = issueFb(i), t = trend(i);
  return { ...i, mentions: fb.length, negative: fb.filter(f => f.sentiment === 'Negative').length, positive: fb.filter(f => f.sentiment === 'Positive').length,
    firstSeen: fb[0] && fb[0].createdAt, lastSeen: fb.at(-1) && fb.at(-1).createdAt, smallSignal: fb.length < 3,
    examples: fb.slice(-8).reverse().map(f => ({ id: f.id, message: f.message, sentiment: f.sentiment, createdAt: f.createdAt })),
    actions: issueActs(i), trend: t, insight: insightText(i, t) };
}
const monthYear = d => new Date(d).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

async function ingest(b) {
  const message = typeof b.message === 'string' ? b.message.trim() : '';
  if (!message) throw httpErr(400, 'Feedback message is required.');
  if (message.length > 1000) throw httpErr(400, 'Feedback message is too long (max 1000 characters).');
  const rating = Math.min(5, Math.max(1, parseInt(b.rating, 10) || 3));
  const a = await analyze(message, rating, b.category);
  const def = a.issueKey && D.issues.find(i => i.key === a.issueKey);
  const d = new Date(b.createdAt);
  const fb = { id: 'PP-' + (1001 + D.feedback.length), customer: String(b.customerName || 'Guest').slice(0, 60), rating, message, category: a.category, sentiment: a.sentiment,
    issue: def ? def.name : null, issueId: def ? def.id : null, summary: a.summary, source: b.source || 'AzureNest', businessId: b.businessId || BIZ.id,
    createdAt: isNaN(d) ? new Date().toISOString() : d.toISOString(), status: 'Analyzed' };
  D.feedback.push(fb); save();
  const r1 = await retain('feedback_received', def ? def.name : 'Feedback', `${fb.customer} (${rating}/5, ${fb.sentiment}): ${message}`, fb.issueId, fb.createdAt);
  let outcome = null, hindsight = r1.hindsight;
  if (def) {
    const v = issueView(def);
    if (fb.sentiment === 'Negative' && v.negative === 3) await retain('pattern_updated', 'Pattern confirmed', `${def.name} now has 3 negative mentions.`, def.id);
    const rec = await recall(def.name + ' ' + message, def.id), t = v.trend;
    outcome = { issueId: def.id, issue: def.name, previousMentions: v.mentions - 1, action: t.action ? t.action.action : null, actionDate: t.action ? t.action.date : null,
      recentSignal: fb.sentiment, insight: insightText(def, t), recall: rec };
    if (t.action) { const r2 = await retain('outcome_observed', 'Outcome signal', `${fb.sentiment} feedback after "${t.action.action}". ${outcome.insight}`, def.id); hindsight = hindsight && r2.hindsight; }
  }
  return { feedback: fb, analysis: a, outcome, hindsight };
}

async function ask(q) {
  q = String(q || '').trim(); if (!q) throw httpErr(400, 'Please type a question.');
  const l = q.toLowerCase(), views = D.issues.map(issueView);
  const rx = { 'room-service': /room|dinner|food|service/, 'check-in': /check|reception/, breakfast: /breakfast/, menu: /menu/, staff: /staff/ };
  const target = views.find(v => rx[v.key] && rx[v.key].test(l)) || views.find(v => v.key === 'room-service');
  const rec = await recall(q, target.id), act = target.actions.at(-1), nm = target.name.toLowerCase();
  let answer;
  if (/action|hotel take|did .*(do|take)/.test(l)) answer = act ? `AzureNest recorded "${act.action}" in ${monthYear(act.date)} (status: ${act.status}).` + (target.actions.length > 1 ? ` ${target.actions.length - 1} earlier step(s) are also logged.` : '') : `No business action has been recorded for ${nm} yet.`;
  else if (/improv|better|worse|working/.test(l)) answer = `${target.insight} Since the last action, recent feedback shows ${target.trend.pos || 0} positive and ${target.trend.neg || 0} negative signals.`;
  else if (/emerg|new signal|small|weak/.test(l)) { const s = views.filter(v => v.smallSignal); answer = s.length ? `Small signals worth watching: ${s.map(v => `${v.name} (${v.mentions} signals)`).join(', ')}. They are few, but ProductPulse keeps them in memory.` : 'No small signals are emerging right now.'; }
  else if (/common|most|top|biggest/.test(l)) answer = 'Most common problems: ' + views.filter(v => v.negative).sort((a, b) => b.negative - a.negative).slice(0, 3).map(v => `${v.name} (${v.negative} negative of ${v.mentions})`).join('; ') + '.';
  else answer = `${target.mentions > 0 ? 'Yes. ' : ''}AzureNest has ${target.mentions} related feedback items about ${nm}. First observed ${monthYear(target.firstSeen)}, most recent ${monthYear(target.lastSeen)}.` + (act ? ` The hotel recorded "${act.action}" in ${monthYear(act.date)}.` : '') + ` ${target.insight}`;
  const ctx = JSON.stringify({ issues: views.map(v => ({ name: v.name, mentions: v.mentions, negative: v.negative, status: v.status, firstSeen: v.firstSeen, lastSeen: v.lastSeen, actions: v.actions.map(a => ({ action: a.action, date: a.date })) })), memories: rec.memories });
  const t = await llm('You are ProductPulse, answering questions about a hotel\'s feedback history using only the provided context. Be concise (max 3 sentences). Never claim proven causality; say "suggests" or "indicates".', `Context: ${ctx}\nQuestion: ${q}`);
  return { answer: t || answer, usedLLM: !!t, recall: rec };
}

// ---------- routes ----------
function httpErr(status, message) { const e = new Error(message); e.status = status; return e; }
async function route(method, p, b, u) {
  let m;
  if (method === 'GET' && p === '/api/health') return { status: 'ok', service: 'ProductPulse' };
  if (method === 'GET' && p === '/api/dashboard') {
    const views = D.issues.map(issueView);
    return { metrics: { businesses: 1, feedback: D.feedback.length, recurringIssues: views.filter(v => v.mentions >= 3).length, actions: D.actions.length },
      insights: ['ISSUE-001', 'ISSUE-002', 'ISSUE-003'].map(id => views.find(v => v.id === id)),
      integrations: { hindsight: E.HINDSIGHT_BASE_URL ? 'configured' : 'local-fallback', llm: E.LLM_API_KEY ? 'configured' : 'rule-based-fallback' } };
  }
  if (method === 'GET' && p === '/api/businesses') return [{ ...BIZ, connected: true, feedbackMemories: D.feedback.length, recurringIssues: D.issues.map(issueView).filter(v => v.mentions >= 3).length }];
  if (method === 'GET' && p === '/api/feedback') return D.feedback.filter(f => !u.searchParams.get('issueId') || f.issueId === u.searchParams.get('issueId')).sort(byDate).reverse();
  if (method === 'GET' && (m = p.match(/^\/api\/feedback\/([\w-]+)$/))) { const f = D.feedback.find(x => x.id === m[1]); if (!f) throw httpErr(404, 'Feedback not found.'); return f; }
  if (method === 'POST' && p === '/api/feedback') { const r = await ingest(b); return { success: true, feedbackId: r.feedback.id, message: 'Feedback received and remembered.', analysis: r.analysis, outcome: r.outcome }; }
  if (method === 'GET' && p === '/api/azure-nest/feedback') return D.feedback.filter(f => f.source === 'AzureNest').sort(byDate).reverse();
  if (method === 'GET' && p === '/api/issues') return D.issues.map(issueView);
  if (method === 'GET' && (m = p.match(/^\/api\/issues\/([\w-]+)$/))) { const i = D.issues.find(x => x.id === m[1]); if (!i) throw httpErr(404, 'Issue not found.'); return issueView(i); }
  if (method === 'GET' && p === '/api/actions') return D.actions.slice().sort(byDate).reverse();
  if (method === 'POST' && p === '/api/actions') {
    const i = D.issues.find(x => x.id === b.issueId); if (!i) throw httpErr(400, 'Choose a valid issue.');
    const status = b.status || 'Monitoring'; if (!STATUSES.includes(status)) throw httpErr(400, 'Unknown status.');
    const action = String(b.action || '').trim().slice(0, 300) || `Status updated to ${status}`;
    const a = { id: 'ACT-' + (D.actions.length + 1), businessId: BIZ.id, issueId: i.id, action, status, date: new Date().toISOString() };
    D.actions.push(a); i.status = status; save();
    const r = await retain('business_action', i.name, `${action} (status: ${status})`, i.id);
    return { success: true, action: a, message: 'Action recorded in memory.', hindsight: r.hindsight };
  }
  if (method === 'GET' && (m = p.match(/^\/api\/memory\/([\w-]+)$/))) {
    if (m[1] !== BIZ.id) throw httpErr(404, 'Business not found.');
    const v = issueView(D.issues.find(i => i.id === 'ISSUE-001')), act = v.actions.at(-1), lastFb = D.feedback.filter(f => f.issueId === v.id).sort(byDate).at(-1);
    return { business: BIZ.name, via: E.HINDSIGHT_BASE_URL ? 'hindsight' : 'local-fallback', events: D.memory.events.slice().sort(byDate), reflection: v.insight,
      inspector: [`${v.name}`, `${v.mentions} related feedback items`, `First detected ${monthYear(v.firstSeen)}`, act ? `Action recorded ${monthYear(act.date)}: ${act.action}` : 'No action recorded yet',
        `Recent ${lastFb.sentiment.toLowerCase()} feedback`, `Current status: ${v.status}`] };
  }
  if (method === 'POST' && p === '/api/analyze') { const msg = String(b.message || '').trim(); if (!msg) throw httpErr(400, 'Message is required.'); return await analyze(msg, parseInt(b.rating, 10) || 3, b.category); }
  if (method === 'POST' && p === '/api/simulate-feedback') { const r = await ingest({ customerName: 'Demo Guest', message: SIM_MSG, rating: 5, source: 'AzureNest' }); return { success: true, ...r }; }
  if (method === 'POST' && p === '/api/ask') return { success: true, ...(await ask(b.question)) };
  if (method === 'POST' && p === '/api/reset') { load(true); return { success: true, message: 'Demo data reset.' }; }
  throw httpErr(404, 'Not found.');
}
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
function serve(p, res) {
  let base = path.join(ROOT, 'frontend'), rel = p;
  if (p.startsWith('/azurenest')) { base = path.join(ROOT, 'azurenest'); rel = p.replace('/azurenest', ''); }
  if (rel === '' || rel === '/') rel = '/index.html';
  const f = path.normalize(path.join(base, rel));
  if (!f.startsWith(base) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': (MIME[path.extname(f)] || 'text/plain') + '; charset=utf-8' }); fs.createReadStream(f).pipe(res);
}
const readBody = req => new Promise((ok, no) => { let s = ''; req.on('data', c => { s += c; if (s.length > 2e5) { no(httpErr(413, 'Request too large.')); req.destroy(); } });
  req.on('end', () => { if (!s) return ok({}); try { ok(JSON.parse(s)); } catch (e) { no(httpErr(400, 'Invalid JSON.')); } }); });
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost'), p = u.pathname;
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (!p.startsWith('/api/')) return serve(p, res);
  try {
    const out = await route(req.method, p, req.method === 'POST' ? await readBody(req) : {}, u);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out));
  } catch (e) {
    if (!e.status) log('Error: ' + e.message);
    res.writeHead(e.status || 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: e.status ? e.message : 'Something went wrong. Please try again.' }));
  }
}).listen(PORT, () => {
  load(); log(`Running at http://localhost:${PORT}  (AzureNest demo site: /azurenest/)`);
  log(E.HINDSIGHT_BASE_URL ? 'Hindsight: configured' : 'Hindsight: not configured - using built-in local memory fallback');
  seedHindsight();
});

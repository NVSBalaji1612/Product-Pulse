// ProductPulse AI - vanilla JS single-page UI (hash routing)
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const my = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '-';
const dmy = d => new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
async function api(p, body) {
  try {
    const r = await fetch('/api' + p, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await r.json();
  } catch (e) { return { success: false, message: 'Cannot reach the ProductPulse server. Is it running?' }; }
}
const ST = { Monitoring: 'amber', Open: 'red', New: 'red', Improving: 'green', Resolved: 'green', Addressed: 'green', Reviewing: 'amber', 'In Progress': 'indigo', 'Small Signal': 'cyan' };
const SENT = { Positive: 'green', Negative: 'red', Neutral: '' };
const badge = (t, c) => `<span class="badge ${c !== undefined ? c : ST[t] || ''}">${esc(t)}</span>`;
const stars = n => '\u2605'.repeat(n) + '\u2606'.repeat(5 - n);
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 4500); }
const fail = r => `<div class="card">${esc(r && r.message || 'Something went wrong.')}</div>`;

const views = {};
// ---------- Dashboard ----------
views.dashboard = async () => {
  $('#view').innerHTML = `
    <h1>Remember. Connect. Improve.</h1>
    <p class="sub">ProductPulse turns customer feedback into a continuous feedback-to-action-to-outcome loop.</p>
    <div class="flex gap-3 flex-wrap" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">
      <button class="btn pri" id="sim">Simulate New Feedback</button><button class="btn" onclick="location.hash='memory'">View Memory</button>
      <span id="integ" class="small mute" style="align-self:center"></span></div>
    <div id="demo" class="hidden" style="margin-bottom:20px"></div>
    <div id="dash"></div>
    <h2>How ProductPulse learns</h2>
    <div class="grid4">${[['Retain', 'Remember feedback and actions'], ['Recall', 'Find relevant past experiences'], ['Connect', 'Link feedback, issues and actions'], ['Reflect', 'Generate an outcome insight']].map(([a, b]) => `<div class="card"><h3>${a}</h3><span class="mute small">${b}</span></div>`).join('')}</div>
    <p class="mute" style="margin-top:22px"><b style="color:var(--ink)">ProductPulse doesn't just collect feedback. It remembers the story behind it.</b> Feedback should not end when we press Submit.</p>`;
  $('#sim').onclick = simulate; await paintDash();
};
async function paintDash() {
  const d = await api('/dashboard'); if (!d.metrics) return $('#dash').innerHTML = fail(d);
  const m = d.metrics;
  $('#integ').textContent = `Memory: ${d.integrations.hindsight === 'configured' ? 'Hindsight connected' : 'local fallback (add Hindsight keys in .env)'} \u00b7 Analysis: ${d.integrations.llm === 'configured' ? 'LLM' : 'rule-based fallback'}`;
  $('#dash').innerHTML = `<div class="grid4">${[['Connected Businesses', m.businesses], ['Feedback Remembered', m.feedback], ['Recurring Issues', m.recurringIssues], ['Tracked Actions', m.actions]].map(([l, v]) => `<div class="card metric"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
    <h2>Recent insights</h2><div class="grid3">${d.insights.map(i => `<div class="card"><h3>${esc(i.name)}</h3>
      <p class="mute" style="margin:0 0 10px">${i.positive > i.negative ? 'Recent feedback indicates positive sentiment.' : i.mentions + ' mentions'}</p>${badge(i.status)}</div>`).join('')}</div>`;
}
async function simulate() {
  const btn = $('#sim'), box = $('#demo'); btn.disabled = true; box.classList.remove('hidden');
  box.innerHTML = `<div class="card"><h3>New feedback</h3><div class="quote">"Room service was much faster today. Really appreciated the improvement."</div><ul class="steps" id="steps" style="padding:0;margin:8px 0 0"></ul></div>`;
  const req = api('/simulate-feedback', {});
  for (const s of ['Analyzing feedback...', 'Recalling business memory...', 'Finding related issue...', 'Comparing historical context...']) { $('#steps').insertAdjacentHTML('beforeend', `<li>${s}</li>`); await sleep(600); }
  const r = await req; btn.disabled = false;
  if (!r.success || !r.outcome) { box.innerHTML = fail(r); return; }
  const o = r.outcome, hs = o.recall.via === 'hindsight';
  toast('Hindsight recalled the previous room-service issue and business action.');
  box.innerHTML = `<div class="grid2">
    <div class="card"><h3>Hindsight Recall</h3><p class="small mute" style="margin:0 0 8px">Source: ${hs ? 'Hindsight' : 'local memory fallback'}</p>
      <table><tr><td class="mute">Previous issue</td><td><b>${esc(o.issue)}</b></td></tr><tr><td class="mute">Previous mentions</td><td>${o.previousMentions}</td></tr>
      <tr><td class="mute">Previous action</td><td>${esc(o.action || 'None')}${o.actionDate ? ' (' + my(o.actionDate) + ')' : ''}</td></tr>
      <tr><td class="mute">New feedback</td><td>${esc(r.feedback.sentiment)} service experience</td></tr></table>
      <details style="margin-top:8px"><summary class="small mute" style="cursor:pointer">Recalled memories (${o.recall.memories.length})</summary><ul class="small">${o.recall.memories.map(x => `<li>${esc(x.text)}</li>`).join('')}</ul></details></div>
    <div class="card ok"><h3>ProductPulse Insight</h3><div class="quote" style="border-color:var(--green);font-size:17px">${esc(o.insight)}</div>
      <p class="small mute">Stored as feedback ${esc(r.feedback.id)} and added to the memory timeline.</p></div></div>`;
  paintDash();
}
// ---------- Feedback ----------
views.feedback = async () => {
  const f = await api('/feedback'); if (!Array.isArray(f)) return $('#view').innerHTML = fail(f);
  $('#view').innerHTML = `<h1>Feedback Inbox</h1><p class="sub">${f.length} feedback items remembered from AzureNest.</p><div class="card scroll"><table>
    <tr><th>Customer</th><th>Message</th><th>Category</th><th>Issue</th><th>Sentiment</th><th>Source</th><th>Date</th><th>Status</th></tr>
    ${f.slice(0, 150).map(x => `<tr><td>${esc(x.customer)}<br><span style="color:#d97706">${stars(x.rating)}</span></td><td>${esc(x.message)}</td><td>${esc(x.category)}</td><td>${esc(x.issue || '-')}</td>
    <td>${badge(x.sentiment, SENT[x.sentiment])}</td><td>${esc(x.source)}</td><td>${dmy(x.createdAt)}</td><td>${badge(x.status, 'indigo')}</td></tr>`).join('')}</table></div>
    ${f.length > 150 ? '<p class="mute small">Showing the latest 150.</p>' : ''}`;
};
// ---------- Issues ----------
views.issues = async () => {
  const all = await api('/issues'); if (!Array.isArray(all)) return $('#view').innerHTML = fail(all);
  const rec = all.filter(i => !i.smallSignal).sort((a, b) => b.negative - a.negative), small = all.filter(i => i.smallSignal);
  const card = i => `<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><h3>${esc(i.name)}</h3>${badge(i.smallSignal ? 'Small Signal' : i.status)}</div>
    <p class="small mute" style="margin:0 0 8px">${i.mentions} ${i.smallSignal ? 'signals' : 'mentions'} \u00b7 First seen ${my(i.firstSeen)} \u00b7 Last seen ${my(i.lastSeen)}</p>
    ${i.examples.slice(0, i.smallSignal ? 5 : 4).map(e => `<div class="quote small">${esc(e.message)}</div>`).join('')}</div>`;
  $('#view').innerHTML = `<h1>Recurring Issues</h1><p class="sub">Different wording, same underlying issue. ProductPulse groups them and remembers each one.</p>
    <div class="grid2">${rec.map(card).join('')}</div><h2>Small signals</h2><p class="mute small" style="margin-top:-6px">Few mentions so far, but kept in memory in case they grow.</p><div class="grid2">${small.map(card).join('')}</div>`;
};
// ---------- Memory ----------
const TYPE = { issue_detected: ['Problem detected', ''], pattern_updated: ['Pattern update', ''], business_action: ['Business action', 'action'], outcome_observed: ['Outcome signal', 'outcome'], feedback_received: ['Feedback received', ''] };
views.memory = async () => {
  const m = await api('/memory/azurenest'); if (!m.events) return $('#view').innerHTML = fail(m);
  const ev = m.events.filter(e => e.type !== 'feedback_received' || true);
  $('#view').innerHTML = `<h1>AzureNest Memory</h1><p class="sub">The continuing story of one business. Memory source: ${m.via === 'hindsight' ? 'Hindsight' : 'local fallback'}.</p>
    <div class="grid2" style="grid-template-columns:1.6fr 1fr;align-items:start"><div class="card"><div class="tl">
    ${ev.map(e => { const t = TYPE[e.type] || [e.type, '']; return `<div class="${t[1]}"><div class="when">${my(e.at).toUpperCase()} \u00b7 ${esc(t[0])}</div><b>${esc(e.title)}</b><div class="small mute">${esc(e.text)}</div></div>`; }).join('')}
    <div class="recall"><div class="when">TODAY \u00b7 Hindsight recall</div><b>Latest feedback meets the historical issue and action</b><div class="small mute">ProductPulse connects each new feedback item with the earlier issue and business action.</div></div></div></div>
    <div class="card"><h3>\ud83e\udde0 Memory Inspector</h3><p class="small mute" style="margin:0 0 8px">Business: AzureNest Hotel</p>
      ${m.inspector.map(x => `<div style="padding:4px 0"><span style="color:var(--green)">\u2713</span> ${esc(x)}</div>`).join('')}<p class="small mute" style="margin-top:10px">${m.events.length} memory events retained.</p></div></div>
    <div class="reflect" style="margin-top:18px"><span class="small" style="color:#22d3ee">ProductPulse Reflection</span><p>"${esc(m.reflection)}"</p></div>`;
};
// ---------- Actions ----------
const STATUSES = ['New', 'Reviewing', 'In Progress', 'Addressed', 'Monitoring', 'Resolved'];
views.actions = async () => {
  const all = await api('/issues'); if (!Array.isArray(all)) return $('#view').innerHTML = fail(all);
  $('#view').innerHTML = `<h1>Business Action Center</h1><p class="sub">Record what the business did. Every action goes into the memory timeline.</p><div class="grid2">
  ${all.filter(i => !i.smallSignal || i.actions.length).map(i => { const a = i.actions.at(-1); return `<div class="card" id="c-${i.id}"><div style="display:flex;justify-content:space-between"><h3>${esc(i.name)}</h3>${badge(i.status)}</div>
    <p class="small mute" style="margin:0 0 6px">${i.mentions} mentions</p><div><b>Action:</b> ${esc(a ? a.action : 'None yet')}</div><div class="small mute">${a ? 'Date: ' + my(a.date) : ''}</div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn" data-f="${i.id}">Record Action</button><button class="btn" data-f="${i.id}">Update Status</button><button class="btn" data-h="${i.id}">View History</button></div>
    <form class="hidden" data-form="${i.id}" style="margin-top:10px;display:grid;gap:8px"><input name="action" placeholder="What did the business do? (optional for a status change)" maxlength="300">
      <select name="status">${STATUSES.map(s => `<option ${s === i.status ? 'selected' : ''}>${s}</option>`).join('')}</select><button class="btn pri" type="submit">Save to memory</button></form>
    <ul class="small hidden" data-hist="${i.id}" style="margin:10px 0 0;padding-left:18px">${i.actions.slice().reverse().map(x => `<li>${dmy(x.date)}: ${esc(x.action)} ${badge(x.status)}</li>`).join('') || '<li>No history yet.</li>'}</ul></div>`; }).join('')}</div>`;
  document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => document.querySelector(`[data-form="${b.dataset.f}"]`).classList.toggle('hidden'));
  document.querySelectorAll('[data-h]').forEach(b => b.onclick = () => document.querySelector(`[data-hist="${b.dataset.h}"]`).classList.toggle('hidden'));
  document.querySelectorAll('[data-form]').forEach(f => f.onsubmit = async e => {
    e.preventDefault(); const r = await api('/actions', { businessId: 'azurenest', issueId: f.dataset.form, action: f.action.value, status: f.status.value });
    toast(r.success ? 'Action recorded in memory.' : r.message); if (r.success) views.actions();
  });
};
// ---------- Ask ----------
views.ask = async () => {
  const qs = ['Have we seen room-service problems before?', 'What action did AzureNest take?', 'Did the issue improve?', 'What are the most common problems?', 'What new signals are emerging?', 'Show me the history of room-service complaints.'];
  $('#view').innerHTML = `<h1>Ask ProductPulse</h1><p class="sub">Ask questions about the feedback history of your connected businesses.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${qs.map(q => `<button class="chip">${esc(q)}</button>`).join('')}</div>
    <form id="af" style="display:flex;gap:8px"><input id="aq" style="flex:1" placeholder="Ask about feedback history..." maxlength="300"><button class="btn pri">Ask</button></form><div id="log"></div>`;
  const go = async q => {
    if (!q.trim()) return; const log = $('#log'); log.insertAdjacentHTML('afterbegin', `<div class="bubble a" id="pending">Recalling memory...</div><div class="bubble u">${esc(q)}</div>`);
    const r = await api('/ask', { question: q }); $('#pending').innerHTML = r.success ? `${esc(r.answer)}<div class="small mute" style="margin-top:6px">Memory: ${r.recall.via === 'hindsight' ? 'Hindsight' : 'local fallback'} \u00b7 ${r.recall.memories.length} memories recalled</div>` : esc(r.message); $('#pending').removeAttribute('id');
  };
  document.querySelectorAll('.chip').forEach(c => c.onclick = () => go(c.textContent));
  $('#af').onsubmit = e => { e.preventDefault(); const q = $('#aq').value; $('#aq').value = ''; go(q); };
};
// ---------- Businesses ----------
views.businesses = async () => {
  const b = await api('/businesses'); if (!Array.isArray(b)) return $('#view').innerHTML = fail(b);
  $('#view').innerHTML = `<h1>Connected Businesses</h1><p class="sub">Businesses that send feedback to ProductPulse.</p><div class="grid3">${b.map(x => `<div class="card"><h3>\ud83c\udfe8 ${esc(x.name)}</h3>
    <p class="mute" style="margin:0 0 10px">${esc(x.city)} \u00b7 ${esc(x.type)}</p><p style="margin:0 0 10px"><i class="dot"></i><b style="color:var(--green)">Connected</b></p>
    <div>${x.feedbackMemories} feedback memories</div><div>${x.recurringIssues} recurring issues</div>
    <div style="display:flex;gap:8px;margin-top:14px"><button class="btn" onclick="location.hash='dashboard'">Open</button><a class="btn" href="/azurenest/" target="_blank" style="text-decoration:none">AzureNest site</a></div></div>`).join('')}</div>`;
};
// ---------- router ----------
async function route() {
  const h = (location.hash || '#dashboard').slice(1), v = views[h] ? h : 'dashboard';
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + v));
  $('#view').innerHTML = '<p class="mute">Loading...</p>'; await views[v]();
}
addEventListener('hashchange', route); route();

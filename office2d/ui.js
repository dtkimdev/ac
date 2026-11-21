// HTML layer: resident card, roster.

const BKK = { timeZone: 'Asia/Bangkok' };
export const fmtDayTime = ms => new Date(ms).toLocaleString('en-GB', { ...BKK, weekday: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', '');
const fmtAgo = ms => { const m = Math.round((Date.now() - ms) / 60e3); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 2880 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const fmtIn = ms => { const m = Math.max(0, Math.round((ms - Date.now()) / 60e3)); return m < 60 ? `${m}m` : m < 2880 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.round(m / 1440)}d`; };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function ageStr(m) { if (m == null) return '?'; if (m < 60) return `${m}m`; if (m < 2880) return `${Math.round(m / 60)}h`; return `${Math.round(m / 1440)}d`; }

// last data update beside the refresh button, Bangkok, month first: 11/6, 3:00pm
const STAMP = new Intl.DateTimeFormat('en-US', { ...BKK, month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
export function renderUpdated(ms) {
  const p = {}; for (const x of STAMP.formatToParts(new Date(ms))) p[x.type] = x.value;
  const el = document.getElementById('last-update'); if (el) { el.textContent = `${p.month}/${p.day}, ${p.hour}:${p.minute}${p.dayPeriod.toLowerCase()}`; el.title = 'Last data update (Bangkok)'; }
}

export function renderRoster(S, deskOf) {
  document.getElementById('roster').innerHTML = (S.bots || []).map(b => `<li data-id="${esc(b.id)}">bot${esc(b.num)} ${esc(b.name)} — ${esc(b.status === 'moved_out' ? 'moved out' : (deskOf(b.id) || '') + ' desk')} — ${esc(b.status)}</li>`).join('');
}

const STATUS = { working: 'Working', idle: 'Idle at desk', error: 'Needs attention', moved_out: 'Moved out', away: 'Away (folder missing <24h)' };
let openId = null;
export function showCard(S, id, at, deskInfo) {
  const b = (S.bots || []).find(x => x.id === id); if (!b) return;
  openId = id;
  const el = document.getElementById('card'), d = deskInfo(id) || {};
  const rows = [
    ['Desk', d.label || (b.status === 'moved_out' ? 'moved out' : '—')], ['State', STATUS[b.status] || b.status],
    ['Usage share', b.usage_pct != null ? `${b.usage_pct.toFixed(2)}% of pool${b.usage_share != null ? ` (${Math.round(b.usage_share * 100)}% of used)` : ''}` : d.share != null ? `${Math.round(d.share * 100)}% of used` : '—'],
    ['Last active', b.last_active ? `${fmtDayTime(b.last_active)} · ${fmtAgo(b.last_active)}` : '—'],
    ['Schedule', b.schedule || '—'], ['Next run', b.next_run ? `${fmtDayTime(b.next_run)} (in ${fmtIn(b.next_run)})` : '—'],
    ['Task', b.task || (b.status === 'working' ? 'working' : '—')],
  ];
  if (b.error) rows.push(['Error', `<span class="bad">${esc(b.error)}</span>`]);
  if (b.live_name) rows.push(['Shown as', b.live_name]);
  const u = b.usage_7d || [], mx = Math.max(0.01, ...u.filter(v => v != null)), DL = 'SMTWTFS', today = new Date(Date.now() + 7 * 3600e3).getUTCDay();
  const bars = u.map((v, i) => { const wd = (today - 6 + i + 7) % 7, h = v == null ? 3 : Math.max(2, Math.round(v / mx * 26));
    return `<div title="${v == null ? 'no data' : v.toFixed(2) + '% of pool'}" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:38px"><div style="width:70%;height:${h}px;border-radius:2px;${v == null ? 'border:1px dashed rgba(255,255,255,.25)' : `background:${esc(d.accent || '#7fd')};box-shadow:0 0 6px ${esc(d.accent || '#7fd')}`}"></div><div style="font-size:9px;opacity:.6;margin-top:2px">${DL[wd]}</div></div>`; }).join('');
  const since = b.usage_since && u.some(v => v == null) ? `<div style="font-size:9px;opacity:.5">history started ${esc(new Date(b.usage_since).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Bangkok' }))}</div>` : '';
  const chart = u.length ? `<div style="margin-top:6px"><div style="font-size:10px;opacity:.7">Usage per day · 7d (% of pool)</div><div style="display:flex;gap:2px">${bars}</div>${since}</div>` : '';
  el.innerHTML = `<button class="x" aria-label="Close">×</button><h3><span class="acc" style="background:${esc(d.accent || '#ccc')}"></span>${esc(b.name)}</h3><div class="d">bot${esc(b.num)} · ${esc(b.type)} · ${esc(b.id.slice(0, 8))}</div><dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${k === 'Error' ? v : esc(v)}</dd>`).join('')}</dl>${chart}`;
  el.querySelector('.x').onclick = hideCard;
  el.style.display = 'block';
  if (at) { el.style.left = Math.min(innerWidth - 285, Math.max(10, at[0] + 14)) + 'px'; el.style.top = Math.min(innerHeight - el.offsetHeight - 10, Math.max(70, at[1] - 40)) + 'px'; }
}
export function hideCard() { document.getElementById('card').style.display = 'none'; openId = null; }
export const cardOpen = () => openId;

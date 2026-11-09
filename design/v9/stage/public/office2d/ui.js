// HTML layer: KPI glass strip, resident card, roster, clock.
import { bkkHour, timeOverride } from './time.js';

const BKK = { timeZone: 'Asia/Bangkok' };
export const fmtTime = ms => new Date(ms).toLocaleTimeString('en-GB', { ...BKK, hour: '2-digit', minute: '2-digit' });
export const fmtDayTime = ms => new Date(ms).toLocaleString('en-GB', { ...BKK, weekday: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', '');
const fmtAgo = ms => { const m = Math.round((Date.now() - ms) / 60e3); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 2880 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const fmtIn = ms => { const m = Math.max(0, Math.round((ms - Date.now()) / 60e3)); return m < 60 ? `${m}m` : m < 2880 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.round(m / 1440)}d`; };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => '$' + Math.round(v).toLocaleString('en-US');
export function ageStr(m) { if (m == null) return '?'; if (m < 60) return `${m}m`; if (m < 2880) return `${Math.round(m / 60)}h`; return `${Math.round(m / 1440)}d`; }

export function renderKpi(S) {
  if (!S) return;
  const k = S.kpi || {}, u = S.usage || {}, p = S.portfolio || {};
  const cells = [];
  if (p.available) {
    const up = p.day_change >= 0;
    // match $tonks screen: total in thousands as a whole number (251153 -> 251)
    const big = String(Math.round(p.total / 1000));
    cells.push(`<div class="k"><span class="lab">Portfolio${p.stale ? ' · <span class="bad">stale ' + esc(ageStr(p.age_min)) + '</span>' : ''}</span><span class="val">${big}<span class="sub ${up ? 'up' : 'down'}">${up ? '+' : ''}${Math.abs(p.day_change_pct).toFixed(1)}%</span></span></div>`);
  }
  cells.push(`<div class="k"><span class="lab">Residents</span><span class="val">${k.working ?? 0}/${k.total ?? 0}<span class="sub">working</span></span></div>`);
  if (u.available) {
    const cls = u.used_pct < 60 ? 'ok' : u.used_pct <= 85 ? 'amber' : 'bad';
    const proj = u.empty_by ? `<span class="bad">empty by ${esc(fmtDayTime(u.empty_by))}</span>` : u.projected_at_reset != null ? `≈${Math.round(u.projected_at_reset)}% at reset` : '';
    cells.push(`<div class="k" title="Grok weekly pool (resets Thu 20:32 Bangkok)"><span class="lab">Grok · resets ${esc(fmtDayTime(u.reset))}</span><span class="val"><span class="${cls}">${Math.round(u.used_pct)}% wk</span><span class="sub lesser">${proj}</span></span></div>`);
  }
  const cu = S.claude_usage;
  if (cu) {
    const tip = "Claude Code on David's PC (DPro) is not visible from this box; % comes from the last rate-limit reading";
    if (cu.source === 'ratelimit' && cu.week_pct != null) {
      const cls = cu.week_pct < 60 ? 'ok' : cu.week_pct <= 85 ? 'amber' : 'bad';
      const age = cu.ratelimit_ts ? Date.now() - Date.parse(cu.ratelimit_ts) : 0;
      const asOf = age > 3 * 3600e3 ? ` · as of ${esc(fmtTime(cu.ratelimit_ts))}` : '';
      cells.push(`<div class="k" title="${esc(tip)}"><span class="lab">Claude${cu.resets_at ? ' · resets ' + esc(fmtDayTime(cu.resets_at)) : ''}${asOf}</span><span class="val"><span class="${cls}">${Math.round(cu.week_pct)}% wk</span>${cu.five_hour_pct != null ? `<span class="sub lesser">5h ${Math.round(cu.five_hour_pct)}%</span>` : ''}</span></div>`);
    } else if (cu.tokens_week) {
      const n = cu.tokens_week.total_billable || 0, t = n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
      cells.push(`<div class="k" title="${esc(tip)}"><span class="lab">Claude · box only, est.</span><span class="val">~${t} tok<span class="sub lesser">this wk</span></span></div>`);
    }
  }
  if (k.next_job) cells.push(`<div class="k opt"><span class="lab">Next job</span><span class="val">${esc(fmtIn(k.next_job.at))}<span class="sub">${esc(k.next_job.name)}</span></span></div>`);
  if (k.last_activity) cells.push(`<div class="k opt"><span class="lab">Last activity</span><span class="val">${esc(fmtTime(k.last_activity.at))}<span class="sub">${esc(k.last_activity.name)}</span></span></div>`);
  cells.push(`<div class="k"><span class="lab">Errors</span><span class="val">${k.errors && k.errors.length ? `<span class="bad">${esc(k.errors.join(', '))}</span>` : '<span class="ok">none</span>'}</span></div>`);
  document.getElementById('kpi').innerHTML = cells.join('');
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

// static build only: one quiet line once the published state.json is older than 15 min
const STALE_MS = 15 * 60e3;
export function renderAsOf(ts) {
  const age = ts ? Date.now() - ts : 0;
  document.getElementById('asof').textContent = age > STALE_MS ? `Data as of ${age > 20 * 3600e3 ? fmtDayTime(ts) : fmtTime(ts)} Bangkok` : '';
}

export function clock() {
  const h = bkkHour(), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  document.getElementById('clock').textContent = `Bangkok ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${timeOverride != null ? ' (preview)' : ''}`;
}

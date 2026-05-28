/**
 * HTML templates — dark theme, mobile-first.
 */

export function html(content: string, title = 'CourtShare'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — CourtShare</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:#0d0f14;--bg2:#161920;--bg3:#1e2230;
    --border:#2a2f40;--text:#e8eaf0;--muted:#8b90a0;
    --accent:#4f7cff;--accent2:#6b5cf6;--green:#22c55e;--red:#ef4444;--yellow:#f59e0b;
    --radius:10px;--shadow:0 2px 16px rgba(0,0,0,.4);
  }
  body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
       font-size:15px;line-height:1.6;min-height:100vh}
  a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
  .wrap{max-width:640px;margin:0 auto;padding:24px 16px}
  .logo{display:flex;align-items:center;gap:10px;margin-bottom:32px}
  .logo svg{width:28px;height:28px}
  .logo span{font-size:18px;font-weight:700;letter-spacing:-.3px}
  .logo .sub{font-size:12px;color:var(--muted);margin-top:2px}
  h1{font-size:22px;font-weight:700;margin-bottom:8px}
  h2{font-size:17px;font-weight:600;margin-bottom:12px}
  p{color:var(--muted);margin-bottom:12px}
  .card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:12px}
  .card:last-child{margin-bottom:0}
  label{display:block;font-size:13px;color:var(--muted);margin-bottom:6px;font-weight:500}
  input[type=text],input[type=email],input[type=password],input[type=tel],select,textarea{
    width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;
    color:var(--text);font-size:15px;padding:10px 14px;outline:none;transition:border .15s}
  input:focus,select:focus,textarea:focus{border-color:var(--accent)}
  .fgrp{margin-bottom:16px}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;
       padding:10px 20px;border-radius:8px;font-size:15px;font-weight:600;
       cursor:pointer;border:none;transition:opacity .15s;text-decoration:none}
  .btn:hover{opacity:.85;text-decoration:none}
  .btn-primary{background:var(--accent);color:#fff;width:100%}
  .btn-secondary{background:var(--bg3);color:var(--text);border:1px solid var(--border)}
  .btn-green{background:var(--green);color:#fff;width:100%}
  .btn-sm{padding:7px 14px;font-size:13px;width:auto}
  .badge{display:inline-block;padding:3px 8px;border-radius:20px;font-size:12px;font-weight:600}
  .badge-green{background:rgba(34,197,94,.15);color:var(--green)}
  .badge-yellow{background:rgba(245,158,11,.15);color:var(--yellow)}
  .badge-blue{background:rgba(79,124,255,.15);color:var(--accent)}
  .badge-muted{background:var(--bg3);color:var(--muted)}
  .alert{padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px}
  .alert-error{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:#fca5a5}
  .alert-success{background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);color:#86efac}
  .alert-info{background:rgba(79,124,255,.12);border:1px solid rgba(79,124,255,.3);color:#93c5fd}
  .row{display:flex;gap:12px;align-items:center}
  .row-between{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
  .sport-icon{width:36px;height:36px;border-radius:8px;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
  .booking-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:10px}
  .booking-card:hover{border-color:var(--accent)}
  .booking-meta{font-size:13px;color:var(--muted);margin-top:4px}
  .players{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
  .player-chip{background:var(--bg3);border:1px solid var(--border);border-radius:20px;padding:4px 10px;font-size:12px}
  .divider{height:1px;background:var(--border);margin:20px 0}
  .share-url{background:var(--bg3);border:1px solid var(--border);border-radius:8px;
             padding:10px 14px;font-size:13px;font-family:monospace;word-break:break-all;color:var(--muted)}
  .big-date{font-size:36px;font-weight:800;letter-spacing:-1px;line-height:1}
  .big-time{font-size:24px;font-weight:600;color:var(--accent)}
  .court-hero{text-align:center;padding:28px 20px 20px;background:var(--bg2);border-radius:var(--radius);margin-bottom:20px}
  .privacy-note{font-size:12px;color:var(--muted);margin-top:8px;line-height:1.5}
  nav{display:flex;gap:4px;margin-bottom:24px}
  nav a{padding:6px 14px;border-radius:6px;font-size:14px;font-weight:500;color:var(--muted)}
  nav a.active,nav a:hover{background:var(--bg3);color:var(--text);text-decoration:none}
  .empty{text-align:center;padding:40px 16px;color:var(--muted)}
  .empty .icon{font-size:40px;margin-bottom:12px}
  @media(max-width:480px){.big-date{font-size:28px}.big-time{font-size:20px}}
</style>
</head>
<body>
${content}
</body>
</html>`;
}

function logoSvg() {
  return `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="28" height="28" rx="7" fill="#4f7cff"/>
    <circle cx="14" cy="10" r="4" fill="white"/>
    <path d="M6 22c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="white" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

export function logoBar(showNav = false, activeLink = 'dashboard') {
  return `<div class="wrap">
  <div class="logo">
    ${logoSvg()}
    <div><span>CourtShare</span><div class="sub">David Lloyd Court Invites</div></div>
  </div>
  ${showNav ? `<nav>
    <a href="/" class="${activeLink === 'dashboard' ? 'active' : ''}">My Courts</a>
    <a href="/links" class="${activeLink === 'links' ? 'active' : ''}">Share Links</a>
    <a href="/reconnect" class="${activeLink === 'reconnect' ? 'active' : ''}" style="color:var(--muted)">⚙ DL Account</a>
    <a href="/logout" style="margin-left:auto;color:var(--muted)">Sign Out</a>
  </nav>` : ''}`;
}

// ── Setup page ────────────────────────────────────────────────────────────────

export function setupPage(error?: string, reconnect = false): string {
  const action = reconnect ? '/reconnect' : '/setup';
  const title  = reconnect ? 'Reconnect DL Account' : 'Welcome to CourtShare';
  const desc   = reconnect
    ? 'Your session has expired or your DL credentials need updating. Re-enter your David Lloyd credentials to continue.'
    : 'Connect your David Lloyd account to get started. Your credentials are encrypted and stored only in your own Cloudflare Worker.';
  const btnText = reconnect ? 'Reconnect' : 'Connect DL Account';

  return html(`
  <div class="wrap">
    <div class="logo">${logoSvg()}<span style="font-size:20px;font-weight:700">CourtShare</span></div>
    ${reconnect ? `<nav><a href="/" class="">← Back to courts</a></nav>` : ''}
    <h1>${title}</h1>
    <p>${desc}</p>
    <div class="card">
      ${error ? `<div class="alert alert-error">${esc(error)}</div>` : ''}
      <form method="POST" action="${action}">
        <div class="fgrp">
          <label>David Lloyd email or phone</label>
          <input type="text" name="username" placeholder="email@example.com or +447700..." required autocomplete="username">
        </div>
        <div class="fgrp">
          <label>Password</label>
          <input type="password" name="password" required autocomplete="current-password">
        </div>
        <button type="submit" class="btn btn-primary" id="submitBtn">${btnText}</button>
      </form>
    </div>
    <p style="font-size:13px;margin-top:16px">Your credentials are encrypted with AES-256-GCM using your Worker's secret key. They are never shared with anyone.</p>
    <script>
      document.querySelector('form').addEventListener('submit', function() {
        var btn = document.getElementById('submitBtn');
        btn.disabled = true;
        btn.textContent = 'Connecting… (this takes a few seconds)';
      });
    </script>
  </div>`, title);
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface BookingCardData {
  bookingRef: string;
  encodedRef: string;
  clubId: number;
  clubName: string;
  courtName: string;
  date: string;
  startTime: string;
  duration: number;
  sportName: string;
  players: Array<{ fullName: string; isLeadPlayer: boolean }>;
  status: string;
  existingShareToken?: string;
}

export function dashboardPage(bookings: BookingCardData[], ownerName: string): string {
  const cards = bookings.length === 0
    ? `<div class="empty"><div class="icon">🎾</div><p>No upcoming court bookings found.</p><p style="font-size:13px">Book a court in the DL app first, then refresh here.</p></div>`
    : bookings.map(b => bookingCard(b)).join('');

  return html(`
  ${logoBar(true, 'dashboard')}
    <h1>My Courts</h1>
    <p>Hi ${esc(ownerName)}. Click <strong>Share</strong> on any court to create an invite link.</p>
    <div id="bookings">${cards}</div>
    <script>
      document.querySelectorAll('.share-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const card = btn.closest('.booking-card');
          const data = JSON.parse(card.dataset.booking);
          btn.disabled = true; btn.textContent = 'Creating…';
          const r = await fetch('/api/share', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
          const j = await r.json();
          if (j.url) {
            const urlEl = card.querySelector('.share-result');
            if (urlEl) { urlEl.innerHTML = shareResultHtml(j.url, j.token); urlEl.style.display='block'; }
          }
          btn.disabled = false; btn.textContent = 'Share';
        });
      });
      document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          navigator.clipboard.writeText(btn.dataset.url).then(() => { btn.textContent='Copied!'; setTimeout(()=>btn.textContent='Copy',2000); });
        });
      });
      function shareResultHtml(url, token) {
        return '<div class="share-url">'+url+'</div>'
          +'<div style="margin-top:8px;display:flex;gap:8px">'
          +'<button class="btn btn-secondary btn-sm copy-btn" data-url="'+url+'" onclick="navigator.clipboard.writeText(this.dataset.url).then(()=>{this.textContent=\\'Copied!\\';setTimeout(()=>this.textContent=\\'Copy\\',2000)})">Copy</button>'
          +'<a href="'+url+'" target="_blank" class="btn btn-secondary btn-sm">Preview</a>'
          +'</div>';
      }
    </script>
  </div>`, 'My Courts');
}

function bookingCard(b: BookingCardData): string {
  const dateStr = formatDate(b.date);
  const sportEmoji = sportEmoji_(b.sportName);
  const playerNames = b.players.map(p => p.fullName).filter(Boolean);
  const playerChips = playerNames.map(n => `<span class="player-chip">${esc(n)}</span>`).join('');

  const shareResult = b.existingShareToken
    ? `<div class="share-result" style="margin-top:12px">
        <div class="share-url" style="margin-bottom:8px">${shareUrl(b.existingShareToken)}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm copy-btn" data-url="${shareUrl(b.existingShareToken)}">Copy</button>
          <a href="${shareUrl(b.existingShareToken)}" target="_blank" class="btn btn-secondary btn-sm">Preview</a>
        </div>
       </div>`
    : `<div class="share-result" style="display:none;margin-top:12px"></div>`;

  const bookingData = JSON.stringify({
    bookingRef: b.bookingRef, encodedRef: b.encodedRef,
    clubId: b.clubId, clubName: b.clubName, courtName: b.courtName,
    date: b.date, startTime: b.startTime, duration: b.duration,
    sportName: b.sportName, existingPlayers: b.players.map(p => ({ fullName: p.fullName, isLeadPlayer: p.isLeadPlayer }))
  }).replace(/"/g, '&quot;');

  return `<div class="booking-card" data-booking="${bookingData}">
    <div class="row-between">
      <div class="row" style="gap:10px">
        <div class="sport-icon">${sportEmoji}</div>
        <div>
          <div style="font-weight:600">${esc(b.courtName || b.sportName)}</div>
          <div class="booking-meta">${esc(b.clubName)} · ${esc(b.duration)}min</div>
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:700;font-size:16px">${esc(dateStr)}</div>
        <div style="color:var(--accent);font-weight:600">${esc(b.startTime)}</div>
      </div>
    </div>
    ${playerChips ? `<div class="players">${playerChips}</div>` : ''}
    <div style="margin-top:12px">
      <button class="btn btn-secondary btn-sm share-btn">Share</button>
    </div>
    ${shareResult}
  </div>`;
}

// ── Share links page ──────────────────────────────────────────────────────────

export interface ShareLinkRow {
  token: string;
  date: string;
  start_time: string;
  sport_name: string | null;
  court_name: string | null;
  club_name: string | null;
  joinCount: number;
}

export function shareLinksPage(links: ShareLinkRow[]): string {
  const rows = links.length === 0
    ? `<div class="empty"><div class="icon">🔗</div><p>No share links yet.</p><p style="font-size:13px"><a href="/">Create one from My Courts →</a></p></div>`
    : links.map(l => `
      <div class="card">
        <div class="row-between">
          <div>
            <div style="font-weight:600">${esc(l.sport_name || 'Court')} — ${esc(formatDate(l.date))} ${esc(l.start_time)}</div>
            <div class="booking-meta">${esc(l.club_name || '')} ${l.court_name ? '· ' + esc(l.court_name) : ''}</div>
            <div class="share-url" style="margin-top:8px">${shareUrl(l.token)}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div class="badge badge-blue">${l.joinCount} joined</div>
            <div style="margin-top:8px;display:flex;gap:6px">
              <button class="btn btn-secondary btn-sm copy-btn" data-url="${shareUrl(l.token)}"
                onclick="navigator.clipboard.writeText(this.dataset.url).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',2000)})">Copy</button>
              <form method="POST" action="/links/delete" style="display:inline"
                onsubmit="return confirm('Delete this link?')">
                <input type="hidden" name="token" value="${esc(l.token)}">
                <button type="submit" class="btn btn-secondary btn-sm" style="color:var(--red)">Delete</button>
              </form>
            </div>
          </div>
        </div>
      </div>`).join('');

  return html(`
  ${logoBar(true, 'links')}
    <h1>Share Links</h1>
    <p>Active invite links for your courts.</p>
    ${rows}
  </div>`, 'Share Links');
}

// ── Public share page (no auth) ───────────────────────────────────────────────

export function sharePage(
  ownerName: string,
  date: string,
  startTime: string,
  duration: number | null,
  sportName: string | null,
  courtName: string | null,
  clubName: string | null,
  joinCount: number,
  maxPlayers: number,
  joiners: Array<{ joiner_name: string }>,
  note: string | null,
  token: string,
  error?: string,
  success?: string,
): string {
  const spotsLeft = maxPlayers - 1 - joinCount; // -1 for the owner
  const full = spotsLeft <= 0;
  const dateStr = formatDate(date);
  const emoji   = sportEmoji_(sportName || '');

  return html(`
  <div class="wrap">
    <div class="logo">${logoSvg()}<span style="font-size:18px;font-weight:700">CourtShare</span></div>

    <div class="court-hero">
      <div style="font-size:48px;margin-bottom:8px">${emoji}</div>
      <div class="big-date">${esc(dateStr)}</div>
      <div class="big-time">${esc(startTime)}${duration ? ` <span style="font-size:16px;color:var(--muted);font-weight:400">(${duration}min)</span>` : ''}</div>
      <div style="margin-top:8px;color:var(--muted)">${esc(courtName || sportName || 'Court')} · ${esc(clubName || 'David Lloyd')}</div>
      ${full
        ? `<div class="badge badge-yellow" style="margin-top:12px">Court full</div>`
        : `<div class="badge badge-green" style="margin-top:12px">${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} available</div>`
      }
    </div>

    ${note ? `<div class="card" style="background:rgba(79,124,255,.08);border-color:rgba(79,124,255,.3)"><p style="color:var(--text);margin:0">💬 ${esc(note)}</p></div>` : ''}

    <p style="margin-bottom:4px"><strong>${esc(ownerName)}</strong> is sharing their court.</p>
    ${joiners.length > 0
      ? `<p style="margin-bottom:16px">Already joined: ${joiners.map(j => `<strong>${esc(j.joiner_name)}</strong>`).join(', ')}</p>`
      : '<p style="margin-bottom:16px">Be the first to join!</p>'
    }

    ${success ? `<div class="alert alert-success">${esc(success)}</div>` : ''}
    ${error   ? `<div class="alert alert-error">${esc(error)}</div>` : ''}

    ${!full && !success ? `
    <div class="card">
      <h2>Join this court</h2>
      <p>Enter your David Lloyd credentials to add yourself to the booking. Your password is used only once to identify you — it is never stored.</p>
      <form method="POST" action="/share/${esc(token)}/join">
        <div class="fgrp">
          <label>Your DL email or phone</label>
          <input type="text" name="username" placeholder="email@example.com" required autocomplete="username">
        </div>
        <div class="fgrp">
          <label>Your DL password</label>
          <input type="password" name="password" required autocomplete="current-password">
        </div>
        <button type="submit" class="btn btn-green" id="joinBtn">Join Court</button>
        <p class="privacy-note">⚡ Your credentials are used only to identify you with David Lloyd. They are never stored or shared.</p>
      </form>
      <script>
        document.querySelector('form').addEventListener('submit', function() {
          var btn = document.getElementById('joinBtn');
          btn.disabled = true;
          btn.textContent = 'Joining… please wait';
        });
      </script>
    </div>` : ''}
  </div>`, `Join Court — ${dateStr}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00Z');
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  } catch {
    return dateStr;
  }
}

function sportEmoji_(sport: string): string {
  const s = sport.toLowerCase();
  if (s.includes('padel'))     return '🎾';
  if (s.includes('tennis'))    return '🎾';
  if (s.includes('badminton')) return '🏸';
  if (s.includes('squash'))    return '🏓';
  if (s.includes('pickleball'))return '🏓';
  if (s.includes('swim'))      return '🏊';
  return '🎾';
}

function shareUrl(token: string): string {
  // Relative — the actual host is filled in by the router
  return `/share/${token}`;
}

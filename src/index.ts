/**
 * CourtShare — Cloudflare Worker entry point.
 *
 * Single-tenant: each user deploys their own Worker named "courts".
 * URL: courts.<their-cf-username>.workers.dev
 *
 * Routes:
 *   GET  /               → dashboard (auth required)
 *   GET  /setup          → setup page (first run or logged out)
 *   POST /setup          → submit DL credentials
 *   GET  /logout         → clear session
 *   POST /api/share      → create share link
 *   GET  /links          → manage share links
 *   POST /links/delete   → delete a share link
 *   GET  /share/:token   → public share page (no auth)
 *   POST /share/:token/join → join a court
 *   GET  /api/health     → health check
 */

import type { Env } from './env';
import { validateSession, createSession, destroySession, setSessionCookie, clearSessionCookie, isSecure } from './session';
import { getConfig, setConfig, createShareLink, getShareLink, listShareLinks, deleteShareLink, recordJoin, getJoinCount, getJoiners, alreadyJoined } from './db';
import { login, getJoinerContactId } from './dl-auth';
import { getValidTokens, getUpcomingCourtBookings, addPlayerToBooking, getClub, sportName, registerDevice, getValidHmacSecret } from './dl-client';
import { generateKeyMaterial, mintHmacSecret, encrypt, decrypt, u8ToB64, b64ToU8 } from './crypto';
import { setupPage, dashboardPage, shareLinksPage, sharePage, type BookingCardData, type ShareLinkRow } from './templates';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (err) {
      console.error('Unhandled error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      return jsonError(500, `Internal error: ${msg}`);
    }
  }
};

async function route(request: Request, env: Env): Promise<Response> {
  const url    = new URL(request.url);
  const path   = url.pathname;
  const method = request.method.toUpperCase();

  // Health check — always public
  if (path === '/api/health') return json({ status: 'ok' });

  // Setup routes — always accessible (to allow first-run config)
  if (path === '/setup' && method === 'GET')  return handleSetupGet(request, env);
  if (path === '/setup' && method === 'POST') return handleSetupPost(request, env);
  if (path === '/logout' && method === 'GET') return handleLogout(request, env);

  // Public share pages — no auth
  const shareMatch = path.match(/^\/share\/([a-zA-Z0-9_-]{12,32})$/);
  if (shareMatch) {
    if (method === 'GET')  return handleShareGet(request, env, shareMatch[1]);
    if (method === 'POST') {
      // might be join — check for /join suffix
    }
  }
  const joinMatch = path.match(/^\/share\/([a-zA-Z0-9_-]{12,32})\/join$/);
  if (joinMatch && method === 'POST') return handleJoin(request, env, joinMatch[1]);

  // Auth-required routes
  const authed = await validateSession(request, env);
  if (!authed) {
    if (path.startsWith('/api/')) return jsonError(401, 'Not authenticated');
    return redirect('/setup');
  }

  if (path === '/' && method === 'GET')              return handleDashboard(request, env);
  if (path === '/links' && method === 'GET')         return handleLinks(request, env);
  if (path === '/links/delete' && method === 'POST') return handleLinkDelete(request, env);
  if (path === '/reconnect' && method === 'GET')     return handleReconnectGet(request, env);
  if (path === '/reconnect' && method === 'POST')    return handleReconnectPost(request, env);
  if (path === '/api/share' && method === 'POST')    return handleShareCreate(request, env);
  if (path === '/api/bookings' && method === 'GET')  return handleApiBookings(request, env);

  return new Response('Not found', { status: 404 });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

async function handleSetupGet(request: Request, env: Env): Promise<Response> {
  // If already configured and session valid, redirect to dashboard
  const authed = await validateSession(request, env);
  if (authed) return redirect('/');
  return htmlResp(setupPage());
}

async function handleSetupPost(request: Request, env: Env): Promise<Response> {
  let form: FormData;
  try { form = await request.formData(); } catch { return htmlResp(setupPage('Please fill in both fields.')); }
  const username = (form.get('username') as string || '').trim();
  const password = (form.get('password') as string || '').trim();

  if (!username || !password) return htmlResp(setupPage('Please fill in both fields.'));

  try {
    // Authenticate with DL
    const result = await login(username, password);

    // Generate RSA keypair + device_id for HMAC signing
    const km = await generateKeyMaterial();

    // Mint initial HMAC secret (registers the device)
    const hmacSecret = await mintHmacSecret(km);

    // Register device with DL API (required before first booking interaction)
    try {
      await registerDevice(result.access_token, hmacSecret);
    } catch (e) {
      console.warn('register-device failed (may already be registered):', e);
    }

    // Persist everything encrypted
    const tokens = {
      access_token:  result.access_token,
      refresh_token: result.refresh_token,
      expires_in:    result.expires_in,
      fetched_at:    result.fetched_at,
    };

    const kmToStore = {
      privateJwk:     km.privateJwk,
      publicSpkiB64:  km.publicSpkiB64,
      keyId:          km.keyId,
      deviceId:       km.deviceId,
    };

    const hmacToStore = {
      ...hmacSecret,
      hmacKeyB64: u8ToB64(hmacSecret.hmacKey),
      hmacKey: undefined,
    };

    await setConfig(env.DB, 'tokens_enc', await encrypt(JSON.stringify(tokens), env.APP_SECRET));
    await setConfig(env.DB, 'key_material_enc', await encrypt(JSON.stringify(kmToStore), env.APP_SECRET));
    await setConfig(env.DB, 'hmac_secret_enc', await encrypt(JSON.stringify(hmacToStore), env.APP_SECRET));
    await setConfig(env.DB, 'owner_name', `${result.first_name} ${result.last_name}`.trim());
    await setConfig(env.DB, 'owner_contact_id', result.encoded_contact_id);
    await setConfig(env.DB, 'home_club_id', String(result.home_club_id));

    // Create session
    const sessionToken = await createSession(env);
    const resp = redirect('/');
    return setSessionCookie(resp, sessionToken, isSecure(request));

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const friendly = msg.includes('status=') || msg.includes('authn') || msg.includes('401')
      ? 'Invalid David Lloyd email or password. Please try again.'
      : `Setup failed: ${msg}`;
    return htmlResp(setupPage(friendly));
  }
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  await destroySession(env);
  const resp = redirect('/setup');
  return clearSessionCookie(resp, isSecure(request));
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

async function handleDashboard(request: Request, env: Env): Promise<Response> {
  const ownerName = (await getConfig(env.DB, 'owner_name')) || 'there';

  let bookings: BookingCardData[] = [];
  try {
    const tokens = await getValidTokens(env);
    const raw    = await getUpcomingCourtBookings(tokens.access_token);
    const activeLinks = await listShareLinks(env.DB);
    const linksByRef  = new Map(activeLinks.map(l => [l.booking_ref, l.token]));

    // Get club names lazily (cache per club_id)
    const clubNameCache: Map<number, string> = new Map();
    const courtNameCache: Map<string, string> = new Map(); // key: `${clubId}:${courtId}`

    for (const b of raw) {
      const details = (b.details || {}) as Record<string, unknown>;
      const clubId  = b.siteId;
      const courtId = details.courtId as number | undefined;
      const pkgId   = details.sportsPackageId as number | undefined;

      let clubName  = clubNameCache.get(clubId) || '';
      let courtNameVal = courtId ? (courtNameCache.get(`${clubId}:${courtId}`) || '') : '';

      if (!clubName || (courtId && !courtNameVal)) {
        try {
          const club = await getClub(tokens.access_token, clubId);
          clubName = club.clubName;
          clubNameCache.set(clubId, clubName);
          for (const c of (club.courts || [])) {
            courtNameCache.set(`${clubId}:${c.courtId}`, c.courtName);
          }
          courtNameVal = courtId ? (courtNameCache.get(`${clubId}:${courtId}`) || '') : '';
        } catch {
          clubName = `Club ${clubId}`;
        }
      }

      const players = ((details.players || []) as Array<{ fullName: string; isLeadPlayer: boolean }>);

      bookings.push({
        bookingRef:         b.bookingReference,
        encodedRef:         b.encodedBookingReference,
        clubId,
        clubName,
        courtName:          courtNameVal,
        date:               b.date,
        startTime:          b.startTime,
        duration:           b.duration,
        sportName:          sportName(pkgId),
        players,
        status:             b.status,
        existingShareToken: linksByRef.get(b.bookingReference),
      });
    }
  } catch (err) {
    console.error('Dashboard fetch error:', err);
    // If tokens are invalid, redirect to setup
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('configured') || msg.includes('401')) return redirect('/setup');
  }

  return htmlResp(dashboardPage(bookings, ownerName));
}

// ── Create share link ─────────────────────────────────────────────────────────

async function handleShareCreate(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonError(400, 'Invalid JSON');
  }

  const token = generateToken();
  const link = {
    token,
    booking_ref:  String(body.bookingRef || ''),
    encoded_ref:  String(body.encodedRef || ''),
    club_id:      Number(body.clubId || 0),
    court_name:   body.courtName ? String(body.courtName) : null,
    club_name:    body.clubName  ? String(body.clubName)  : null,
    date:         String(body.date || ''),
    start_time:   String(body.startTime || ''),
    duration:     body.duration ? Number(body.duration) : null,
    sport_name:   body.sportName ? String(body.sportName) : null,
    max_players:  4,
    note:         body.note ? String(body.note) : null,
    expires_at:   body.date ? `${body.date} 23:59:59` : null,
  };

  await createShareLink(env.DB, link);

  const shareFullUrl = new URL(request.url);
  const shareHref = `${shareFullUrl.origin}/share/${token}`;

  return json({ url: shareHref, token });
}

// ── Share links management ────────────────────────────────────────────────────

async function handleLinks(request: Request, env: Env): Promise<Response> {
  const links = await listShareLinks(env.DB);
  const rows: ShareLinkRow[] = await Promise.all(
    links.map(async l => ({
      token:      l.token,
      date:       l.date,
      start_time: l.start_time,
      sport_name: l.sport_name,
      court_name: l.court_name,
      club_name:  l.club_name,
      joinCount:  await getJoinCount(env.DB, l.token),
    }))
  );
  return htmlResp(shareLinksPage(rows));
}

async function handleLinkDelete(request: Request, env: Env): Promise<Response> {
  const form  = await request.formData();
  const token = form.get('token') as string;
  if (token) await deleteShareLink(env.DB, token);
  return redirect('/links');
}

// ── Public share page ─────────────────────────────────────────────────────────

async function handleShareGet(request: Request, env: Env, token: string): Promise<Response> {
  const link = await getShareLink(env.DB, token);
  if (!link) return expiredPage();

  // Enforce expiry
  if (link.expires_at) {
    const exp = new Date(link.expires_at + 'Z');
    if (exp < new Date()) return expiredPage();
  }

  const ownerName = (await getConfig(env.DB, 'owner_name')) || 'Your host';
  const joiners   = await getJoiners(env.DB, token);
  const joinCount = joiners.length;

  const url = new URL(request.url);
  const err = url.searchParams.get('error') || undefined;
  const ok  = url.searchParams.get('success') || undefined;

  return htmlResp(sharePage(
    ownerName,
    link.date, link.start_time, link.duration,
    link.sport_name, link.court_name, link.club_name,
    joinCount, link.max_players, joiners, link.note,
    token, err, ok,
  ));
}

// ── Join flow ─────────────────────────────────────────────────────────────────

async function handleJoin(request: Request, env: Env, token: string): Promise<Response> {
  const link = await getShareLink(env.DB, token);
  if (!link) return new Response('Invite link not found.', { status: 404 });

  let form: FormData;
  try { form = await request.formData(); } catch {
    return redirect(`/share/${token}?error=${encodeURIComponent('Please enter your DL credentials.')}`);
  }
  const username = (form.get('username') as string || '').trim();
  const password = (form.get('password') as string || '').trim();

  if (!username || !password) {
    return redirect(`/share/${token}?error=${encodeURIComponent('Please enter your DL credentials.')}`);
  }

  // 1. Authenticate the joiner to get THEIR encodedContactId
  let joinerContactId: string;
  let joinerName: string;
  try {
    const result = await getJoinerContactId(username, password);
    joinerContactId = result.encodedContactId;
    joinerName      = result.fullName;
  } catch (err) {
    console.error('Joiner auth failed:', err);
    return redirect(`/share/${token}?error=${encodeURIComponent('Could not verify your David Lloyd credentials. Please check and try again.')}`);
  }

  // 2. Check if the joiner's contact ID matches the owner (you can't join your own court)
  const ownerContactId = await getConfig(env.DB, 'owner_contact_id');
  if (ownerContactId && joinerContactId === ownerContactId) {
    return redirect(`/share/${token}?error=${encodeURIComponent("That's your own booking — you're already on it!")}`);
  }

  // 3. Check if already joined
  if (await alreadyJoined(env.DB, token, joinerContactId)) {
    return redirect(`/share/${token}?error=${encodeURIComponent("You've already joined this court.")}`);
  }

  // 4. Check capacity
  const currentJoins = await getJoinCount(env.DB, token);
  if (currentJoins >= link.max_players - 1) {
    return redirect(`/share/${token}?error=${encodeURIComponent('Sorry, this court is now full.')}`);
  }

  // 5. Use the OWNER's stored tokens to add the joiner to the booking
  let ownerTokens;
  try {
    ownerTokens = await getValidTokens(env);
  } catch (err) {
    console.error('Owner token fetch failed:', err);
    return redirect(`/share/${token}?error=${encodeURIComponent('Could not access the booking. Please ask the host to reconnect their account.')}`);
  }

  // Build the full existing player list (owner + all prior joiners)
  const joiners       = await getJoiners(env.DB, token);
  const existingIds   = [
    ownerContactId || '',
    ...joiners.map(j => j.joiner_contact_id),
  ].filter(Boolean);

  try {
    await addPlayerToBooking(
      ownerTokens.access_token,
      link.club_id,
      link.encoded_ref,
      existingIds,
      joinerContactId,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('addPlayerToBooking failed:', msg);
    const friendly = msg.includes('already') ? 'You are already on this booking.'
      : msg.includes('full')                  ? 'The court is full.'
      : 'Could not add you to the booking. Please try again or contact the host.';
    return redirect(`/share/${token}?error=${encodeURIComponent(friendly)}`);
  }

  // 6. Record the join
  await recordJoin(env.DB, token, joinerName, joinerContactId);

  return redirect(`/share/${token}?success=${encodeURIComponent(`You're on the court, ${joinerName.split(' ')[0]}! See you there 🎾`)}`);
}

// ── API bookings ──────────────────────────────────────────────────────────────

async function handleApiBookings(_request: Request, env: Env): Promise<Response> {
  const tokens   = await getValidTokens(env);
  const bookings = await getUpcomingCourtBookings(tokens.access_token);
  return json({ bookings });
}

// ── Reconnect (re-enter DL credentials while logged in) ──────────────────────

async function handleReconnectGet(_request: Request, _env: Env): Promise<Response> {
  return htmlResp(setupPage(undefined, true));
}

async function handleReconnectPost(request: Request, env: Env): Promise<Response> {
  let form: FormData;
  try { form = await request.formData(); } catch { return htmlResp(setupPage('Please fill in both fields.', true)); }
  const username = (form.get('username') as string || '').trim();
  const password = (form.get('password') as string || '').trim();
  if (!username || !password) return htmlResp(setupPage('Please fill in both fields.', true));

  try {
    const result = await login(username, password);
    const km     = await generateKeyMaterial();
    const hmacSecret = await mintHmacSecret(km);
    try { await registerDevice(result.access_token, hmacSecret); } catch { /* may already be registered */ }

    const tokens = { access_token: result.access_token, refresh_token: result.refresh_token,
                     expires_in: result.expires_in, fetched_at: result.fetched_at };
    const kmToStore = { privateJwk: km.privateJwk, publicSpkiB64: km.publicSpkiB64, keyId: km.keyId, deviceId: km.deviceId };
    const hmacToStore = { ...hmacSecret, hmacKeyB64: u8ToB64(hmacSecret.hmacKey), hmacKey: undefined };

    await setConfig(env.DB, 'tokens_enc',       await encrypt(JSON.stringify(tokens), env.APP_SECRET));
    await setConfig(env.DB, 'key_material_enc',  await encrypt(JSON.stringify(kmToStore), env.APP_SECRET));
    await setConfig(env.DB, 'hmac_secret_enc',   await encrypt(JSON.stringify(hmacToStore), env.APP_SECRET));
    await setConfig(env.DB, 'owner_name',        `${result.first_name} ${result.last_name}`.trim());
    await setConfig(env.DB, 'owner_contact_id',  result.encoded_contact_id);
    await setConfig(env.DB, 'home_club_id',      String(result.home_club_id));

    return redirect('/');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const friendly = msg.includes('status=') || msg.includes('authn')
      ? 'Invalid DL credentials. Please try again.'
      : `Reconnect failed: ${msg}`;
    return htmlResp(setupPage(friendly, true));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return [...bytes].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
}

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { Location: location } });
}

function htmlResp(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonError(status: number, message: string): Response {
  return json({ error: message }, status);
}

function expiredPage(): Response {
  return htmlResp(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Link Expired</title>
<style>body{background:#0d0f14;color:#e8eaf0;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
.box{max-width:360px;padding:24px}h1{font-size:24px;margin-bottom:8px}p{color:#8b90a0}</style>
</head><body><div class="box"><div style="font-size:48px">🔗</div>
<h1>Link Expired</h1><p>This court invite link has expired or no longer exists.</p>
<p style="margin-top:16px">Ask the host to create a new share link.</p></div></body></html>`, 404);
}

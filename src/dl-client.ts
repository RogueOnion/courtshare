/**
 * DL API client — Cloudflare Workers edition.
 *
 * All calls use the owner's stored credentials.  The join flow separately
 * authenticates the joiner to get their encodedContactId, then calls
 * addPlayerToBooking() with the owner's credentials.
 */

import { HmacSecret, mintHmacSecret, signRequest, encrypt, decrypt, u8ToB64, b64ToU8 } from './crypto';
import { DL_BASE, WEBVIEW_UA, NATIVE_UA, APP_VERSION, TokenSet, refreshTokens } from './dl-auth';
import type { Env } from './env';
import { getConfig, setConfig } from './db';

// ── Webview headers ───────────────────────────────────────────────────────────

function webviewHeaders(accessToken: string, sessionId?: string): Record<string, string> {
  return {
    'User-Agent':        WEBVIEW_UA,
    'Accept':            'application/json, text/plain, */*',
    'x-auth-token':      `Bearer ${accessToken}`,
    'x-app-version':     APP_VERSION,
    'x-request-id':      crypto.randomUUID(),
    'x-session-id':      sessionId || crypto.randomUUID(),
    'origin':            'https://localhost',
    'x-requested-with':  'co.uk.davidlloyd.mobileapp',
    'Accept-Encoding':   'gzip, deflate',
    'Accept-Language':   'en-US,en;q=0.9',
  };
}

function nativeHeaders(accessToken: string, deviceId: string, sessionId?: string): Record<string, string> {
  return {
    'User-Agent':      NATIVE_UA,
    'x-auth-token':    `Bearer ${accessToken}`,
    'x-device-id':     deviceId,
    'x-request-id':    crypto.randomUUID(),
    'x-session-id':    sessionId || crypto.randomUUID(),
    'Accept-Encoding': 'gzip',
  };
}

// ── Token / HMAC secret management ──────────────────────────────────────────

export async function getValidTokens(env: Env): Promise<TokenSet> {
  const raw = await getConfig(env.DB, 'tokens_enc');
  if (!raw) throw new Error('Not configured — no tokens stored');

  const tokens: TokenSet = JSON.parse(await decrypt(raw, env.APP_SECRET));
  const age = Math.floor(Date.now() / 1000) - tokens.fetched_at;

  if (age < tokens.expires_in - 60) return tokens;

  // Refresh
  const fresh = await refreshTokens(tokens.refresh_token);
  await setConfig(env.DB, 'tokens_enc', await encrypt(JSON.stringify(fresh), env.APP_SECRET));
  return fresh;
}

export async function getValidHmacSecret(env: Env): Promise<HmacSecret> {
  const now = Math.floor(Date.now() / 1000);

  // Try cached secret
  const cachedRaw = await getConfig(env.DB, 'hmac_secret_enc');
  if (cachedRaw) {
    try {
      const cached: HmacSecret & { hmacKeyB64: string } = JSON.parse(
        await decrypt(cachedRaw, env.APP_SECRET)
      );
      if (cached.expiration - now > 60) {
        return { ...cached, hmacKey: b64ToU8(cached.hmacKeyB64) };
      }
    } catch {
      // corrupt cache — fall through to re-mint
    }
  }

  // Re-mint
  const kmRaw = await getConfig(env.DB, 'key_material_enc');
  if (!kmRaw) throw new Error('Not configured — no key material stored');
  const km = JSON.parse(await decrypt(kmRaw, env.APP_SECRET));
  const secret = await mintHmacSecret(km);

  const toStore = { ...secret, hmacKeyB64: u8ToB64(secret.hmacKey), hmacKey: undefined };
  await setConfig(env.DB, 'hmac_secret_enc', await encrypt(JSON.stringify(toStore), env.APP_SECRET));

  return secret;
}

// ── Register device (must run once per device_id before HMAC booking) ────────

export async function registerDevice(accessToken: string, secret: HmacSecret): Promise<void> {
  const body    = JSON.stringify({ isNewLogin: true });
  const signed  = await signRequest('POST', '/register-device', body, secret);
  const headers = {
    ...nativeHeaders(accessToken, secret.deviceId),
    'Content-Type': 'application/json',
    ...signed,
  };

  const resp = await fetch(`${DL_BASE}/register-device`, { method: 'POST', headers, body });
  if (!resp.ok && resp.status !== 400) {
    // 400 device_mismatch is expected on re-registration attempts; anything else is real
    throw new Error(`register-device: ${resp.status} ${await resp.text()}`);
  }
}

// ── Bookings ──────────────────────────────────────────────────────────────────

export interface Booking {
  bookingReference: string;
  encodedBookingReference: string;
  date: string;
  startTime: string;
  duration: number;
  status: string;
  type: string;
  siteId: number;
  canMemberCancel: boolean;
  details: Record<string, unknown>;
  bookedMemberEncodedContactId: string;
}

export async function getMyBookings(accessToken: string): Promise<Booking[]> {
  const resp = await fetch(
    `${DL_BASE}/members/me/bookings?include-others-i-can-book-for`,
    { headers: webviewHeaders(accessToken) }
  );
  if (!resp.ok) throw new Error(`getMyBookings: ${resp.status} ${await resp.text()}`);
  const data = await resp.json() as { bookings?: Booking[] } | Booking[];
  return Array.isArray(data) ? data : (data.bookings || []);
}

export async function getUpcomingCourtBookings(accessToken: string): Promise<Booking[]> {
  const all  = await getMyBookings(accessToken);
  const now  = new Date();
  const today = now.toISOString().slice(0, 10);

  return all
    .filter(b =>
      b.type === 'court' &&
      b.status !== 'cancelled' &&
      b.date >= today
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

export async function getClub(accessToken: string, clubId: number): Promise<{ clubName: string; courts: Array<{ courtId: number; courtName: string; sportId: number }> }> {
  const resp = await fetch(`${DL_BASE}/clubs/${clubId}`, { headers: webviewHeaders(accessToken) });
  if (!resp.ok) throw new Error(`getClub(${clubId}): ${resp.status}`);
  return resp.json() as Promise<{ clubName: string; courts: Array<{ courtId: number; courtName: string; sportId: number }> }>;
}

// ── Add player to booking (the core join operation) ─────────────────────────

/**
 * Adds newPlayerContactId to an existing court booking.
 * Uses the OWNER's access token (since it's their booking).
 * The joiner's encodedContactId comes from their own one-time DL auth.
 */
export async function addPlayerToBooking(
  accessToken:          string,
  clubId:               number,
  encodedRef:           string,
  existingPlayerIds:    string[],
  newPlayerContactId:   string,
): Promise<{ success: boolean; status: string }> {
  const allPlayers = [...new Set([...existingPlayerIds, newPlayerContactId])];
  const path = `/clubs/${clubId}/members/me/bookings/${encodedRef}/players`;
  const body = JSON.stringify({ playersEncodedContactIds: allPlayers });

  const headers = {
    ...webviewHeaders(accessToken),
    'Content-Type': 'application/json',
  };

  const resp = await fetch(`${DL_BASE}${path}?return-booking=true`, {
    method: 'PUT',
    headers,
    body,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`addPlayer: ${resp.status} ${err}`);
  }

  const booking = await resp.json() as { status: string };
  return { success: true, status: booking.status };
}

// Sport name lookup
const SPORT_NAMES: Record<number, string> = {
  13: 'Tennis',
  14: 'Badminton',
  15: 'Squash',
  16: 'Swimming',
  19: 'Padel',
  22: 'Pickleball',
};

export function sportName(sportsPackageId: number | undefined): string {
  // Package IDs map to sports by range
  if (!sportsPackageId) return 'Court';
  if (sportsPackageId === 23 || (sportsPackageId >= 1 && sportsPackageId <= 15)) return 'Tennis';
  if (sportsPackageId >= 30 && sportsPackageId <= 40) return 'Padel';
  if (sportsPackageId >= 91 && sportsPackageId <= 140) return 'Pickleball';
  if (sportsPackageId === 4 || sportsPackageId === 8) return 'Badminton';
  if (sportsPackageId === 5) return 'Squash';
  return 'Court';
}

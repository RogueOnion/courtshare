/**
 * DL Okta PKCE authentication — ported from dl_auth.py.
 *
 * Returns access_token, refresh_token, and the member's encodedContactId.
 * No state is stored here — callers persist tokens to D1.
 */

import { u8ToB64 } from './crypto';

const OKTA_AUTHN   = 'https://davidlloyd.okta.com/api/v1/authn';
const AUTHORIZE    = 'https://digitalmanager.davidlloyd.co.uk/oauth2/default/v1/authorize';
const TOKEN_URL    = 'https://digitalmanager.davidlloyd.co.uk/oauth2/default/v1/token';
const CLIENT_ID    = '0oa3n4dj2s9UuXIRt417';
const REDIRECT_URI = 'uk.co.davidlloyd.mobile-app:/login';
const SCOPES       = 'openid profile offline_access verified';
const AUTHN_UA     = 'okta-sdk-java/2.0.0 java/0 Linux/4.4.157-genymotion-ga887da7';
const OIDC_UA      = 'okta-oidc-android/30 com.okta.oidc/1.1.0';

export const DL_BASE    = 'https://mobile-app-back.davidlloyd.co.uk';
export const WEBVIEW_UA = 'Mozilla/5.0 (Linux; Android 11; Pixel 5 Build/RQ1A.210105.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/83.0.4103.120 Mobile Safari/537.36  DLL/1.0.0';
export const NATIVE_UA  = 'OneApp/150.0.3 (co.uk.davidlloyd.mobileapp; build:515117598; Android SDK 30) OkHttp/4.12.0';
export const APP_VERSION = '150.0.3';

export interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  fetched_at: number;  // unix seconds
}

export interface LoginResult extends TokenSet {
  encoded_contact_id: string;
  first_name: string;
  last_name: string;
  home_club_id: number;
}

// ── PKCE helpers ─────────────────────────────────────────────────────────────

function b64url(bytes: Uint8Array): string {
  return u8ToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function pkce(): Promise<{ verifier: string; challenge: string; nonce: string; state: string }> {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(64));
  const verifier  = b64url(verifierBytes);
  const digest    = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const challenge = b64url(digest);
  const nonce     = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const state     = b64url(crypto.getRandomValues(new Uint8Array(16)));
  return { verifier, challenge, nonce, state };
}

// ── Auth steps ────────────────────────────────────────────────────────────────

async function oktaAuthn(username: string, password: string): Promise<string> {
  const resp = await fetch(OKTA_AUTHN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': AUTHN_UA,
    },
    body: JSON.stringify({ relayState: null, password, username }),
  });

  if (!resp.ok) throw new Error(`Okta authn failed: ${resp.status} ${await resp.text()}`);
  const data = await resp.json() as { status: string; sessionToken?: string };
  if (data.status !== 'SUCCESS') throw new Error(`Okta authn status=${data.status}`);
  return data.sessionToken!;
}

async function authorize(sessionToken: string): Promise<{ code: string; verifier: string; nonce: string }> {
  const { verifier, challenge, nonce, state } = await pkce();

  const params = new URLSearchParams({
    scope:                 SCOPES,
    sessionToken,
    client_id:             CLIENT_ID,
    redirect_uri:          REDIRECT_URI,
    response_type:         'code',
    state,
    nonce,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
  });

  const resp = await fetch(`${AUTHORIZE}?${params}`, {
    method: 'GET',
    redirect: 'manual',
    headers: { 'User-Agent': OIDC_UA },
  });

  const location = resp.headers.get('location') || '';
  if (![301, 302, 303].includes(resp.status) || !location.includes('code=')) {
    throw new Error(`Authorize redirect failed: ${resp.status} location=${location}`);
  }

  const codeMatch = location.match(/[?&]code=([^&#]+)/);
  if (!codeMatch) throw new Error(`No code in location: ${location}`);
  return { code: codeMatch[1], verifier, nonce };
}

async function exchangeCode(code: string, verifier: string, nonce: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    code,
    grant_type:    'authorization_code',
    redirect_uri:  REDIRECT_URI,
    nonce,
    client_id:     CLIENT_ID,
    code_verifier: verifier,
  });

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept':       'application/json; charset=UTF-8',
      'User-Agent':   OIDC_UA,
    },
    body: body.toString(),
  });

  if (!resp.ok) throw new Error(`Token exchange failed: ${resp.status} ${await resp.text()}`);
  const data = await resp.json() as Record<string, unknown>;
  if (!data.access_token) throw new Error(`No access_token in response: ${JSON.stringify(data)}`);

  return {
    access_token:  data.access_token as string,
    refresh_token: data.refresh_token as string,
    expires_in:    (data.expires_in as number) || 3600,
    fetched_at:    Math.floor(Date.now() / 1000),
  };
}

export async function refreshTokens(refreshToken: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     CLIENT_ID,
    scope:         SCOPES,
  });

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept':       'application/json',
      'User-Agent':   OIDC_UA,
    },
    body: body.toString(),
  });

  if (!resp.ok) throw new Error(`Refresh failed: ${resp.status} ${await resp.text()}`);
  const data = await resp.json() as Record<string, unknown>;
  if (!data.access_token) throw new Error(`No access_token in refresh response`);

  return {
    access_token:  data.access_token as string,
    refresh_token: (data.refresh_token as string) || refreshToken,
    expires_in:    (data.expires_in as number) || 3600,
    fetched_at:    Math.floor(Date.now() / 1000),
  };
}

async function getMe(accessToken: string): Promise<{ encodedContactId: string; firstName: string; lastName: string; homeClubId: number }> {
  const resp = await fetch(`${DL_BASE}/members/me`, {
    headers: {
      'x-auth-token':  `Bearer ${accessToken}`,
      'User-Agent':    WEBVIEW_UA,
      'Accept':        'application/json, text/plain, */*',
      'x-app-version': APP_VERSION,
    },
  });
  if (!resp.ok) throw new Error(`GET /members/me failed: ${resp.status}`);
  return resp.json() as Promise<{ encodedContactId: string; firstName: string; lastName: string; homeClubId: number }>;
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const sessionToken           = await oktaAuthn(username, password);
  const { code, verifier, nonce } = await authorize(sessionToken);
  const tokens                 = await exchangeCode(code, verifier, nonce);
  const me                     = await getMe(tokens.access_token);

  return {
    ...tokens,
    encoded_contact_id: me.encodedContactId,
    first_name:         me.firstName,
    last_name:          me.lastName,
    home_club_id:       me.homeClubId,
  };
}

/** Quick one-time auth to get a joiner's encodedContactId — tokens are not stored. */
export async function getJoinerContactId(username: string, password: string): Promise<{ encodedContactId: string; fullName: string }> {
  const sessionToken              = await oktaAuthn(username, password);
  const { code, verifier, nonce } = await authorize(sessionToken);
  const tokens                    = await exchangeCode(code, verifier, nonce);
  const me                        = await getMe(tokens.access_token);
  return { encodedContactId: me.encodedContactId, fullName: `${me.firstName} ${me.lastName}`.trim() };
}

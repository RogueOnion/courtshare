/**
 * Session management — cookie-based, token stored in D1.
 */

import type { Env } from './env';
import { getConfig, setConfig } from './db';

const COOKIE_NAME = 'cs_session';
const SESSION_TTL = 30 * 24 * 60 * 60; // 30 days

export async function createSession(env: Env): Promise<string> {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const expiry = Math.floor(Date.now() / 1000) + SESSION_TTL;
  await setConfig(env.DB, 'session', JSON.stringify({ token, expiry }));
  return token;
}

export async function validateSession(request: Request, env: Env): Promise<boolean> {
  const cookie = getCookie(request, COOKIE_NAME);
  if (!cookie) return false;

  const raw = await getConfig(env.DB, 'session');
  if (!raw) return false;

  try {
    const { token, expiry } = JSON.parse(raw);
    return cookie === token && Math.floor(Date.now() / 1000) < expiry;
  } catch {
    return false;
  }
}

export async function destroySession(env: Env): Promise<void> {
  await setConfig(env.DB, 'session', JSON.stringify({ token: '', expiry: 0 }));
}

export function setSessionCookie(response: Response, token: string, secure: boolean): Response {
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL}${secure ? '; Secure' : ''}`
  );
  return new Response(response.body, { status: response.status, headers });
}

export function clearSessionCookie(response: Response, secure: boolean): Response {
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
  );
  return new Response(response.body, { status: response.status, headers });
}

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, v] = part.trim().split('=', 2);
    if (k === name) return v || null;
  }
  return null;
}

export function isSecure(request: Request): boolean {
  return request.url.startsWith('https://');
}

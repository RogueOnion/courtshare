# CourtShare

A Cloudflare Worker that lets you share David Lloyd court bookings with friends via a simple link. Each person deploys their own Worker — your credentials stay on your own infrastructure.

## How it works

1. **You deploy** → your Worker at `courts.<your-cf-username>.workers.dev`
2. **You log in** → connect your DL account (credentials encrypted with AES-256-GCM)
3. **You share** → click Share on any upcoming court → get a link like `courts.you.workers.dev/share/abc123`
4. **Friend joins** → they open the link, enter their own DL credentials, get added to your booking

> **Security**: Your credentials are used to make bookings from your account. A friend's credentials are used once — only to identify them (get their contact ID). Their password is never stored.

---

## Deploy in 5 minutes

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [Cloudflare account](https://dash.cloudflare.com/) (free)
- `npm install -g wrangler` then `wrangler login`

### Steps

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/courtshare.git
cd courtshare
npm install

# 2. Create D1 database
wrangler d1 create courtshare
# Copy the database_id from the output and paste it in wrangler.toml

# 3. Initialise schema
wrangler d1 execute courtshare --remote --file schema.sql

# 4. Set your encryption secret (any random string, 32+ chars)
wrangler secret put APP_SECRET
# Enter a random string like: x8K2mP9qR4vL7wN1jT5uA3eB6yC0dF2h

# 5. Deploy
wrangler deploy
# Your Worker is now live at: courts.<your-cf-username>.workers.dev
```

### First run

1. Open `https://courts.<your-cf-username>.workers.dev/setup`
2. Enter your David Lloyd email/phone and password
3. You're in — go to **My Courts** to see your upcoming bookings

---

## Usage

### Sharing a court

1. Go to **My Courts**
2. Find an upcoming court booking
3. Click **Share**
4. Copy the link and send it to whoever you want to join

### Joining a court

1. Open the share link someone sent you
2. You'll see the court details (date, time, sport, club)
3. Click **Join this court**
4. Enter your own DL email/phone + password
5. Done — you're on the booking!

### Managing share links

Go to **Share Links** to see all active links, how many people have joined, and delete links you no longer need.

### Reconnecting your DL account

If your DL password changes or you see errors fetching bookings, go to **⚙ DL Account** to reconnect.

---

## Architecture

```
Cloudflare Worker (TypeScript)
  ├─ src/index.ts       — router, request handlers
  ├─ src/crypto.ts      — RSA-OAEP + HMAC signing, AES-256-GCM encryption
  ├─ src/dl-auth.ts     — Okta PKCE login, token refresh
  ├─ src/dl-client.ts   — DL API client (bookings, players)
  ├─ src/db.ts          — D1 (SQLite) helpers
  ├─ src/session.ts     — cookie-based session
  └─ src/templates.ts   — HTML templates (dark theme)

Cloudflare D1 (SQLite)
  ├─ config             — encrypted tokens, RSA keys, owner info
  ├─ share_links        — active invite links
  └─ join_log           — who joined what
```

**Crypto details:**
- DL requires RSA-2048 OAEP (SHA-256/MGF1-SHA1) key exchange for HMAC signing
- Web Crypto API doesn't support mixed-hash OAEP, so we use BigInt modular exponentiation + manual OAEP unpadding — no external dependencies
- All stored credentials encrypted with AES-256-GCM

---

## Limitations

- Single-tenant (one DL account per Worker)
- Court bookings only (no class joining)
- The person joining needs a David Lloyd membership
- Max players enforced at app level (4 for padel, configurable)

---

## Security notes

- Credentials are encrypted at rest with `APP_SECRET` using AES-256-GCM
- The joiner's DL password is used only to authenticate against Okta and get their `encodedContactId`. It is never stored or logged.
- Session cookie is `HttpOnly; SameSite=Lax`
- Share links are scoped to a specific booking and expire on the court date

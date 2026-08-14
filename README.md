# Relaybox

Relaybox is a self-hosted temporary email client with token-protected mailboxes, real-time delivery, safe HTML rendering, local attachments, expiration, quotas, and optional SMTP replies. The interface and identity are original and contain no analytics or telemetry.

## Run locally

Requirements: Node.js 22 or newer.

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`. The API listens on `http://localhost:8787`. SQLite and attachments are created in `data/` and `storage/`; both are gitignored.

Run verification with:

```bash
npm test
npm run typecheck
npm run build
```

## Development email injection

The injection endpoint exists only when `NODE_ENV` is not `production`:

```bash
curl -X POST http://localhost:8787/api/dev/inject-email \
  -H 'Content-Type: application/json' \
  -d '{
    "to": "pixel-fox-82@mail.example.com",
    "senderName": "Example Sender",
    "senderEmail": "hello@example.org",
    "subject": "Delivery check",
    "textBody": "This is the plain-text version.",
    "htmlBody": "<h1>Hello</h1><p>HTML is sanitized on ingestion.</p>"
  }'
```

In development, an empty inbox also offers a “Send a test message” action. Attachments can be injected with `filename`, `mimeType`, and `contentBase64` fields.

## Security model

- Creating a mailbox returns a 256-bit access token once. Only its SHA-256 digest is stored by the server.
- The browser stores `{ address, token }` credentials locally. Every mailbox operation uses a Bearer token; the address alone grants nothing.
- There are no session cookies, so cross-site form requests cannot authenticate. CORS is restricted to `APP_URL`.
- Email HTML is sanitized on ingestion and again in the client, then rendered in a sandboxed iframe. Scripts, iframes, unsafe protocols, and other active content are removed.
- Remote images are replaced with inert placeholders and can be loaded explicitly. Referrers are disabled in the message frame.
- Attachments use opaque storage keys, normalized filenames, MIME restrictions, quotas, size limits, `nosniff`, and forced-download headers.
- Mailbox creation, injection, API usage, and 1:1 replies are rate-limited. The app has no bulk-send surface.
- Mailboxes and individual messages can be permanently deleted from the client after confirmation. Set `ALLOW_DELETIONS=false` on the server to disable both backend deletion handlers.
- Expired mailboxes still cascade-delete messages and remove attachment files according to their configured lifetime.

For internet-facing deployments, terminate TLS at a reverse proxy, use a real mail domain, keep `.env` private, and set `NODE_ENV=production` to remove the injection route.

## Architecture

```text
provider adapter (development / future SMTP / webhook)
  → ingestion validation and sanitization
  → recipient and expiry lookup
  → SQLite message metadata + attachment storage abstraction
  → per-mailbox SSE event
  → React inbox update
```

The repository is an npm workspace:

- `apps/web` — React, TypeScript, Vite, modern CSS, Lucide icons.
- `apps/api` — Fastify, Node SQLite, ingestion/outbound services, SSE hub, filesystem attachment adapter.
- `packages/shared` — API contracts shared by both apps.

`IngestionService` is provider-agnostic, while `AttachmentStorage` isolates filesystem operations so an S3/R2 implementation can replace local storage. The schema uses portable SQL types and deliberately avoids SQLite-specific application queries where practical, keeping a future PostgreSQL repository adapter straightforward.

## Real email delivery

The included development adapter proves the complete post-parse pipeline. To receive public mail, point your MX records at an SMTP receiver or use a cloud email worker/webhook, parse MIME in that adapter, and pass the normalized payload to `IngestionService`. Expired or unknown recipients are rejected before storage.

Replies work when `SMTP_HOST` is configured. Credentials remain server-side, the active mailbox is used as `From`, and sending is limited to one recipient per request.

## Production build

```bash
npm run build
NODE_ENV=production npm run start -w @relaybox/api
```

Serve `apps/web/dist` from static hosting and set `VITE_API_URL` at frontend build time when the API is on a different origin. Configure that frontend origin as `APP_URL` on the API.

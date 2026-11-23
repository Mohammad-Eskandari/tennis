# Deployment

## Pool-style hosting

Pool has a native Node/PostgreSQL app and a separate Sites Worker/D1/R2 deployment using polling. Baseline follows that split. No external hosting account is required for the Sites adapter.

## Native

```powershell
npm ci
npm run db:local
npm run db:migrate
npm run dev
```

Open http://127.0.0.1:3001 for frontend, APIs and Socket.IO. Local PostgreSQL is isolated on port 55432. The helper uses private bootstrap credentials and a non-superuser application role; it preserves the pool installation.

For your own PostgreSQL server, configure .env from .env.example. Production uses npm run build then npm start, NODE_ENV=production, exact HTTPS origins, TLS and WebSocket forwarding. Enable TRUST_PROXY only behind a trusted proxy. Use one Node process per database.

Create a native administrator by registering, then running npm run admin:grant -- username. Native JSON backups contain private data/hashes and must be kept private.

## Sites

```powershell
npm run db:generate:site
npm run build:site
npm run test:hosted
```

DB and BUCKET bindings are declared in .openai/hosting.json. Sites applies tracked Drizzle migrations; do not edit applied migration history. The Worker bundle embeds the actual frontend assets. Test fixtures are never runtime storage.

The Site stays owner-private unless its owner explicitly changes sharing. Other players need access granted through Sites sharing.

Sites data is separate from native PostgreSQL. Hosted avatars accept PNG/JPEG up to 1024×1024 pixels and 3 MB. AES-GCM encrypted .tennis.enc backups are versioned, validated and staged before generation switching. They are not native JSON backups.

## Administrator recovery

Sites bootstraps username admin with a strong generated runtime secret. The backup encryption key is also a runtime secret. Neither is committed.

The recovery file .runtime/sites-secrets.dpapi requires the Windows account that created it. To copy the initial administrator password privately to your clipboard:

```powershell
$protected = Get-Content -Raw .runtime/sites-secrets.dpapi
$secure = ConvertTo-SecureString $protected
$credential = [System.Net.NetworkCredential]::new('', $secure)
$recovery = $credential.Password | ConvertFrom-Json
$recovery.admin | Set-Clipboard
```

Sign in and change the password. The initial recovery password then becomes obsolete. Preserve the backup key privately; the DPAPI file alone is not portable to another Windows account. Never commit decrypted values.

## Transport and verification

Native multiplayer runs 120 Hz authority with 20 Hz Socket.IO snapshots. Sites advances persisted authority on requests and coalesces inputs around 20 Hz, with a 500 ms catch-up cap. Disconnect expiry runs on later requests. Sites is not running a persistent Socket.IO process.

Local SQL/Worker tests do not prove cloud timing, browser controls or GPU rendering. Deployment success requires an actual Sites deployment result. Cloud authentication/gameplay needs separate application verification; browser tooling is currently blocked.

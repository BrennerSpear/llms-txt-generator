## Local Development

### First-time setup

1) Install prerequisites

- Node.js 20+
- pnpm
- Docker Desktop (running)
- Supabase CLI
- Cloudflare tunnel (for webhook development)

```bash
# Install Supabase CLI
brew install supabase

# Install Cloudflare tunnel
# Option A: macOS with Homebrew
brew install cloudflare/cloudflare/cloudflared

# Option B: NPM (all platforms)
npm install -g cloudflared

# Option C: Download binary from
# https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation
```

2) Install dependencies

```bash
pnpm install
```

3) Environment variables

```bash
cp .env.example .env.local
# Edit .env.local with your values. If using Supabase local, see below.
```

4) Initialize Supabase (local stack)

```bash
supabase init
```

5) Start Supabase and capture connection info

```bash
supabase start
# Note the printed API URL, DB port (usually 54322), anon key, and service role key
```

6) Configure database URL for Prisma

- Set `DATABASE_URL` in `.env.local` to the Supabase local Postgres URL, for example:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

7) (Optional) Add Supabase vars for parity

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=PASTE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=PASTE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=PASTE_ANON_KEY
```

8) Initialize database schema

```bash
pnpm db:push
```

### Running services locally

Open separate terminals (or run in background) for each service:

1) Next.js application

```bash
pnpm dev
```

2) Inngest Dev Server

```bash
pnpm dlx inngest-cli@latest dev
# Dev UI: http://localhost:8288
```

3) Supabase local stack

```bash
# If not already running
supabase start

# Inspect connection details if needed
supabase status
```

4) Cloudflare Tunnel for webhooks

```bash
cloudflared tunnel --url localhost:3000
# Copy the generated https://xxxxx.trycloudflare.com URL
# Use this URL for Firecrawl webhook configuration
```

5) (Optional) Prisma Studio

```bash
pnpm db:studio
```

### Notes

- This project validates `DATABASE_URL` in `src/env.js`. When using Supabase locally, point it to `127.0.0.1:54322` unless you customized ports in `supabase/config.toml`.
- The script `start-database.sh` runs a plain Postgres container; prefer the Supabase stack during development so Auth/Realtime/Studio are available and environment variables align.
- To stop Supabase: `supabase stop`. To remove volumes: `supabase stop --remove`.



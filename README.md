## Principles

dev speed > cost - we can optimize cost later
buy > build - try existing services first before building from scratch (firecrawl)


## Local Development

### First-time setup

**Quick Start (macOS)**: Run `./init.sh` to automatically check and install all dependencies (Node.js 20+, pnpm, Docker, Supabase CLI, Cloudflare Tunnel), create your empty `.env` file, and install project dependencies.

**Manual Setup**: Follow the steps below for manual installation or non-macOS systems.

8) Initialize database schema

```bash
pnpm db:push
```


This creates the `artifacts` bucket needed for storing crawl results. The script is idempotent and safe to run multiple times.

### Running services locally

**Option 1: Automated Start (Recommended)**

Run `./start.sh` to automatically:
- Start Cloudflare Tunnel and extract the public URL
- Update `FIRECRAWL_WEBHOOK_URL` in `.env` with the tunnel URL
- Start Inngest Dev Server in background
- Start Next.js dev server in foreground

Press Ctrl+C to stop all services. The script handles cleanup automatically.

```bash
./start.sh
```

**Option 2: Manual Start (See All Logs)**

Run each service in separate terminals to view all logs independently:

1) Supabase local stack

```bash
# If not already running
supabase start

# Inspect
supabase status
```

2) Cloudflare Tunnel for webhooks

```bash
cloudflared tunnel --url localhost:3000
# Copy the generated https://xxxxx.trycloudflare.com URL
# Manually update FIRECRAWL_WEBHOOK_URL in .env with:
# FIRECRAWL_WEBHOOK_URL="https://xxxxx.trycloudflare.com/api/webhooks/firecrawl"
```

3) Inngest Dev Server

```bash
pnpm dlx inngest-cli@latest dev
# Dev UI: http://localhost:8288
```

4) Next.js application

```bash
pnpm dev
```

5) (Optional) Prisma Studio

```bash
pnpm db:studio
```

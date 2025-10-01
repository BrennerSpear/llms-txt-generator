#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_header() {
    echo -e "\n${BLUE}===================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}===================================${NC}\n"
}

# Track background process PIDs
CLOUDFLARED_PID=""
INNGEST_PID=""
CLEANUP_DONE=0

# Cleanup function to kill background processes
cleanup() {
    # Prevent double execution
    if [ "$CLEANUP_DONE" = "1" ]; then
        return
    fi
    CLEANUP_DONE=1

    print_header "Shutting Down"

    if [ -n "$CLOUDFLARED_PID" ]; then
        print_info "Stopping Cloudflare Tunnel (PID: $CLOUDFLARED_PID)..."
        kill $CLOUDFLARED_PID 2>/dev/null || true
    fi

    if [ -n "$INNGEST_PID" ]; then
        print_info "Stopping Inngest Dev Server (PID: $INNGEST_PID)..."
        kill $INNGEST_PID 2>/dev/null || true
    fi

    print_success "Background processes stopped"
}

# Register cleanup function for signals
trap cleanup SIGINT SIGTERM EXIT

# Check if .env exists
if [ ! -f ".env" ]; then
    print_error ".env file not found. Please run ./init.sh first."
    exit 1
fi

print_header "Checking Prerequisites"

# Check if Docker is running
print_info "Checking Docker..."
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker Desktop first."
    exit 1
fi
print_success "Docker is running"

# Check if Supabase is running
print_info "Checking Supabase..."
if ! pnpm supabase status > /dev/null 2>&1; then
    print_error "Supabase is not running. Please start Supabase first with: pnpm supabase start"
    exit 1
fi
print_success "Supabase is running"

print_header "Starting Development Environment"

# Start Cloudflare Tunnel in background
print_info "Starting Cloudflare Tunnel..."
CLOUDFLARED_LOG=$(mktemp)
cloudflared tunnel --url localhost:3000 > "$CLOUDFLARED_LOG" 2>&1 &
CLOUDFLARED_PID=$!

# Wait for tunnel URL and extract it
print_info "Waiting for tunnel URL..."
TUNNEL_URL=""
for i in {1..30}; do
    if grep -q "Your quick Tunnel has been created" "$CLOUDFLARED_LOG"; then
        TUNNEL_URL=$(grep -oE "https://[a-zA-Z0-9-]+\.trycloudflare\.com" "$CLOUDFLARED_LOG" | head -1)
        break
    fi
    sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
    print_error "Failed to get Cloudflare Tunnel URL"
    rm -f "$CLOUDFLARED_LOG"
    exit 1
fi

print_success "Cloudflare Tunnel started: $TUNNEL_URL"

# Update .env with webhook URL
WEBHOOK_URL="${TUNNEL_URL}/api/webhooks/firecrawl"
if grep -q "FIRECRAWL_WEBHOOK_URL=" .env; then
    # Update existing line
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|FIRECRAWL_WEBHOOK_URL=.*|FIRECRAWL_WEBHOOK_URL=\"${WEBHOOK_URL}\"|" .env
    else
        sed -i "s|FIRECRAWL_WEBHOOK_URL=.*|FIRECRAWL_WEBHOOK_URL=\"${WEBHOOK_URL}\"|" .env
    fi
else
    # Add new line
    echo "FIRECRAWL_WEBHOOK_URL=\"${WEBHOOK_URL}\"" >> .env
fi

print_success "Updated FIRECRAWL_WEBHOOK_URL in .env"

# Clean up temp log file
rm -f "$CLOUDFLARED_LOG"

# Start Inngest dev server in background
print_info "Starting Inngest Dev Server..."
pnpm dlx inngest-cli@latest dev --no-poll > /dev/null 2>&1 &
INNGEST_PID=$!
print_success "Inngest Dev Server started (PID: $INNGEST_PID)"

echo ""
print_header "Background Services Running"
echo -e "${GREEN}✓${NC} Cloudflare Tunnel (PID: $CLOUDFLARED_PID)"
echo -e "  URL: $TUNNEL_URL"
echo -e "  Webhook: $WEBHOOK_URL"
echo -e "${GREEN}✓${NC} Inngest Dev Server (PID: $INNGEST_PID)"
echo ""
print_info "Press Ctrl+C to stop all services"
echo ""

print_header "Starting Next.js Development Server"
echo ""

# Start Next.js dev server in foreground (with output)
pnpm dev

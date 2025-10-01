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

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_header() {
    echo -e "\n${BLUE}===================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}===================================${NC}\n"
}

# Track installation status using simple variables
INSTALL_NODE=0
INSTALL_PNPM=0
INSTALL_DOCKER=0
INSTALL_SUPABASE=0
INSTALL_CLOUDFLARED=0
NEEDS_INSTALLATION=0

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    print_error "This script is designed for macOS. Please install dependencies manually."
    exit 1
fi

print_header "Development Environment Setup"
print_info "This script will check and install the following dependencies:"
echo "  • Node.js (v18 or higher)"
echo "  • pnpm (package manager)"
echo "  • Docker (container runtime)"
echo "  • Supabase CLI"
echo "  • Cloudflare Tunnel (cloudflared)"
echo ""

# Check Node.js
print_header "Checking Node.js"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 18 ]; then
        print_success "Node.js $(node -v) is installed"
    else
        print_warning "Node.js $(node -v) is installed but version 18+ is required"
        INSTALL_NODE=1
        NEEDS_INSTALLATION=1
    fi
else
    print_warning "Node.js is not installed"
    INSTALL_NODE=1
    NEEDS_INSTALLATION=1
fi

# Check pnpm
print_header "Checking pnpm"
if command -v pnpm &> /dev/null; then
    print_success "pnpm $(pnpm -v) is installed"
else
    print_warning "pnpm is not installed"
    INSTALL_PNPM=1
    NEEDS_INSTALLATION=1
fi

# Check Docker
print_header "Checking Docker"
if command -v docker &> /dev/null; then
    print_success "Docker $(docker -v | cut -d' ' -f3 | tr -d ',') is installed"
else
    print_warning "Docker is not installed"
    INSTALL_DOCKER=1
    NEEDS_INSTALLATION=1
fi

# Check Supabase CLI
print_header "Checking Supabase CLI"
if command -v supabase &> /dev/null; then
    print_success "Supabase CLI $(supabase -v | cut -d' ' -f1) is installed"
else
    print_warning "Supabase CLI is not installed"
    INSTALL_SUPABASE=1
    NEEDS_INSTALLATION=1
fi

# Check Cloudflare Tunnel
print_header "Checking Cloudflare Tunnel"
if command -v cloudflared &> /dev/null; then
    print_success "Cloudflare Tunnel $(cloudflared -v | cut -d' ' -f3) is installed"
else
    print_warning "Cloudflare Tunnel is not installed"
    INSTALL_CLOUDFLARED=1
    NEEDS_INSTALLATION=1
fi

# Check if Homebrew is installed (needed for installations)
if [ "$NEEDS_INSTALLATION" = "1" ]; then
    print_header "Checking Homebrew"
    if ! command -v brew &> /dev/null; then
        print_info "Installing Homebrew (required for package management)..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

        # Add Homebrew to PATH for Apple Silicon Macs
        if [[ $(uname -m) == 'arm64' ]]; then
            echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
            eval "$(/opt/homebrew/bin/brew shellenv)"
        fi

        print_success "Homebrew installed"
    else
        print_success "Homebrew is already installed"
    fi
fi

# Install missing dependencies
if [ "$NEEDS_INSTALLATION" = "1" ]; then
    print_header "Installing Missing Dependencies"

    # Install Node.js
    if [ "$INSTALL_NODE" = "1" ]; then
        print_info "Installing Node.js..."
        brew install node@20
        print_success "Node.js installed"
    fi

    # Install pnpm
    if [ "$INSTALL_PNPM" = "1" ]; then
        print_info "Installing pnpm..."
        brew install pnpm
        print_success "pnpm installed"
    fi

    # Install Docker
    if [ "$INSTALL_DOCKER" = "1" ]; then
        print_info "Installing Docker Desktop..."
        brew install --cask docker
        print_success "Docker Desktop installed"
        print_warning "Please start Docker Desktop manually and run this script again"
        exit 0
    fi

    # Install Supabase CLI
    if [ "$INSTALL_SUPABASE" = "1" ]; then
        print_info "Installing Supabase CLI..."
        brew install supabase/tap/supabase
        print_success "Supabase CLI installed"
    fi

    # Install Cloudflare Tunnel
    if [ "$INSTALL_CLOUDFLARED" = "1" ]; then
        print_info "Installing Cloudflare Tunnel..."
        brew install cloudflare/cloudflare/cloudflared
        print_success "Cloudflare Tunnel installed"
    fi
else
    print_success "All dependencies are already installed"
fi

# Setup environment file
print_header "Setting Up Environment"
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        print_info "Copying .env.example to .env..."
        cp .env.example .env
        print_success ".env file created"
        print_warning "Please update .env with your configuration values"
    else
        print_warning ".env.example not found, skipping .env creation"
    fi
else
    print_success ".env file already exists"
fi

# Check if Docker is running (only if it's installed)
if command -v docker &> /dev/null; then
    print_header "Checking Docker Status"
    if docker info &> /dev/null; then
        print_success "Docker is running"
    else
        print_warning "Docker is installed but not running"
        print_info "Please start Docker Desktop and run this script again"
        exit 1
    fi
fi

# Install project dependencies
print_header "Installing Project Dependencies"
if [ -f "package.json" ]; then
    print_info "Running pnpm install..."
    pnpm install
    print_success "Project dependencies installed"
else
    print_error "package.json not found. Are you in the correct directory?"
    exit 1
fi

# Initialize Supabase storage buckets
print_header "Initializing Supabase Storage"
if [ -f "scripts/init-storage.ts" ]; then
    print_info "Creating storage buckets..."
    pnpm tsx scripts/init-storage.ts
    print_success "Storage buckets initialized"
else
    print_warning "scripts/init-storage.ts not found, skipping storage initialization"
fi

# Final summary
print_header "Setup Complete!"
print_success "All dependencies are installed and ready to use"
echo ""
print_info "Next steps:"
echo "  1. Start Supabase: supabase start (will take a while the first time)"
echo "  2. Push database schema: pnpm db:push"
echo "  3. Move onto ./start.sh or manually start the services"
echo ""
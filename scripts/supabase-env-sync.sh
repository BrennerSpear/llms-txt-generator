#!/usr/bin/env bash

# Sync selected Supabase local values into an existing .env*-style file
# - Reads `supabase status -o json`
# - Updates only the known Supabase-related keys if values are present
# - Does NOT overwrite unrelated keys
#
# Usage:
#   scripts/supabase-env-sync.sh [ENV_FILE]
#   # Default lookup order if not provided: .env.local, then .env

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
cd "$PROJECT_ROOT"

ENV_FILE="${1:-}"
if [[ -z "${ENV_FILE}" ]]; then
  if [[ -f .env.local ]]; then
    ENV_FILE=".env.local"
  elif [[ -f .env ]]; then
    ENV_FILE=".env"
  else
    # fall back to creating .env.local if nothing exists
    ENV_FILE=".env.local"
    touch "$ENV_FILE"
  fi
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "Error: supabase CLI not found. Install with: brew install supabase" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required. Install with: brew install jq" >&2
  exit 1
fi

echo "Reading Supabase local status (JSON)..."
STATUS_JSON=$(supabase status -o json)

# Extract values from flat JSON structure
DATABASE_URL=$(echo "$STATUS_JSON" | jq -r '.DB_URL // empty')
API_URL=$(echo "$STATUS_JSON" | jq -r '.API_URL // empty')
ANON_KEY=$(echo "$STATUS_JSON" | jq -r '.ANON_KEY // empty')
SERVICE_ROLE_KEY=$(echo "$STATUS_JSON" | jq -r '.SERVICE_ROLE_KEY // empty')
STORAGE_S3_URL=$(echo "$STATUS_JSON" | jq -r '.STORAGE_S3_URL // empty')
S3_ACCESS_KEY_ID=$(echo "$STATUS_JSON" | jq -r '.S3_PROTOCOL_ACCESS_KEY_ID // empty')
S3_SECRET_ACCESS_KEY=$(echo "$STATUS_JSON" | jq -r '.S3_PROTOCOL_ACCESS_KEY_SECRET // empty')
S3_REGION=$(echo "$STATUS_JSON" | jq -r '.S3_PROTOCOL_REGION // empty')
JWT_SECRET=$(echo "$STATUS_JSON" | jq -r '.JWT_SECRET // empty')
GRAPHQL_URL=$(echo "$STATUS_JSON" | jq -r '.GRAPHQL_URL // empty')
STUDIO_URL=$(echo "$STATUS_JSON" | jq -r '.STUDIO_URL // empty')
INBUCKET_URL=$(echo "$STATUS_JSON" | jq -r '.INBUCKET_URL // empty')

# Helper: update or append KEY to ENV_FILE with quoted VALUE
update_env_var() {
  local key="$1"
  local val="$2"
  [[ -z "$key" || -z "$val" ]] && return 0

  # Escape for sed replacement
  local escaped
  escaped=$(printf '%s' "$val" | sed -e 's/[\\&/]/\\&/g')

  if grep -Eq "^${key}=" "$ENV_FILE"; then
    # Replace existing line
    sed -i '' -E "s|^(${key}=).*|\1\"${escaped}\"|" "$ENV_FILE"
  else
    # Append new line
    printf '%s\n' "${key}=\"${val}\"" >> "$ENV_FILE"
  fi
}

echo "Updating $ENV_FILE with Supabase values..."

# Core Prisma URLs
update_env_var "DATABASE_URL" "$DATABASE_URL"
update_env_var "DIRECT_URL" "$DATABASE_URL"

# Supabase API + keys
update_env_var "SUPABASE_URL" "$API_URL"
update_env_var "SUPABASE_ANON_KEY" "$ANON_KEY"
update_env_var "SUPABASE_SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY"
update_env_var "NEXT_PUBLIC_SUPABASE_URL" "$API_URL"
update_env_var "NEXT_PUBLIC_SUPABASE_ANON_KEY" "$ANON_KEY"

# Additional Supabase endpoints
update_env_var "SUPABASE_GRAPHQL_URL" "$GRAPHQL_URL"
update_env_var "SUPABASE_STUDIO_URL" "$STUDIO_URL"
update_env_var "SUPABASE_INBUCKET_URL" "$INBUCKET_URL"
update_env_var "SUPABASE_JWT_SECRET" "$JWT_SECRET"

# S3-compatible storage values
update_env_var "SUPABASE_STORAGE_S3_URL" "$STORAGE_S3_URL"
update_env_var "S3_ACCESS_KEY_ID" "$S3_ACCESS_KEY_ID"
update_env_var "S3_SECRET_ACCESS_KEY" "$S3_SECRET_ACCESS_KEY"
update_env_var "S3_REGION" "$S3_REGION"

echo "Done. Updated keys in $ENV_FILE (existing unrelated keys left unchanged)."



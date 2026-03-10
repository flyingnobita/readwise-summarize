#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-flyingnobita/readwise-summarize}"
ENV_FILE="${ENV_FILE:-.env}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Error: required command not found: %s\n' "$1" >&2
    exit 1
  fi
}

prompt_secret() {
  local var_name="$1"
  local prompt_text="$2"
  local value=""

  value="$(printenv "$var_name" 2>/dev/null || true)"

  if [[ -n "$value" ]]; then
    printf 'Using %s from exported environment\n' "$var_name" >&2
    printf '%s' "$value"
    return 0
  fi

  if [[ -f "$ENV_FILE" ]]; then
    value="$(
      awk -F= -v key="$var_name" '
        $0 !~ /^[[:space:]]*#/ && $1 == key {
          sub(/^[^=]*=/, "", $0)
          print $0
          exit
        }
      ' "$ENV_FILE"
    )"
  fi

  if [[ -n "$value" ]]; then
    printf 'Using %s from %s\n' "$var_name" "$ENV_FILE" >&2
    printf '%s' "$value"
    return 0
  fi

  read -r -s -p "$prompt_text: " value
  printf '\n' >&2

  if [[ -z "$value" ]]; then
    printf 'Error: %s cannot be empty\n' "$var_name" >&2
    exit 1
  fi

  printf '%s' "$value"
}

main() {
  require_cmd gh

  if ! gh auth status >/dev/null 2>&1; then
    printf 'Error: gh is not authenticated. Run gh auth login first.\n' >&2
    exit 1
  fi

  local readwise_token
  local openrouter_token

  readwise_token="$(prompt_secret "READWISE_TOKEN" "Enter READWISE_TOKEN")"
  openrouter_token="$(prompt_secret "OPEN_ROUTER_SUMMARIZE_API" "Enter OPEN_ROUTER_SUMMARIZE_API")"

  printf '%s' "$readwise_token" | gh secret set READWISE_TOKEN --repo "$REPO"
  printf '%s' "$openrouter_token" | gh secret set OPEN_ROUTER_SUMMARIZE_API --repo "$REPO"

  printf 'Updated GitHub Actions secrets for %s\n' "$REPO"
}

main "$@"

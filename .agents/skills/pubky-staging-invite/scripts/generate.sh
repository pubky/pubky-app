#!/usr/bin/env bash
# Mints one single-use token from the Pubky staging homeserver admin API.
set -euo pipefail

readonly ADMIN_URL="https://admin.homeserver.staging.pubky.app/generate_signup_token"
readonly KEYCHAIN_SERVICE="synonym-skills.pubky-staging-invite"
readonly KEYCHAIN_ACCOUNT="admin"

credential_file() {
  local config_root

  if [[ -n "${XDG_CONFIG_HOME:-}" ]]; then
    [[ "$XDG_CONFIG_HOME" == /* ]] || {
      printf 'ERROR: XDG_CONFIG_HOME must be an absolute path\n' >&2
      return 2
    }
    config_root="$XDG_CONFIG_HOME"
  else
    config_root="${HOME:?HOME is not set}/.config"
  fi
  printf '%s\n' "${config_root}/synonym-skills/pubky-staging-invite/admin-password"
}

load_password() {
  local credential_path mode password platform

  if [[ -n "${PUBKY_STAGING_ADMIN_PASSWORD:-}" ]]; then
    printf '%s' "$PUBKY_STAGING_ADMIN_PASSWORD"
    return 0
  fi

  platform="$(uname -s)"
  case "$platform" in
    Darwin)
      if command -v security >/dev/null 2>&1; then
        password="$(security find-generic-password \
          -a "$KEYCHAIN_ACCOUNT" \
          -s "$KEYCHAIN_SERVICE" \
          -w 2>/dev/null || true)"
        if [[ -n "$password" ]]; then
          printf '%s' "$password"
          return 0
        fi
      fi
      ;;
    Linux)
      if command -v secret-tool >/dev/null 2>&1; then
        password="$(secret-tool lookup \
          application "$KEYCHAIN_SERVICE" \
          account "$KEYCHAIN_ACCOUNT" 2>/dev/null || true)"
        if [[ -n "$password" ]]; then
          printf '%s' "$password"
          return 0
        fi
      fi

      credential_path="$(credential_file)" || return $?
      if [[ -f "$credential_path" ]]; then
        mode="$(stat -c '%a' "$credential_path" 2>/dev/null || true)"
        if [[ "$mode" != "600" && "$mode" != "400" ]]; then
          printf 'ERROR: refusing credential file %s with mode %s; run chmod 600 on it\n' \
            "$credential_path" "${mode:-unknown}" >&2
          return 2
        fi
        password="$(<"$credential_path")"
        if [[ -n "$password" ]]; then
          printf '%s' "$password"
          return 0
        fi
      fi
      ;;
  esac

  return 1
}

command -v curl >/dev/null 2>&1 || {
  printf 'ERROR: curl is required to generate a Pubky staging invite\n' >&2
  exit 2
}

load_status=0
password="$(load_password)" || load_status=$?
if [[ "$load_status" -ne 0 ]]; then
  if [[ "$load_status" -eq 1 ]]; then
    printf 'ERROR: no Pubky staging admin credential is configured\n' >&2
    printf 'Resolve scripts/configure.sh against this skill directory and run it in an interactive local terminal.\n' >&2
  fi
  exit "$load_status"
fi

request_status=0
response="$(
  printf 'X-Admin-Password: %s\n' "$password" |
    curl -fsS \
      --max-time 15 \
      --header @- \
      "$ADMIN_URL"
)" || request_status=$?
unset password

if [[ "$request_status" -ne 0 ]]; then
  printf 'ERROR: the Pubky staging admin endpoint request failed; no automatic retry was attempted\n' >&2
  exit "$request_status"
fi

response="${response//$'\r'/}"
if [[ ! "$response" =~ ^[[:alnum:]]{4}-[[:alnum:]]{4}-[[:alnum:]]{4}$ ]]; then
  printf 'ERROR: the Pubky staging admin endpoint returned an unexpected response\n' >&2
  exit 4
fi

printf '%s\n' "$response"
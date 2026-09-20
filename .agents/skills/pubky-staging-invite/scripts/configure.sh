#!/usr/bin/env bash
# Saves the Pubky staging admin password outside the skill and repository.
set -euo pipefail

readonly KEYCHAIN_SERVICE="synonym-skills.pubky-staging-invite"
readonly KEYCHAIN_ACCOUNT="admin"
readonly CREDENTIAL_LABEL="Pubky staging admin password"
readonly SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
readonly SKILL_DIRECTORY="${SCRIPT_DIRECTORY%/*}"

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

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

store_in_file() {
  local destination directory password repository_root temporary

  destination="$(credential_file)" || return $?
  directory="${destination%/*}"

  umask 077
  mkdir -p "$directory"
  chmod 700 "$directory"
  directory="$(cd "$directory" && pwd -P)"
  destination="${directory}/admin-password"

  case "$destination" in
    "$SKILL_DIRECTORY" | "$SKILL_DIRECTORY"/*)
      die "refusing to store the credential inside the installed skill; set XDG_CONFIG_HOME to a user config directory"
      ;;
  esac

  command -v git >/dev/null 2>&1 || {
    die "Git is required to verify that the fallback credential path is outside a worktree"
  }
  repository_root="$(git -C "$directory" rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -n "$repository_root" ]]; then
    die "refusing to store the credential inside Git worktree ${repository_root}; set XDG_CONFIG_HOME to a user config directory"
  fi

  printf 'Linux Secret Service is unavailable; storing the password in %s with mode 0600.\n' \
    "$destination" >&2
  printf 'Pubky staging admin password: ' >&2
  IFS= read -r -s password
  printf '\n' >&2
  [[ -n "$password" ]] || die "password cannot be empty"

  temporary="$(mktemp "${directory}/.admin-password.XXXXXX")"
  trap 'rm -f "$temporary"' EXIT
  printf '%s\n' "$password" >"$temporary"
  chmod 600 "$temporary"
  mv -f "$temporary" "$destination"
  trap - EXIT
  unset password

  printf 'Saved the Pubky staging credential outside the repository.\n' >&2
}

[[ -t 0 ]] || die "run this script in an interactive local terminal so the password can be entered without echoing"

case "$(uname -s)" in
  Darwin)
    command -v security >/dev/null 2>&1 || die "macOS Keychain command 'security' is unavailable"
    printf 'Saving the Pubky staging credential in macOS Keychain.\n' >&2
    security add-generic-password \
      -U \
      -a "$KEYCHAIN_ACCOUNT" \
      -s "$KEYCHAIN_SERVICE" \
      -l "$CREDENTIAL_LABEL" \
      -w
    printf 'Saved the Pubky staging credential in macOS Keychain.\n' >&2
    ;;
  Linux)
    if command -v secret-tool >/dev/null 2>&1; then
      printf 'Saving the Pubky staging credential in Linux Secret Service.\n' >&2
      if secret-tool store \
        --label="$CREDENTIAL_LABEL" \
        application "$KEYCHAIN_SERVICE" \
        account "$KEYCHAIN_ACCOUNT"; then
        printf 'Saved the Pubky staging credential in Linux Secret Service.\n' >&2
        exit 0
      fi
      printf 'Linux Secret Service could not save the credential; using the local fallback.\n' >&2
    fi
    store_in_file
    ;;
  *)
    die "unsupported operating system; set PUBKY_STAGING_ADMIN_PASSWORD in the process environment instead"
    ;;
esac
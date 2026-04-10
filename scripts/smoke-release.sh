#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR=${0:A:h:h}
cd "$ROOT_DIR"

pnpm build
pnpm typecheck
pnpm test

TMP_DIR=$(mktemp -d /tmp/agenttasks-release-XXXXXX)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Packing release tarballs"
(cd "$ROOT_DIR/packages/core" && pnpm pack --pack-destination "$TMP_DIR" >/dev/null)
(cd "$ROOT_DIR/packages/cli" && pnpm pack --pack-destination "$TMP_DIR" >/dev/null)

core_tgz=("$TMP_DIR"/agenttasks-core-*.tgz)
cli_tgz=("$TMP_DIR"/agenttasks-[0-9]*.tgz)

if [[ ${#core_tgz[@]} -ne 1 || ${#cli_tgz[@]} -ne 1 ]]; then
  echo "expected exactly one packed tarball for core and cli"
  exit 1
fi

for archive in "$core_tgz[1]" "$cli_tgz[1]"; do
  if tar -tf "$archive" | rg -q '^package/(src/|test/|\.turbo/)'; then
    echo "unexpected development files in $archive"
    exit 1
  fi
done

INSTALL_DIR="$TMP_DIR/install"
mkdir -p "$INSTALL_DIR"
printf '{"name":"agenttasks-release-smoke","private":true}\n' > "$INSTALL_DIR/package.json"

echo "Installing packed tarballs"
(
  cd "$INSTALL_DIR"
  npm_config_cache="$TMP_DIR/.npm-cache" npm install "$core_tgz[1]" "$cli_tgz[1]" >/dev/null
)

CLI_ENTRY="$INSTALL_DIR/node_modules/agenttasks/dist/index.js"
SMOKE_ROOT="$INSTALL_DIR/workspace"
mkdir -p "$SMOKE_ROOT"

echo "Running installed CLI smoke"
help_output=$(cd "$SMOKE_ROOT" && node "$CLI_ENTRY" --help)
print -r -- "$help_output" | rg -q 'agenttasks'

init_output=$(cd "$SMOKE_ROOT" && node "$CLI_ENTRY" init --name "Smoke Release Test")
print -r -- "$init_output" | rg -q 'Initialized \.agent-tasks/'

validate_output=$(cd "$SMOKE_ROOT" && node "$CLI_ENTRY" validate)
print -r -- "$validate_output" | rg -q 'Validation OK|WARN|ERROR'

ready_output=$(cd "$SMOKE_ROOT" && node "$CLI_ENTRY" ready)
print -r -- "$ready_output" | rg -q 'No tickets are ready|T-[0-9]+'

plan_output=$(cd "$SMOKE_ROOT" && node "$CLI_ENTRY" plan)
print -r -- "$plan_output" | rg -q 'Ready Now|No tickets'

mkdir -p "$TMP_DIR/empty-bin"
node_bin=$(command -v node)
tui_output=$(cd "$SMOKE_ROOT" && PATH="$TMP_DIR/empty-bin" "$node_bin" "$CLI_ENTRY" tui 2>&1 || true)
print -r -- "$tui_output" | rg -q 'requires Bun'

echo "Release smoke OK"

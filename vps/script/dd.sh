#!/bin/bash

# 兼容入口：转发到 dd/main.sh（内部再调用 bin456789/reinstall）

set -uo pipefail

DD_MAIN_URL="${DD_MAIN_URL:-https://cdn.jsdelivr.net/gh/kuusei/kuusei-script@main/vps/script/dd/main.sh}"

if [[ -n "${BASH_SOURCE[0]:-}" && -e "${BASH_SOURCE[0]}" ]]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
  if [[ -n "$script_dir" && -f "$script_dir/dd/main.sh" ]]; then
    exec bash "$script_dir/dd/main.sh" "$@"
  fi
fi

exec bash <(curl -fsSL -H 'Cache-Control: no-cache' "$DD_MAIN_URL") "$@"

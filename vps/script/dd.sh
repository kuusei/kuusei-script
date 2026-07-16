#!/bin/bash

# 兼容入口：转发到拆分后的 dd/main.sh
# 推荐直接调用:
#   bash <(curl -fsSL .../vps/script/dd/main.sh) -u 26.04 ...

set -uo pipefail

DD_MAIN_URL="${DD_MAIN_URL:-https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/script/dd/main.sh}"

if [[ -n "${BASH_SOURCE[0]:-}" && -e "${BASH_SOURCE[0]}" ]]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
  if [[ -n "$script_dir" && -f "$script_dir/dd/main.sh" ]]; then
    exec bash "$script_dir/dd/main.sh" "$@"
  fi
fi

exec bash <(curl -fsSL -H 'Cache-Control: no-cache' "$DD_MAIN_URL") "$@"

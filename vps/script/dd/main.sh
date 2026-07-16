#!/bin/bash

# Kuusei DD：薄封装 bin456789/reinstall
# 只负责选择发行版，并注入 SSH 公钥与端口。
#
# 示例:
#   bash main.sh -u 26.04 -port 34522 --key https://example.com/key.pub
#   bash main.sh -d 13 -port 34522 --key https://example.com/key.pub

set -uo pipefail

REINSTALL_URL="${REINSTALL_URL:-https://raw.githubusercontent.com/bin456789/reinstall/main/reinstall.sh}"

Relese=''
tmpDIST=''
sshKeyURL=''
sshPORT='22'

dd_die() {
  echo "错误: $*" >&2
  exit 1
}

dd_usage() {
  cat <<'EOF'
用法:
  bash main.sh -d|--debian <9-13> [选项]
  bash main.sh -u|--ubuntu <18.04|20.04|22.04|24.04|26.04> [选项]

选项:
  -k, --key <https://...>   SSH 公钥 URL（必填，也可传 github:user）
  -port, --ssh-port <端口>  SSH 端口（默认 22）
  -h, --help

说明:
  实际安装由 bin456789/reinstall 完成（Alpine 中转 / cloud image 等）。
  本脚本仅转发发行版，并固定注入 --username root、--ssh-key、--ssh-port。
EOF
}

dd_parse_args() {
  while [[ $# -ge 1 ]]; do
    case "$1" in
      -d|--debian)
        [[ $# -ge 2 ]] || { dd_usage; exit 1; }
        Relese='debian'
        tmpDIST="$2"
        shift 2
        ;;
      -u|--ubuntu)
        [[ $# -ge 2 ]] || { dd_usage; exit 1; }
        Relese='ubuntu'
        tmpDIST="$2"
        shift 2
        ;;
      -k|--key)
        [[ $# -ge 2 ]] || { dd_usage; exit 1; }
        sshKeyURL="$2"
        shift 2
        ;;
      -port|--ssh-port)
        [[ $# -ge 2 ]] || { dd_usage; exit 1; }
        sshPORT="$2"
        shift 2
        ;;
      -v|--ver|-i|--interface|--ip-addr|--ip-mask|--ip-gate|--ip-dns|-apt|--mirror|-console|--seed-url)
        # 旧参数兼容：忽略并跳过可能的值
        if [[ $# -ge 2 && "$2" != -* ]]; then
          shift 2
        else
          shift
        fi
        ;;
      --loader|-firmware|--dev-net|--noipv6|-a|--auto|-m|--manual|-ssl)
        shift
        ;;
      -h|--help)
        dd_usage
        exit 0
        ;;
      *)
        echo "无效选项: $1" >&2
        dd_usage
        exit 1
        ;;
    esac
  done
}

main() {
  dd_parse_args "$@"

  [[ "$(id -u)" -eq 0 ]] || dd_die "请使用 root 运行"
  [[ -n "$Relese" ]] || {
    echo "请指定 -d/--debian 或 -u/--ubuntu" >&2
    dd_usage
    exit 1
  }
  [[ -n "$sshKeyURL" ]] || dd_die "必须提供 -k/--key（SSH 公钥 URL 或 github:user）"
  [[ "$sshPORT" =~ ^[0-9]+$ ]] || dd_die "无效 SSH 端口: $sshPORT"

  case "$Relese" in
    debian)
      [[ -n "$tmpDIST" ]] || tmpDIST='13'
      ;;
    ubuntu)
      [[ -n "$tmpDIST" ]] || tmpDIST='26.04'
      ;;
  esac

  if ! command -v curl >/dev/null 2>&1; then
    dd_die "缺少 curl"
  fi

  echo
  echo "# 调用 bin456789/reinstall"
  echo "目标: ${Relese} ${tmpDIST}"
  echo "SSH:  port=${sshPORT}  key=${sshKeyURL}"
  echo

  # 传入 --username root，避免交互询问用户名；有公钥时不会再问密码
  bash <(curl -fsSL -H 'Cache-Control: no-cache' "$REINSTALL_URL") \
    "$Relese" "$tmpDIST" \
    --username root \
    --ssh-key "$sshKeyURL" \
    --ssh-port "$sshPORT"
}

main "$@"

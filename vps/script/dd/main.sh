#!/bin/bash

# Kuusei DD 入口
# 支持: Debian 12/13、Ubuntu 24.04/26.04；架构 amd64/arm64（Debian 12 另支持 i386）
# 用法示例:
#   bash main.sh -u 26.04 -v 64 -port 34522 --key https://example.com/key.pub
#   bash main.sh -d 13 -v 64 -port 34522 --key https://example.com/key.pub

set -uo pipefail

DD_BASE="${DD_BASE:-https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/script/dd}"

# --- 默认参数 --------------------------------------------------------------

tmpVER=''
tmpDIST=''
sshKeyURL=''
tmpMirror=''
ipAddr=''
ipMask=''
ipGate=''
ipDNS='8.8.8.8'
IncDisk='default'
interface=''
interfaceSelect=''
Relese=''
sshPORT='22'
setNet='0'
setIPv6='0'
loaderMode='0'
IncFirmware='0'
setInterfaceName='0'
GRUBDIR=''
GRUBFILE=''
GRUBVER=''
VER=''
setConsole=''
myPASSWORD='!'
IPv4=''
MASK=''
GATE=''
DIST=''
LinuxMirror=''
sshKeyFile=''
MirrorHost=''
MirrorFolder=''
INSERTGRUB=''
DEBIAN_VER=''
UBUNTU_RELEASE=''
UBUNTU_CODENAME=''
NETBOOT_BASE=''
ISO_URL=''

dd_usage() {
  cat <<'EOF'
用法:
  bash main.sh -d|--debian <12|13|bookworm|trixie> [选项]
  bash main.sh -u|--ubuntu <24.04|26.04|noble|resolute> [选项]

常用选项:
  -k, --key <https://...>   SSH 公钥 URL（必填）
  -port <端口>              SSH 端口（默认 22）
  -v, --ver <64|32|amd64|arm64|i386>
  -i, --interface <网卡>
  --ip-addr / --ip-mask / --ip-gate / --ip-dns
  -apt, --mirror <URL>      Debian 镜像（可选）
  --loader                  仅生成 loader 文件，不改 GRUB/不重启
  -firmware                 Debian 附带非自由固件
  --dev-net                 追加 net.ifnames=0
  --noipv6                  禁用 IPv6
  -console <设备>           串口控制台

说明:
  - Debian: 12/13；架构 amd64、arm64（i386 仅 12）
  - Ubuntu: 24.04/26.04；架构 amd64、arm64
EOF
}

dd_load_modules() {
  local base_dir=''
  if [[ -n "${BASH_SOURCE[0]:-}" && -e "${BASH_SOURCE[0]}" ]]; then
    base_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
  fi

  if [[ -n "$base_dir" && -f "$base_dir/common.sh" ]]; then
    # shellcheck source=/dev/null
    source "$base_dir/common.sh"
    # shellcheck source=/dev/null
    source "$base_dir/debian.sh"
    # shellcheck source=/dev/null
    source "$base_dir/ubuntu.sh"
    return 0
  fi

  # shellcheck source=/dev/null
  source <(curl -fsSL -H 'Cache-Control: no-cache' "${DD_BASE}/common.sh")
  # shellcheck source=/dev/null
  source <(curl -fsSL -H 'Cache-Control: no-cache' "${DD_BASE}/debian.sh")
  # shellcheck source=/dev/null
  source <(curl -fsSL -H 'Cache-Control: no-cache' "${DD_BASE}/ubuntu.sh")
}

dd_parse_args() {
  while [[ $# -ge 1 ]]; do
    case "$1" in
      -v|--ver)
        [[ $# -ge 2 ]] || { dd_usage; exit 1; }
        tmpVER="$2"
        shift 2
        ;;
      -d|--debian)
        [[ $# -ge 2 ]] || { dd_usage; exit 1; }
        Relese='Debian'
        tmpDIST="$2"
        shift 2
        ;;
      -u|--ubuntu)
        [[ $# -ge 2 ]] || { dd_usage; exit 1; }
        Relese='Ubuntu'
        tmpDIST="$2"
        shift 2
        ;;
      -k|--key)
        [[ $# -ge 2 ]] || { dd_usage; exit 1; }
        sshKeyURL="$2"
        shift 2
        ;;
      -i|--interface)
        [[ $# -ge 2 ]] || { dd_usage; exit 1; }
        interfaceSelect="$2"
        interface="$2"
        shift 2
        ;;
      --ip-addr)
        ipAddr="$2"; shift 2 ;;
      --ip-mask)
        ipMask="$2"; shift 2 ;;
      --ip-gate)
        ipGate="$2"; shift 2 ;;
      --ip-dns)
        ipDNS="$2"; shift 2 ;;
      --dev-net)
        setInterfaceName='1'; shift ;;
      --loader)
        loaderMode='1'; shift ;;
      -apt|--mirror)
        tmpMirror="$2"; shift 2 ;;
      -console)
        setConsole="$2"; shift 2 ;;
      -firmware)
        IncFirmware='1'; shift ;;
      -port)
        sshPORT="$2"; shift 2 ;;
      --noipv6)
        setIPv6='1'; shift ;;
      -h|--help|error)
        dd_usage
        exit 0
        ;;
      -a|--auto|-m|--manual|-ssl)
        # 兼容旧参数，忽略
        shift
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
  dd_load_modules
  dd_parse_args "$@"
  dd_require_root

  [[ -n "$Relese" ]] || {
    echo "请指定 -d/--debian 或 -u/--ubuntu" >&2
    dd_usage
    exit 1
  }

  dd_init_grub_paths
  clear
  echo
  echo "# 准备重装环境"

  dd_dependence 'wget,curl,ssh-keygen,mktemp,openssl,awk,grep,sed,cut,cat,lsblk,cpio,gzip,find,dirname,basename,cp,file,ip'
  dd_detect_network
  dd_prepare_ssh_key

  local disk
  disk="$(dd_get_disk)"
  [[ -n "$disk" ]] && IncDisk="$disk"

  dd_resolve_arch

  case "$Relese" in
    Debian)
      [[ -n "$tmpDIST" ]] || tmpDIST='13'
      echo "目标: Debian ${tmpDIST} / ${VER}"
      dd_debian_install
      ;;
    Ubuntu)
      [[ -n "$tmpDIST" ]] || tmpDIST='26.04'
      echo "目标: Ubuntu ${tmpDIST} / ${VER}"
      dd_ubuntu_install
      ;;
    *)
      dd_die "未知发行版: $Relese"
      ;;
  esac
}

main "$@"

#!/bin/bash

# VPS 多功能菜单脚本
# 功能：系统初始化、DD 重装、SSH 密钥、TCP 调优、性能测试

set -uo pipefail

# 仓库内脚本的 raw 地址前缀
READONLY_REPO_RAW='https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/script'
# 默认 SSH 端口
DEFAULT_SSH_PORT='34522'
# Kuusei DD 默认安装的 Ubuntu 版本
DEFAULT_DD_UBUNTU='26.04'

# 可由命令行参数预填，也可在交互时输入
ssh_key_url=''
ubuntu_pro_token=''
ssh_port=''

# 检查外部命令是否存在
require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "错误: 缺少依赖命令 '$cmd'，请先安装后再运行。" >&2
    return 1
  fi
}

# 拉取远程脚本并用 bash 执行，可附加额外参数
run_remote_bash() {
  local url="$1"
  shift
  bash <(curl -fsSL -H 'Cache-Control: no-cache' "$url") "$@"
}

# 循环提示，直到拿到以 https:// 开头的 URL
# $1 = 提示语，$2 = 已有值（可为空）
prompt_https_url() {
  local prompt="$1"
  local value="${2:-}"

  while [[ ! "$value" =~ ^https:// ]]; do
    if [[ -n "$value" ]]; then
      echo "无效的 URL。请确保 URL 以 https:// 开头。"
    fi
    read -r -p "$prompt" value
  done

  printf '%s' "$value"
}

# 带默认值的输入：$1 = 提示语，$2 = 默认值
prompt_with_default() {
  local prompt="$1"
  local default="$2"
  local value=''

  read -r -p "$prompt" value
  printf '%s' "${value:-$default}"
}

# --- 具体功能 --------------------------------------------------------------

# 系统初始化（Debian / Ubuntu）
init_system() {
  echo "正在运行系统初始化脚本..."
  require_command curl || return 1

  local args=()
  [[ -n "$ubuntu_pro_token" ]] && args+=(--pro "$ubuntu_pro_token")
  run_remote_bash "${READONLY_REPO_RAW}/init.sh" "${args[@]}"
}

# 性能测试：YABS
test_yabs() {
  echo "正在运行 YABS 测试脚本..."
  require_command curl || return 1
  curl -sL https://yabs.sh | bash
}

# 性能测试：融合怪
test_fusion_monster() {
  echo "正在运行融合怪测试脚本..."
  require_command curl || return 1
  curl -L https://gitlab.com/spiritysdx/za/-/raw/main/ecs.sh -o ecs.sh
  chmod +x ecs.sh
  bash ecs.sh
}

# DD 重装：Kuusei（强制 SSH 公钥，默认 Ubuntu 26.04）
dd_kuusei() {
  echo "正在运行 Kuusei DD 脚本..."
  require_command curl || return 1

  ssh_key_url="$(prompt_https_url '请输入 SSH 密钥 URL (必须以 https:// 开头): ' "$ssh_key_url")"
  ssh_port="$(prompt_with_default "请输入 SSH 端口 (默认: ${DEFAULT_SSH_PORT}): " "$DEFAULT_SSH_PORT")"

  run_remote_bash "${READONLY_REPO_RAW}/dd/main.sh" \
    -u "$DEFAULT_DD_UBUNTU" \
    -v 64 \
    -port "$ssh_port" \
    --key "$ssh_key_url"
}

# DD 重装：Debian 13 快捷入口
dd_debian() {
  echo "正在运行 Kuusei DD（Debian 13）..."
  require_command curl || return 1

  ssh_key_url="$(prompt_https_url '请输入 SSH 密钥 URL (必须以 https:// 开头): ' "$ssh_key_url")"
  ssh_port="$(prompt_with_default "请输入 SSH 端口 (默认: ${DEFAULT_SSH_PORT}): " "$DEFAULT_SSH_PORT")"

  run_remote_bash "${READONLY_REPO_RAW}/dd/main.sh" \
    -d 13 \
    -v 64 \
    -port "$ssh_port" \
    --key "$ssh_key_url"
}

# DD 重装：ARM 兜底（leitbogioro）
dd_arm() {
  echo "正在运行 ARM DD 脚本..."
  require_command wget || return 1
  wget --no-check-certificate -qO InstallNET.sh \
    'https://raw.githubusercontent.com/leitbogioro/Tools/master/Linux_reinstall/InstallNET.sh'
  chmod a+x InstallNET.sh
  bash InstallNET.sh -debian
}

# 配置 SSH 公钥与端口
set_ssh_key() {
  echo "正在设置 SSH 密钥..."
  require_command curl || return 1

  ssh_key_url="$(prompt_https_url '请输入 SSH 密钥 URL (必须以 https:// 开头): ' "$ssh_key_url")"
  ssh_port="$(prompt_with_default "请输入 SSH 端口 (默认: ${DEFAULT_SSH_PORT}): " "$DEFAULT_SSH_PORT")"

  if ! bash <(curl -fsSL 'https://link.kuusei.moe/set-ssh-key') \
    -o -d -p "$ssh_port" -u "$ssh_key_url"; then
    echo "SSH 密钥设置失败，请检查 URL 和网络连接。" >&2
    return 1
  fi

  echo "SSH 密钥设置完成。"
  cat /root/.ssh/authorized_keys
}

# TCP 窗口与 BBR 相关调优
tcp_window_optimization() {
  echo "正在优化 TCP 窗口参数..."

  # 先清掉旧配置，避免重复写入
  local keys=(
    net.core.default_qdisc
    net.ipv4.tcp_congestion_control
    net.ipv4.tcp_rmem
    net.ipv4.tcp_wmem
    net.ipv4.tcp_window_scaling
    net.ipv4.tcp_adv_win_scale
    net.ipv4.tcp_notsent_lowat
    net.ipv4.tcp_slow_start_after_idle
  )
  local key
  for key in "${keys[@]}"; do
    sudo sed -i "/${key}/d" /etc/sysctl.conf
  done

  {
    echo 'net.core.default_qdisc = cake'
    echo 'net.ipv4.tcp_congestion_control = bbr'
    echo 'net.ipv4.tcp_rmem = 8192 262144 67108864'
    echo 'net.ipv4.tcp_wmem = 4096 16384 67108864'
    echo 'net.ipv4.tcp_window_scaling = 1'
    echo 'net.ipv4.tcp_adv_win_scale = -2'
    echo 'net.ipv4.tcp_notsent_lowat = 131072'
    echo 'net.ipv4.tcp_slow_start_after_idle = 0'
  } | sudo tee -a /etc/sysctl.conf >/dev/null

  echo "正在应用 sysctl 配置..."
  sudo sysctl -p
}

# --- 菜单 ------------------------------------------------------------------

# 通用 select 菜单：打印提示，返回用户选中的项
select_menu() {
  local prompt="$1"
  shift
  local -a items=("$@")
  local choice

  PS3="$prompt"
  select choice in "${items[@]}"; do
    if [[ -n "$choice" ]]; then
      printf '%s' "$choice"
      return 0
    fi
    echo "无效的选项 $REPLY"
  done
}

# 测试脚本子菜单
test_menu() {
  case "$(select_menu '请选择要运行的测试脚本: ' YABS 融合怪 返回)" in
    YABS) test_yabs ;;
    融合怪) test_fusion_monster ;;
    返回) ;;
  esac
}

# DD 子菜单
dd_menu() {
  case "$(select_menu '请选择要运行的 DD 脚本: ' 'Ubuntu 26.04' 'Debian 13' ARM 返回)" in
    'Ubuntu 26.04') dd_kuusei ;;
    'Debian 13') dd_debian ;;
    ARM) dd_arm ;;
    返回) ;;
  esac
}

# 主菜单循环
main_menu() {
  local choice

  while true; do
    echo
    choice="$(select_menu '请输入需要执行的选项: ' \
      系统初始化 测试脚本 DD '设置 SSH Key' 'TCP 窗口调优' 退出)"

    case "$choice" in
      系统初始化) init_system ;;
      测试脚本) test_menu ;;
      DD) dd_menu ;;
      '设置 SSH Key') set_ssh_key ;;
      'TCP 窗口调优') tcp_window_optimization ;;
      退出)
        echo 'DUANG~'
        break
        ;;
    esac
  done
}

# --- 入口 ------------------------------------------------------------------

# 解析命令行参数
# -x      直接执行系统初始化
# --key   预填 SSH 公钥 HTTPS URL
# --pro   预填 Ubuntu Pro token（仅初始化时用到）
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -x)
        init_system
        shift
        ;;
      --key)
        [[ $# -ge 2 ]] || { echo "错误: --key 需要 URL 参数" >&2; exit 1; }
        ssh_key_url="$2"
        shift 2
        ;;
      --pro)
        [[ $# -ge 2 ]] || { echo "错误: --pro 需要 token 参数" >&2; exit 1; }
        ubuntu_pro_token="$2"
        shift 2
        ;;
      *)
        echo "无效的选项: $1" >&2
        exit 1
        ;;
    esac
  done
}

main() {
  parse_args "$@"
  main_menu
}

main "$@"

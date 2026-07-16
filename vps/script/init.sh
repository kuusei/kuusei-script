#!/bin/bash

# Debian / Ubuntu 系统初始化脚本
# - 更新系统并安装常用工具
# - 启用 NTP
# - Ubuntu 可选执行 pro attach（--pro 或交互输入）
# - 安装 croc

set -euo pipefail

# 基础软件包
BASE_PACKAGES=(
  sudo curl wget vim tmux git rsync htop systemd-timesyncd
)

ubuntu_pro_token="${KUUSEI_UBUNTU_PRO_TOKEN:-}"

# 打印用法
usage() {
  echo "用法: bash init.sh [--pro <ubuntu-pro-token>]"
}

# 输出错误并退出
die() {
  echo "错误: $*" >&2
  exit 1
}

# 解析参数
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --pro)
        [[ $# -ge 2 ]] || die "--pro 需要 token 参数"
        ubuntu_pro_token="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        usage
        die "无效的选项: $1"
        ;;
    esac
  done
}

# 必须使用 root 运行
require_root() {
  [[ "$EUID" -eq 0 ]] || die "请使用 root 运行此脚本"
}

# 检测发行版，仅允许 Debian / Ubuntu
detect_os() {
  [[ -f /etc/os-release ]] || die "无法识别系统（缺少 /etc/os-release）"
  # shellcheck source=/dev/null
  . /etc/os-release

  case "${ID}" in
    debian|ubuntu) ;;
    *) die "仅支持 Debian 或 Ubuntu（当前: ${ID:-unknown}）" ;;
  esac
}

# 更新系统并安装基础包，开启 NTP
install_base_packages() {
  echo "正在初始化 ${PRETTY_NAME:-$ID}..."
  apt update -y
  apt upgrade -y
  apt install -y "${BASE_PACKAGES[@]}"
  timedatectl set-ntp true
}

# 仅 Ubuntu：绑定 Ubuntu Pro（可跳过）
attach_ubuntu_pro() {
  [[ "$ID" == ubuntu ]] || return 0

  if [[ -z "$ubuntu_pro_token" ]]; then
    read -r -p "Ubuntu Pro token（直接回车跳过）: " ubuntu_pro_token
  fi

  if [[ -z "$ubuntu_pro_token" ]]; then
    echo "已跳过 Ubuntu Pro 绑定。"
    return 0
  fi

  echo "正在绑定 Ubuntu Pro..."
  apt install -y ubuntu-pro-client
  if pro attach "$ubuntu_pro_token"; then
    echo "Ubuntu Pro 绑定成功。"
  else
    echo "警告: Ubuntu Pro 绑定失败。" >&2
  fi
}

# 安装 croc 传文件工具
install_croc() {
  echo "正在安装 croc..."
  curl -fsSL https://getcroc.schollz.com | bash
}

main() {
  parse_args "$@"
  require_root
  detect_os
  install_base_packages
  attach_ubuntu_pro
  install_croc
  echo "初始化完成。"
}

main "$@"

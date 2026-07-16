#!/bin/bash

# Ubuntu 24.04 / 26.04：按官方 Subiquity autoinstall 方式安装
#
# 官方推荐：用 cloud-init NoCloud 提供 autoinstall 配置，不改安装器本体。
# 本脚本默认：
#   1. 下载官方 netboot 的 linux / initrd（不拆包）
#   2. 官方 iso-url 指向 live-server ISO
#   3. 将 user-data/meta-data 以未压缩 cpio 追加进 initrd（本地 NoCloud）
# 也可用 --seed-url 走更纯的 nocloud-net（配置完全在 HTTP 上，不改 initrd）

dd_ubuntu_normalize_dist() {
  local raw
  raw="$(echo "$1" | sed -r 's/(.*)/\L\1/' | sed 's/[[:space:]]//g')"
  case "$raw" in
    24|24.04|noble)
      DIST='noble'
      UBUNTU_RELEASE='24.04'
      ;;
    26|26.04|resolute)
      DIST='resolute'
      UBUNTU_RELEASE='26.04'
      ;;
    *)
      dd_die "Ubuntu 仅支持 24.04/noble 或 26.04/resolute（收到: $1）"
      ;;
  esac
}

dd_ubuntu_validate_arch() {
  case "$VER" in
    amd64|arm64) ;;
    *) dd_die "Ubuntu 仅支持 amd64/arm64（收到: $VER）" ;;
  esac
}

dd_ubuntu_urls() {
  if [[ "$VER" == 'amd64' ]]; then
    NETBOOT_BASE="https://releases.ubuntu.com/${UBUNTU_RELEASE}/netboot/amd64"
    ISO_URL="https://releases.ubuntu.com/${UBUNTU_RELEASE}/ubuntu-${UBUNTU_RELEASE}-live-server-amd64.iso"
  else
    NETBOOT_BASE="https://cdimage.ubuntu.com/releases/${UBUNTU_RELEASE}/release/netboot/arm64"
    ISO_URL="https://cdimage.ubuntu.com/releases/${UBUNTU_RELEASE}/release/ubuntu-${UBUNTU_RELEASE}-live-server-arm64.iso"
  fi
}

# 生成官方格式的 NoCloud 种子（user-data + meta-data）
dd_ubuntu_write_seed() {
  local seed_root="${1:-/tmp/kuusei_seed}"
  local keys_yaml='' line prefix

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -n "$line" ]] || continue
    line="${line//\\/\\\\}"
    line="${line//\"/\\\"}"
    keys_yaml+="$(printf '\n      - "%s"' "$line")"
  done <"$sshKeyFile"

  prefix=$(ip addr show dev "$interface" 2>/dev/null | grep 'inet ' | head -n1 | grep -oE '/[0-9]+' | tr -d '/' || true)
  [[ -n "$prefix" ]] || prefix='24'

  rm -rf "$seed_root"
  mkdir -p "$seed_root/cidata"
  cat >"$seed_root/cidata/meta-data" <<EOF
instance-id: kuusei-dd
local-hostname: ubuntu
EOF

  # 精简 autoinstall：身份 + SSH 公钥 + 整盘 + 静态网卡 + root 公钥
  cat >"$seed_root/cidata/user-data" <<EOF
#cloud-config
autoinstall:
  version: 1
  locale: en_US.UTF-8
  keyboard:
    layout: us
  identity:
    hostname: ubuntu
    username: ubuntu
    password: "${myPASSWORD}"
  ssh:
    install-server: true
    allow-pw: false
    authorized-keys:${keys_yaml}
  storage:
    layout:
      name: direct
  network:
    version: 2
    ethernets:
      any:
        match:
          name: "en*|eth*"
        dhcp4: false
        addresses:
          - ${IPv4}/${prefix}
        routes:
          - to: default
            via: ${GATE}
        nameservers:
          addresses: [${ipDNS}]
  packages:
    - openssh-server
  late-commands:
    - curtin in-target -- mkdir -p /root/.ssh /etc/ssh/sshd_config.d
    - curtin in-target -- cp /home/ubuntu/.ssh/authorized_keys /root/.ssh/authorized_keys
    - curtin in-target -- chmod 700 /root/.ssh
    - curtin in-target -- chmod 600 /root/.ssh/authorized_keys
    - curtin in-target -- chown -R root:root /root/.ssh
    - curtin in-target -- bash -c "printf 'Port ${sshPORT}\\nPermitRootLogin prohibit-password\\nPasswordAuthentication no\\nPubkeyAuthentication yes\\n' >/etc/ssh/sshd_config.d/99-kuusei.conf"
EOF
}

dd_ubuntu_install() {
  dd_ubuntu_normalize_dist "$tmpDIST"
  dd_ubuntu_validate_arch
  dd_ubuntu_urls

  echo
  echo "[Ubuntu] ${UBUNTU_RELEASE} / ${VER}"
  echo "按官方 autoinstall + NoCloud 方式准备..."

  dd_download "${NETBOOT_BASE}/linux" /tmp/vmlinuz
  dd_download "${NETBOOT_BASE}/initrd" /tmp/initrd.img

  if ! wget --spider --timeout=8 -q "$ISO_URL"; then
    dd_die "无法访问官方 ISO: $ISO_URL"
  fi

  dd_ubuntu_write_seed /tmp/kuusei_seed

  local ds_opt
  if [[ -n "${seedURL:-}" ]]; then
    # 官方推荐：配置放在 HTTP，完全不改 initrd
    [[ "$seedURL" =~ ^https?:// ]] || dd_die "--seed-url 需要 http(s) 地址，且需能访问 user-data 与 meta-data"
    echo "使用 nocloud-net 种子: $seedURL"
    echo "请确认该 URL 下已有 user-data / meta-data（可用 /tmp/kuusei_seed/cidata/ 内容上传）"
    ds_opt="ds=nocloud-net\;s=${seedURL}"
  else
    # 本地 NoCloud：只追加一小段 cpio，不拆解官方 initrd
    dd_append_dir_to_initrd /tmp/initrd.img /tmp/kuusei_seed
    ds_opt='ds=nocloud\;s=/cidata/'
  fi

  # 对齐官方 netboot 参数，并加上 autoinstall。
  # ip= 第六段（设备名）留空：让 initramfs 用第一块可用网卡，避免宿主 eth0
  # 与安装器 ens*/enp* 预测名不一致导致「Waiting for eth0」。
  # 同时强制 net.ifnames=0，保证 late-commands / 装完后的网卡名与宿主一致。
  # nomodeset：关掉 KMS/DRM 帧缓冲，避免多数 VPS VNC 花屏（此前可见 drm_fb_helper 刷屏）。
  local boot_option net_name_opts=''
  if [[ "$setInterfaceName" != '1' ]]; then
    net_name_opts=' net.ifnames=0 biosdevname=0'
  fi
  boot_option="root=/dev/ram0 ramdisk_size=1500000 ip=${IPv4}::${GATE}:${MASK}:ubuntu::off iso-url=${ISO_URL} autoinstall ${ds_opt}${net_name_opts} nomodeset vga=normal$(dd_extra_kernel_opts)$(dd_console_opt)"

  dd_prepare_grub_entry "Install Ubuntu ${UBUNTU_RELEASE} ${VER}"
  dd_apply_grub_boot "$boot_option"
  dd_finish_boot
}

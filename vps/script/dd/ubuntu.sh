#!/bin/bash

# Ubuntu 24.04 / 26.04 网络重装：live netboot + Subiquity autoinstall

dd_ubuntu_normalize_dist() {
  local raw
  raw="$(echo "$1" | sed -r 's/(.*)/\L\1/' | sed 's/[[:space:]]//g')"
  case "$raw" in
    24|24.04|noble)
      DIST='noble'
      UBUNTU_RELEASE='24.04'
      UBUNTU_CODENAME='noble'
      ;;
    26|26.04|resolute)
      DIST='resolute'
      UBUNTU_RELEASE='26.04'
      UBUNTU_CODENAME='resolute'
      ;;
    *)
      dd_die "Ubuntu 仅支持 24.04/noble 或 26.04/resolute（收到: $1）"
      ;;
  esac
}

dd_ubuntu_validate_arch() {
  case "$VER" in
    amd64|arm64) ;;
    i386) dd_die "Ubuntu ${UBUNTU_RELEASE} 不支持 i386，请使用 amd64/arm64" ;;
    *) dd_die "Ubuntu 不支持架构: $VER" ;;
  esac
}

# amd64 走 releases.ubuntu.com；arm64 走 cdimage.ubuntu.com
dd_ubuntu_urls() {
  if [[ "$VER" == 'amd64' ]]; then
    NETBOOT_BASE="https://releases.ubuntu.com/${UBUNTU_RELEASE}/netboot/amd64"
    ISO_URL="https://releases.ubuntu.com/${UBUNTU_RELEASE}/ubuntu-${UBUNTU_RELEASE}-live-server-amd64.iso"
  else
    NETBOOT_BASE="https://cdimage.ubuntu.com/releases/${UBUNTU_RELEASE}/release/netboot/arm64"
    ISO_URL="https://cdimage.ubuntu.com/releases/${UBUNTU_RELEASE}/release/ubuntu-${UBUNTU_RELEASE}-live-server-arm64.iso"
  fi
}

dd_ubuntu_ip_cmdline() {
  # 内核 ip= 静态格式: client::gateway:netmask:hostname:device:off
  if [[ "$setNet" == '1' || "$loaderMode" == '0' ]]; then
    echo "ip=${IPv4}::${GATE}:${MASK}:ubuntu:${interface}:off"
  else
    echo 'ip=dhcp'
  fi
}

dd_ubuntu_write_autoinstall() {
  local keys_yaml='' line prefix

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -n "$line" ]] || continue
    # YAML 双引号内转义反斜杠与引号
    line="${line//\\/\\\\}"
    line="${line//\"/\\\"}"
    keys_yaml+="$(printf '\n      - "%s"' "$line")"
  done <"$sshKeyFile"

  prefix=$(ip addr show dev "$interface" 2>/dev/null | grep 'inet ' | head -n1 | grep -oE '/[0-9]+' | tr -d '/' || true)
  [[ -n "$prefix" ]] || prefix='24'

  mkdir -p /tmp/boot/cidata
  printf 'instance-id: kuusei-dd\nlocal-hostname: ubuntu\n' >/tmp/boot/cidata/meta-data

  cat >/tmp/boot/cidata/user-data <<EOF
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
      ${interface}:
        dhcp4: false
        addresses:
          - ${IPv4}/${prefix}
        routes:
          - to: default
            via: ${GATE}
        nameservers:
          addresses:
            - ${ipDNS}
  packages:
    - openssh-server
  late-commands:
    - curtin in-target -- mkdir -p /root/.ssh
    - curtin in-target -- cp /home/ubuntu/.ssh/authorized_keys /root/.ssh/authorized_keys
    - curtin in-target -- chmod 700 /root/.ssh
    - curtin in-target -- chmod 600 /root/.ssh/authorized_keys
    - curtin in-target -- chown -R root:root /root/.ssh
    - curtin in-target -- mkdir -p /etc/ssh/sshd_config.d
    - curtin in-target -- bash -c "printf 'Port ${sshPORT}\\nPermitRootLogin prohibit-password\\nPasswordAuthentication no\\nPubkeyAuthentication yes\\n' >/etc/ssh/sshd_config.d/99-kuusei.conf"
    - curtin in-target -- sed -ri 's/^#?Port.*/Port ${sshPORT}/g' /etc/ssh/sshd_config
    - curtin in-target -- sed -ri 's/^#?PermitRootLogin.*/PermitRootLogin prohibit-password/g' /etc/ssh/sshd_config
    - curtin in-target -- sed -ri 's/^#?PasswordAuthentication.*/PasswordAuthentication no/g' /etc/ssh/sshd_config
    - curtin in-target -- sed -ri 's/^#?PubkeyAuthentication.*/PubkeyAuthentication yes/g' /etc/ssh/sshd_config
EOF
}

dd_ubuntu_install() {
  dd_ubuntu_normalize_dist "$tmpDIST"
  dd_ubuntu_validate_arch
  dd_ubuntu_urls

  echo
  echo "[Ubuntu] [${UBUNTU_RELEASE}/${DIST}] [${VER}] 下载 netboot..."
  dd_download "${NETBOOT_BASE}/initrd" /tmp/initrd.img
  dd_download "${NETBOOT_BASE}/linux" /tmp/vmlinuz

  if ! wget --spider --timeout=8 -q "$ISO_URL"; then
    dd_die "无法访问 live-server ISO: $ISO_URL"
  fi

  dd_prepare_grub_entry "Install Ubuntu ${UBUNTU_RELEASE} ${VER}"

  local ip_opt boot_option
  ip_opt="$(dd_ubuntu_ip_cmdline)"
  # GRUB 中分号需转义；autoinstall 配置已嵌入 initrd 的 /cidata
  boot_option="root=/dev/ram0 ramdisk_size=1500000 ${ip_opt} iso-url=${ISO_URL} autoinstall ds=nocloud\;s=/cidata/$(dd_extra_kernel_opts)$(dd_console_opt)"
  dd_apply_grub_boot "$boot_option"

  dd_extract_initrd /tmp/initrd.img
  dd_ubuntu_write_autoinstall
  dd_repack_initrd
  dd_finish_boot
}

#!/bin/bash

# Debian 12 (bookworm) / 13 (trixie) 网络重装：debian-installer + preseed

dd_debian_normalize_dist() {
  local raw
  raw="$(echo "$1" | sed -r 's/(.*)/\L\1/' | sed 's/[[:space:]]//g')"
  case "$raw" in
    12|bookworm) DIST='bookworm'; DEBIAN_VER='12' ;;
    13|trixie) DIST='trixie'; DEBIAN_VER='13' ;;
    *) dd_die "Debian 仅支持 12/bookworm 或 13/trixie（收到: $1）" ;;
  esac
}

dd_debian_select_mirror() {
  local mirrors=()
  local mirror url
  [[ -n "$tmpMirror" ]] && mirrors+=("$tmpMirror")
  mirrors+=('http://deb.debian.org/debian' 'http://archive.debian.org/debian')

  for mirror in "${mirrors[@]}"; do
    url="${mirror}/dists/${DIST}/main/installer-${VER}/current/images/netboot/debian-installer/${VER}/initrd.gz"
    if wget --spider --timeout=5 -q "$url"; then
      LinuxMirror="$mirror"
      return 0
    fi
  done
  dd_die "无法从镜像站获取 Debian ${DIST}/${VER} netboot"
}

dd_debian_validate_arch() {
  case "$VER" in
    amd64|arm64) ;;
    i386)
      [[ "$DIST" == 'bookworm' ]] || dd_die "Debian 13 不再提供 i386 installer，请使用 amd64/arm64"
      ;;
    *) dd_die "Debian 不支持架构: $VER" ;;
  esac
}

dd_debian_write_preseed() {
  local current_kernel select_lowmem
  current_kernel=$(ls -1 ./lib/modules 2>/dev/null | head -n1 || true)
  if [[ -n "$current_kernel" ]]; then
    select_lowmem="di-utils-exit-installer,driver-injection-disk-detect,fdisk-udeb,netcfg-static,parted-udeb,partman-auto,partman-ext3,ata-modules-${current_kernel}-di,efi-modules-${current_kernel}-di,sata-modules-${current_kernel}-di,scsi-modules-${current_kernel}-di,scsi-nic-modules-${current_kernel}-di"
  else
    select_lowmem=''
  fi

  cat >/tmp/boot/preseed.cfg <<EOF
d-i debian-installer/locale string en_US.UTF-8
d-i debian-installer/country string US
d-i debian-installer/language string en

d-i console-setup/layoutcode string us
d-i keyboard-configuration/xkb-keymap string us
d-i lowmem/low note
d-i anna/choose_modules_lowmem multiselect ${select_lowmem}

d-i netcfg/choose_interface select ${interfaceSelect}

d-i netcfg/disable_autoconfig boolean true
d-i netcfg/dhcp_failed note
d-i netcfg/dhcp_options select Configure network manually
d-i netcfg/get_ipaddress string ${IPv4}
d-i netcfg/get_netmask string ${MASK}
d-i netcfg/get_gateway string ${GATE}
d-i netcfg/get_nameservers string ${ipDNS}
d-i netcfg/no_default_route boolean true
d-i netcfg/confirm_static boolean true

d-i hw-detect/load_firmware boolean true

d-i mirror/country string manual
d-i mirror/http/hostname string ${MirrorHost}
d-i mirror/http/directory string ${MirrorFolder}
d-i mirror/http/proxy string

d-i passwd/root-login boolean true
d-i passwd/make-user boolean false
d-i passwd/root-password-crypted password ${myPASSWORD}

d-i clock-setup/utc boolean true
d-i time/zone string Asia/Shanghai
d-i clock-setup/ntp boolean false

d-i partman-partitioning/confirm_write_new_label boolean true
d-i partman/mount_style select uuid
d-i partman/choose_partition select finish
d-i partman-auto/method string regular
d-i partman-auto/init_automatically_partition select Guided - use entire disk
d-i partman-auto/choose_recipe select All files in one partition (recommended for new users)
d-i partman-md/device_remove_md boolean true
d-i partman-lvm/device_remove_lvm boolean true
d-i partman-lvm/confirm boolean true
d-i partman-lvm/confirm_nooverwrite boolean true
d-i partman/confirm boolean true
d-i partman/confirm_nooverwrite boolean true

d-i debian-installer/allow_unauthenticated boolean true

tasksel tasksel/first multiselect minimal
d-i pkgsel/include string openssh-server
d-i pkgsel/upgrade select none
d-i apt-setup/services-select multiselect

popularity-contest popularity-contest/participate boolean false

d-i grub-installer/only_debian boolean true
d-i grub-installer/bootdev string ${IncDisk}
d-i grub-installer/force-efi-extra-removable boolean true
d-i finish-install/reboot_in_progress note
d-i debian-installer/exit/reboot boolean true
d-i preseed/late_command string \\
set -e; \\
mkdir -p /target/root/.ssh; \\
cp /authorized_keys /target/root/.ssh/authorized_keys; \\
chmod 700 /target/root/.ssh; \\
chmod 600 /target/root/.ssh/authorized_keys; \\
chown -R 0:0 /target/root/.ssh; \\
mkdir -p /target/etc/ssh/sshd_config.d; \\
printf '%s\\n' 'Port ${sshPORT}' 'PermitRootLogin prohibit-password' 'PasswordAuthentication no' 'PubkeyAuthentication yes' >/target/etc/ssh/sshd_config.d/99-kuusei.conf; \\
sed -ri 's/^#?Port.*/Port ${sshPORT}/g' /target/etc/ssh/sshd_config; \\
sed -ri 's/^#?PermitRootLogin.*/PermitRootLogin prohibit-password/g' /target/etc/ssh/sshd_config; \\
sed -ri 's/^#?PasswordAuthentication.*/PasswordAuthentication no/g' /target/etc/ssh/sshd_config; \\
sed -ri 's/^#?PubkeyAuthentication.*/PubkeyAuthentication yes/g' /target/etc/ssh/sshd_config
EOF

  if [[ "$loaderMode" != '0' && "$setNet" == '0' ]]; then
    sed -i '/netcfg\/disable_autoconfig/d' /tmp/boot/preseed.cfg
    sed -i '/netcfg\/dhcp_options/d' /tmp/boot/preseed.cfg
    sed -i '/netcfg\/get_.*/d' /tmp/boot/preseed.cfg
    sed -i '/netcfg\/confirm_static/d' /tmp/boot/preseed.cfg
  fi
}

dd_debian_install() {
  dd_debian_normalize_dist "$tmpDIST"
  dd_debian_validate_arch
  dd_debian_select_mirror

  MirrorHost="$(echo "$LinuxMirror" | awk -F'://|/' '{print $2}')"
  MirrorFolder="$(echo "$LinuxMirror" | awk -F"${MirrorHost}" '{print $2}')"
  [[ -n "$MirrorFolder" ]] || MirrorFolder='/'

  [[ -z "$interfaceSelect" ]] && interfaceSelect='auto'

  echo
  echo "[Debian] [${DIST}] [${VER}] 下载安装介质..."
  dd_download \
    "${LinuxMirror}/dists/${DIST}/main/installer-${VER}/current/images/netboot/debian-installer/${VER}/initrd.gz" \
    /tmp/initrd.img
  dd_download \
    "${LinuxMirror}/dists/${DIST}/main/installer-${VER}/current/images/netboot/debian-installer/${VER}/linux" \
    /tmp/vmlinuz

  if [[ "$IncFirmware" == '1' ]]; then
    dd_download \
      "http://cdimage.debian.org/cdimage/unofficial/non-free/firmware/${DIST}/current/firmware.cpio.gz" \
      /tmp/firmware.cpio.gz
  fi

  dd_prepare_grub_entry "Install Debian ${DIST} ${VER}"
  local boot_option
  boot_option="auto=true hostname=debian domain=debian quiet$(dd_extra_kernel_opts)$(dd_console_opt)"
  dd_apply_grub_boot "$boot_option"

  dd_extract_initrd /tmp/initrd.img
  cp -f "$sshKeyFile" /tmp/boot/authorized_keys || dd_die "写入 authorized_keys 失败"
  chmod 600 /tmp/boot/authorized_keys
  dd_debian_write_preseed

  if [[ -f /tmp/firmware.cpio.gz ]]; then
    gzip -d </tmp/firmware.cpio.gz | cpio --extract --verbose --make-directories --no-absolute-filenames >/dev/null 2>&1 || true
  fi

  dd_repack_initrd
  dd_finish_boot
}

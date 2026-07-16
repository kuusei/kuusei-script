#!/bin/bash

# DD 共用逻辑：依赖、网络、磁盘、GRUB、SSH 公钥、initrd 打包与重启

dd_die() {
  echo "错误: $*" >&2
  exit 1
}

dd_require_root() {
  [[ "$EUID" -eq 0 ]] || dd_die "请使用 root 运行此脚本"
}

# 检查依赖命令，参数为逗号分隔列表
dd_dependence() {
  local missing=0
  local bin path found
  local deps
  IFS=',' read -r -a deps <<<"$1"

  echo
  echo "# 检查依赖"
  for bin in "${deps[@]}"; do
    found=0
    local old_ifs="$IFS"
    IFS=':'
    for path in $PATH; do
      if [[ -x "${path}/${bin}" ]]; then
        found=1
        break
      fi
    done
    IFS="$old_ifs"
    if [[ "$found" -eq 1 ]]; then
      echo -e "[OK]\t${bin}"
    else
      echo -e "[缺失]\t${bin}"
      missing=1
    fi
  done

  [[ "$missing" -eq 0 ]] || dd_die "请先安装缺失依赖后再运行"
}

# CIDR 前缀转点分掩码
dd_netmask_from_prefix() {
  local n="${1:-32}"
  local b='' m='' i s
  for ((i = 0; i < 32; i++)); do
    if [[ $i -lt $n ]]; then
      b="${b}1"
    else
      b="${b}0"
    fi
  done
  for ((i = 0; i < 4; i++)); do
    s=$(echo "$b" | cut -c$((i * 8 + 1))-$(((i + 1) * 8)))
    if [[ -z "$m" ]]; then
      m=$((2#$s))
    else
      m="${m}.$((2#$s))"
    fi
  done
  echo "$m"
}

dd_get_interface() {
  local iface='' item
  local interfaces default_route
  interfaces=$(grep ':' /proc/net/dev | cut -d':' -f1 | sed 's/[[:space:]]//g' | grep -ivE '^(lo|sit|stf|gif|dummy|vmnet|vir|gre|ipip|ppp|bond|tun|tap|ip6gre|ip6tnl|teql|ocserv|vpn)')
  default_route=$(ip route show default | grep '^default' || true)
  for item in $interfaces; do
    [[ -n "$item" ]] || continue
    if echo "$default_route" | grep -q "$item"; then
      iface="$item"
      break
    fi
  done
  echo "$iface"
}

dd_get_disk() {
  local disks
  disks=$(lsblk | sed 's/[[:space:]]*$//g' | grep 'disk$' | cut -d' ' -f1 | grep -vE 'fd[0-9]*|sr[0-9]*' | head -n1)
  [[ -n "$disks" ]] || {
    echo ''
    return
  }
  if echo "$disks" | grep -q '/dev'; then
    echo "$disks"
  else
    echo "/dev/$disks"
  fi
}

dd_get_grub() {
  local boot="${1:-/boot}"
  local folder file_name ver
  folder=$(find "$boot" -type d -name 'grub*' 2>/dev/null | head -n1)
  [[ -n "$folder" ]] || return 0
  file_name=$(ls -1 "$folder" 2>/dev/null | grep -E '^grub.conf$|^grub.cfg$' || true)
  if [[ -z "$file_name" ]]; then
    ls -1 "$folder" 2>/dev/null | grep -q '^grubenv$' || return 0
    folder=$(find "$boot" -type f -name 'grubenv' 2>/dev/null | xargs dirname | grep -v "^$folder" | head -n1)
    [[ -n "$folder" ]] || return 0
    file_name=$(ls -1 "$folder" 2>/dev/null | grep -E '^grub.conf$|^grub.cfg$' || true)
  fi
  [[ -n "$file_name" ]] || return 0
  if [[ "$file_name" == 'grub.cfg' ]]; then
    ver='0'
  else
    ver='1'
  fi
  echo "${folder}:${file_name}:${ver}"
}

dd_low_mem() {
  local mem
  mem=$(grep '^MemTotal:' /proc/meminfo 2>/dev/null | grep -o '[0-9]*' || true)
  [[ -n "$mem" ]] || return 0
  [[ "$mem" -le 524288 ]] && return 1 || return 0
}

# 探测网卡与静态网络参数
dd_detect_network() {
  if [[ -n "$ipAddr" && -n "$ipMask" && -n "$ipGate" ]]; then
    setNet='1'
  else
    setNet='0'
  fi

  dd_dependence 'ip'
  [[ -n "$interface" ]] || interface="$(dd_get_interface)"
  [[ -n "$interface" ]] || dd_die "无法自动识别网卡，请使用 -i 指定"

  if [[ "$setNet" == '0' ]]; then
    local iaddr prefix
    iaddr=$(ip addr show dev "$interface" | grep 'inet ' | head -n1 | grep -oE '[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}')
    [[ -n "$iaddr" ]] || dd_die "无法读取 $interface 的 IPv4 地址"
    ipAddr="${iaddr%%/*}"
    prefix="${iaddr##*/}"
    ipMask="$(dd_netmask_from_prefix "$prefix")"
    ipGate=$(ip route show default | grep '^default' | grep -oE '[0-9]{1,3}(\.[0-9]{1,3}){3}' | head -n1)
  fi

  IPv4="$ipAddr"
  MASK="$ipMask"
  GATE="$ipGate"
  [[ -n "$IPv4" && -n "$MASK" && -n "$GATE" && -n "$ipDNS" ]] || dd_die "网络配置无效"
}

# 解析 CPU 架构；-v 可在非 arm 上覆盖
dd_resolve_arch() {
  case "$(uname -m)" in
    aarch64|arm64) VER='arm64' ;;
    x86|i386|i686) VER='i386' ;;
    x86_64|amd64) VER='amd64' ;;
    *) VER='' ;;
  esac

  tmpVER="$(echo "$tmpVER" | sed -r 's/(.*)/\L\1/')"
  if [[ "$VER" != 'arm64' && -n "$tmpVER" ]]; then
    case "$tmpVER" in
      i386|i686|x86|32) VER='i386' ;;
      amd64|x86_64|x64|64) VER='amd64' ;;
      *) VER='' ;;
    esac
  fi

  [[ -n "$VER" ]] || dd_die "不支持的 CPU 架构"
}

# 下载并校验 SSH 公钥，生成随机 root 密码哈希
dd_prepare_ssh_key() {
  [[ "$sshKeyURL" =~ ^https:// ]] || dd_die "必须提供以 https:// 开头的 SSH 公钥 URL（-k/--key）"

  sshKeyFile="$(mktemp /tmp/kuusei_authorized_keys.XXXXXX)" || exit 1
  chmod 600 "$sshKeyFile"
  trap 'rm -f "$sshKeyFile"' EXIT

  curl --proto '=https' --proto-redir '=https' --fail --silent --show-error --location \
    --output "$sshKeyFile" "$sshKeyURL" || dd_die "下载 SSH 公钥失败"

  sed -i '/^[[:space:]]*$/d;s/\r$//' "$sshKeyFile"
  if [[ ! -s "$sshKeyFile" ]] \
    || grep -Ev '^(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp(256|384|521)|sk-ssh-ed25519@openssh.com|sk-ecdsa-sha2-nistp256@openssh.com)[[:space:]]+[A-Za-z0-9+/]+=*([[:space:]].*)?$' "$sshKeyFile" >/dev/null \
    || ! ssh-keygen -lf "$sshKeyFile" >/dev/null 2>&1; then
    dd_die "SSH 公钥文件无效"
  fi

  local random_password
  random_password="$(openssl rand -hex 32)"
  myPASSWORD="$(openssl passwd -6 "$random_password" 2>/dev/null || openssl passwd -1 "$random_password")"
  unset random_password
  [[ -n "$myPASSWORD" ]] || dd_die "生成密码哈希失败"
}

dd_download() {
  local url="$1"
  local out="$2"
  echo "下载: $url"
  if ! wget -qO "$out" "$url"; then
    dd_die "下载失败: $url"
  fi
}

# 准备 GRUB 备份并生成待插入的菜单片段骨架
dd_prepare_grub_entry() {
  local label="$1"

  if [[ "$loaderMode" == '0' ]]; then
    [[ -f "${GRUBDIR}/${GRUBFILE}" ]] || dd_die "未找到 ${GRUBFILE}"
    [[ ! -f "${GRUBDIR}/${GRUBFILE}.old" && -f "${GRUBDIR}/${GRUBFILE}.bak" ]] \
      && mv -f "${GRUBDIR}/${GRUBFILE}.bak" "${GRUBDIR}/${GRUBFILE}.old"
    mv -f "${GRUBDIR}/${GRUBFILE}" "${GRUBDIR}/${GRUBFILE}.bak"
    if [[ -f "${GRUBDIR}/${GRUBFILE}.old" ]]; then
      cat "${GRUBDIR}/${GRUBFILE}.old" >"${GRUBDIR}/${GRUBFILE}"
    else
      cat "${GRUBDIR}/${GRUBFILE}.bak" >"${GRUBDIR}/${GRUBFILE}"
    fi
  else
    GRUBVER='-1'
    return 0
  fi

  if [[ "$GRUBVER" == '0' ]]; then
    local readgrub='/tmp/grub.read'
    local load_num cfg0 cfg1 cfg2 tmp_cfg
    cat "$GRUBDIR/$GRUBFILE" | sed -n '1h;1!H;$g;s/\n/%%%%%%%/g;$p' \
      | grep -om 1 'menuentry\ [^{]*{[^}]*}%%%%%%%' | sed 's/%%%%%%%/\n/g' >"$readgrub"
    load_num="$(grep -c 'menuentry ' "$readgrub" || true)"
    if [[ "$load_num" -eq 1 ]]; then
      sed '/^$/d' "$readgrub" >/tmp/grub.new
    elif [[ "$load_num" -gt 1 ]]; then
      cfg0="$(awk '/menuentry /{print NR}' "$readgrub" | head -n1)"
      cfg2="$(awk '/menuentry /{print NR}' "$readgrub" | head -n2 | tail -n1)"
      cfg1=''
      for tmp_cfg in $(awk '/}/{print NR}' "$readgrub"); do
        [[ "$tmp_cfg" -gt "$cfg0" && "$tmp_cfg" -lt "$cfg2" ]] && cfg1="$tmp_cfg"
      done
      [[ -n "$cfg1" ]] || dd_die "读取 GRUB 菜单失败"
      sed -n "${cfg0},${cfg1}p" "$readgrub" >/tmp/grub.new
      [[ "$(grep -c '{' /tmp/grub.new)" -eq "$(grep -c '}' /tmp/grub.new)" ]] || dd_die "GRUB 菜单结构异常"
    else
      dd_die "GRUB 中没有可用的 menuentry"
    fi
    sed -i "/menuentry.*/c\menuentry '${label}' --class gnu-linux --class gnu --class os {" /tmp/grub.new
    sed -i '/echo.*Loading/d' /tmp/grub.new
    INSERTGRUB="$(awk '/menuentry /{print NR}' "$GRUBDIR/$GRUBFILE" | head -n1)"
  elif [[ "$GRUBVER" == '1' ]]; then
    local cfg0 cfg1
    cfg0="$(awk '/title[ ]|title[\t]/{print NR}' "$GRUBDIR/$GRUBFILE" | head -n1)"
    cfg1="$(awk '/title[ ]|title[\t]/{print NR}' "$GRUBDIR/$GRUBFILE" | head -n2 | tail -n1)"
    if [[ -n "$cfg0" ]] && { [[ -z "$cfg1" || "$cfg1" == "$cfg0" ]]; }; then
      sed -n "${cfg0},\$p" "$GRUBDIR/$GRUBFILE" >/tmp/grub.new
    elif [[ -n "$cfg0" ]]; then
      sed -n "${cfg0},$((cfg1 - 1))p" "$GRUBDIR/$GRUBFILE" >/tmp/grub.new
    fi
    [[ -f /tmp/grub.new ]] || dd_die "配置旧版 GRUB 失败"
    sed -i "/title.*/c\title '${label}'" /tmp/grub.new
    sed -i '/^#/d' /tmp/grub.new
    INSERTGRUB="$(awk '/title[ ]|title[\t]/{print NR}' "$GRUBDIR/$GRUBFILE" | head -n1)"
  fi
}

# 将启动参数写入 GRUB 菜单并插入配置
dd_apply_grub_boot() {
  local boot_option="$1"
  local type linux_kernel linux_img

  [[ "$loaderMode" == '0' ]] || return 0

  if grep -E 'linux.*/|kernel.*/' /tmp/grub.new | awk '{print $2}' | tail -n1 | grep -q '^/boot/'; then
    type='InBoot'
  else
    type='NoBoot'
  fi

  linux_kernel="$(grep -E 'linux.*/|kernel.*/' /tmp/grub.new | awk '{print $1}' | head -n1)"
  [[ -n "$linux_kernel" ]] || dd_die "无法从 GRUB 读取内核指令"
  linux_img="$(grep 'initrd.*/' /tmp/grub.new | awk '{print $1}' | tail -n1)"
  if [[ -z "$linux_img" ]]; then
    sed -i "/$linux_kernel.*\//a\\\tinitrd\ \/" /tmp/grub.new
    linux_img='initrd'
  fi

  if [[ "$type" == 'InBoot' ]]; then
    sed -i "/$linux_kernel.*\//c\\\t$linux_kernel\\t/boot/vmlinuz $boot_option" /tmp/grub.new
    sed -i "/$linux_img.*\//c\\\t$linux_img\\t/boot/initrd.img" /tmp/grub.new
  else
    sed -i "/$linux_kernel.*\//c\\\t$linux_kernel\\t/vmlinuz $boot_option" /tmp/grub.new
    sed -i "/$linux_img.*\//c\\\t$linux_img\\t/initrd.img" /tmp/grub.new
  fi

  sed -i '$a\\n' /tmp/grub.new
  sed -i "${INSERTGRUB}i\\n" "$GRUBDIR/$GRUBFILE"
  sed -i "${INSERTGRUB}r /tmp/grub.new" "$GRUBDIR/$GRUBFILE"
  [[ -f "$GRUBDIR/grubenv" ]] && sed -i 's/saved_entry/#saved_entry/g' "$GRUBDIR/grubenv"
}

# 解压 initrd 到 /tmp/boot（支持 gzip / xz / lzma / zstd / 未压缩 cpio）
dd_extract_initrd() {
  local src="$1"
  local kind='gzip'
  local desc

  [[ -d /tmp/boot ]] && rm -rf /tmp/boot
  mkdir -p /tmp/boot
  cd /tmp/boot || dd_die "无法进入 /tmp/boot"

  desc="$(file -b "$src" 2>/dev/null || true)"
  if echo "$desc" | grep -qi 'cpio archive'; then
    kind='cpio'
  elif echo "$desc" | grep -qi 'xz compressed'; then
    kind='xz'
  elif echo "$desc" | grep -qi 'lzma compressed'; then
    kind='lzma'
  elif echo "$desc" | grep -qi 'zstandard\|zstd'; then
    kind='zstd'
  elif echo "$desc" | grep -qi 'gzip compressed\|compress.d data'; then
    kind='gzip'
  else
    # 魔数兜底：ASCII cpio 以 070701 开头
    if head -c 6 "$src" | grep -q '070701\|070702\|070707'; then
      kind='cpio'
    fi
  fi

  # 记录打包时是否应压缩（Ubuntu live netboot 原文件为未压缩 cpio）
  case "$kind" in
    cpio) INITRD_REPACK_COMPRESS='none' ;;
    *) INITRD_REPACK_COMPRESS='gzip' ;;
  esac

  case "$kind" in
    cpio)
      if ! (set -o pipefail; cpio --extract --verbose --make-directories --no-absolute-filenames <"$src" >/dev/null 2>&1); then
        dd_die "解压 initrd 失败（未压缩 cpio）"
      fi
      ;;
    gzip)
      if ! (set -o pipefail; gzip -d <"$src" | cpio --extract --verbose --make-directories --no-absolute-filenames >/dev/null 2>&1); then
        dd_die "解压 initrd 失败（gzip）"
      fi
      ;;
    xz)
      if ! (set -o pipefail; xz --decompress <"$src" | cpio --extract --verbose --make-directories --no-absolute-filenames >/dev/null 2>&1); then
        dd_die "解压 initrd 失败（xz）"
      fi
      ;;
    lzma)
      if ! (set -o pipefail; xz --format=lzma --decompress <"$src" | cpio --extract --verbose --make-directories --no-absolute-filenames >/dev/null 2>&1); then
        dd_die "解压 initrd 失败（lzma）"
      fi
      ;;
    zstd)
      if ! (set -o pipefail; zstd -d <"$src" | cpio --extract --verbose --make-directories --no-absolute-filenames >/dev/null 2>&1); then
        dd_die "解压 initrd 失败（zstd）"
      fi
      ;;
    *)
      dd_die "无法识别 initrd 格式: $desc"
      ;;
  esac

  # 解压结果至少应有若干文件，避免静默失败
  if [[ "$(find . -mindepth 1 | head -n 5 | wc -l | tr -d ' ')" -lt 1 ]]; then
    dd_die "解压 initrd 后目录为空（格式可能识别错误: $desc）"
  fi

  rm -f "$src"
}

dd_repack_initrd() {
  cd /tmp/boot || dd_die "无法进入 /tmp/boot"
  local compress="${INITRD_REPACK_COMPRESS:-gzip}"

  if [[ "$compress" == 'none' ]]; then
    if ! (set -o pipefail; find . | cpio -H newc --create --verbose >/tmp/initrd.img); then
      dd_die "打包 initrd 失败"
    fi
  else
    if ! (set -o pipefail; find . | cpio -H newc --create --verbose | gzip -9 >/tmp/initrd.img); then
      dd_die "打包 initrd 失败"
    fi
  fi
}

dd_finish_boot() {
  if [[ "$loaderMode" == '0' ]]; then
    cp -f /tmp/initrd.img /boot/initrd.img || dd_die "写入 /boot/initrd.img 失败"
    cp -f /tmp/vmlinuz /boot/vmlinuz || dd_die "写入 /boot/vmlinuz 失败"
    chown root:root "$GRUBDIR/$GRUBFILE"
    chmod 444 "$GRUBDIR/$GRUBFILE"
    echo "即将重启进入安装程序..."
    sleep 3
    reboot || sudo reboot >/dev/null 2>&1
  else
    rm -rf "$HOME/loader"
    mkdir -p "$HOME/loader"
    cp -f /tmp/initrd.img "$HOME/loader/initrd.img"
    cp -f /tmp/vmlinuz "$HOME/loader/vmlinuz"
    rm -f /tmp/initrd.img /tmp/vmlinuz
    echo
    ls -AR1 "$HOME/loader"
  fi
}

# 组装通用额外内核参数（不含 ---；串口由调用方追加）
dd_extra_kernel_opts() {
  local opts=''
  [[ "$setInterfaceName" == '1' ]] && opts+=' net.ifnames=0 biosdevname=0'
  [[ "$setIPv6" == '1' ]] && opts+=' ipv6.disable=1'
  dd_low_mem || opts+=' lowmem=+2'
  echo "$opts"
}

dd_console_opt() {
  [[ -n "$setConsole" ]] && echo " --- console=$setConsole" || echo ''
}

# 初始化 GRUB 路径（非 loader 模式）
dd_init_grub_paths() {
  if [[ "$loaderMode" == '0' ]]; then
    local grub
    grub="$(dd_get_grub /boot)"
    [[ -n "$grub" ]] || dd_die "未找到 GRUB，可用 --loader 仅生成文件"
    GRUBDIR="${grub%%:*}"
    local rest="${grub#*:}"
    GRUBFILE="${rest%%:*}"
    GRUBVER="${rest##*:}"
  fi
}

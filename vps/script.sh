#!/bin/bash

exit_flag=0

function print_menu() {
  while [ $exit_flag -eq 0 ]; do
    echo
    PS3="请输入需要执行的选项: "
    options=("Debian初始化" "测试脚本" "DD" "设置 SSH Key" "Trojan/VLESS 一键脚本" "Install Docker" "Install Dockge" "Install NezhaAgent" "TCP 窗口调优" "退出")
    select opt in "${options[@]}"
    do
        case $opt in
            "Debian初始化")
                init_debian
                break
                ;;
            "测试脚本")
                test_menu
                break
                ;;
            "DD")
                dd_menu
                break
                ;;
            "设置 SSH Key")
                set_ssh_key
                break
                ;;
            "Trojan/VLESS 一键脚本")
                trojan_vless_config
                break
                ;;
            "Install Docker")
                install_docker
                break
                ;;
            "Install Dockge")
                install_dockge
                break
                ;;
            "Install NezhaAgent")
                install_nezha_agent
                break
                ;;
            "TCP 窗口调优")
                tcp_window_optimization
                break
                ;;
            "退出")
                echo "DUANG~"
                exit_flag=1
                break
                ;;
            *)
                echo "无效的选项 $REPLY"
                ;;
        esac
    done
  done
}

function test_menu() {
  PS3="请选择要运行的测试脚本: "
  test_options=("YABS" "融合怪" "返回")
  select test_opt in "${test_options[@]}"
  do
      case $test_opt in
          "YABS")
              test_yabs
              break
              ;;
          "融合怪")
              test_fusion_monster
              break
              ;;
          "返回")
              break
              ;;
          *)
              echo "无效的选项 $REPLY"
              ;;
      esac
  done
}

function dd_menu() {
  PS3="请选择要运行的 dd 脚本: "
  dd_options=("Kuusei-Fork" "Teddysun" "ARM" "MoeClub" "返回")
  select dd_opt in "${dd_options[@]}"
  do
      case $dd_opt in
          "Kuusei-Fork")
              dd_kuusei
              break
              ;;
          "Teddysun")
              dd_teddysun
              break
              ;;
          "ARM")
              dd_arm
              break
              ;;
          "MoeClub")
              dd_moeclub
              break
              ;;
          "返回")
              break
              ;;
          *)
              echo "无效的选项 $REPLY"
              ;;
      esac
  done
}

# 功能: 测试: yabs
function test_yabs() {
  echo "Running yabs script..."
  curl -sL yabs.sh | bash
}

# 功能: 测试: 融合怪
function test_fusion_monster() {
  echo "Running fusion monster script..."
  curl -L https://gitlab.com/spiritysdx/za/-/raw/main/ecs.sh -o ecs.sh && chmod +x ecs.sh && bash ecs.sh
}

# 功能: dd: kuusei fork
function dd_kuusei() {
  echo "Running dd: kuusei fork script..."
  read -p "Please enter the password to use for dd Debian 12 scripts (default: default_password): " password
  password=${password:-default_password}
  read -p "Please enter the SSH port (default: 34522): " ssh_port
  ssh_port=${ssh_port:-34522}
  bash <(wget --no-check-certificate -qO- 'https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/script/dd.sh') -d 12 -v 64 -port "${ssh_port}" -p "$password"
}

# 功能: dd: teddysun
function dd_teddysun() {
  echo "Running dd: teddysun script..."
  wget -qO InstallNET.sh https://github.com/teddysun/across/raw/master/InstallNET.sh && bash InstallNET.sh
}

# 功能: dd: arm leitbogioro
function dd_arm() {
  echo "Running dd: arm leitbogioro script..."
  wget --no-check-certificate -qO InstallNET.sh 'https://raw.githubusercontent.com/leitbogioro/Tools/master/Linux_reinstall/InstallNET.sh' && chmod a+x InstallNET.sh && bash InstallNET.sh -debian
}

# 功能: dd: MoeClub
function dd_moeclub() {
  echo "Running dd: MoeClub script..."
  read -p "Please enter the password to use for dd Debian 12 scripts (default: default_password): " password
  password=${password:-default_password}
  read -p "Please enter the SSH port (default: 34522): " ssh_port
  ssh_port=${ssh_port:-34522}
  bash <(wget --no-check-certificate -qO- 'https://raw.githubusercontent.com/MoeClub/Note/master/InstallNET.sh') -u 12 -v 64 -p "$password" -port "${ssh_port}" -a
}

# 功能: Debian 初始化
function init_debian() {
  echo "Initializing Debian..."
  apt update -y && apt upgrade -y
  apt install sudo curl wget vim tmux git rsync htop systemd-timesyncd -y
  timedatectl set-ntp true
  
  echo "Installing croc..."
  curl https://getcroc.schollz.com | bash
}

# 功能: set ssh key
function set_ssh_key() {
  echo "设置 SSH 密钥..."
  
  # 使用提供的 URL 或提示用户输入
  if [ -z "$ssh_key_url" ]; then
    read -p "请输入 SSH 密钥 URL (必须以 http:// 或 https:// 开头): " ssh_key_url
    while [[ ! "$ssh_key_url" =~ ^https?:// ]]; do
      echo "无效的 URL。请确保 URL 以 http:// 或 https:// 开头。"
      read -p "请输入 SSH 密钥 URL (必须以 http:// 或 https:// 开头): " ssh_key_url
    done
  fi

  read -p "请输入 SSH 端口 (默认: 34522): " ssh_port
  ssh_port=${ssh_port:-34522}
  bash <(curl -fsSL 'https://link.kuusei.moe/set-ssh-key') -o -d -p "$ssh_port" -u "$ssh_key_url"

  echo "SSH 密钥设置完成。"
  cat /root/.ssh/authorized_keys
}

# 功能: trojan/vless config
function trojan_vless_config() {
  echo "Configuring Proxy Service..."

  # Create necessary directories
  proxy_dir="/home/dockge/docker/proxy"
  mkdir -p "$proxy_dir"

  # Download configuration files
  base_url="https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/proxy"
  files=(
    "docker-compose.yml"
    "index.html"
    "trojan.json"
  )

  for file in "${files[@]}"; do
    if wget -q -O "$proxy_dir/$file" "$base_url/$file"; then
      echo "✓ Successfully downloaded $file"
    else
      echo "✗ Failed to download $file"
      exit 1
    fi
  done

  # Get configuration information
  read -p "Enter your domain: " domain_name
  domain_name=${domain_name:-"example.com"}
  # Generate random password
  trojan_password=$(openssl rand -base64 16)
  echo "Generated random password: $trojan_password"

  # Create and update environment file
  env_file="$proxy_dir/.env"
  if [ ! -f "$env_file" ]; then
    touch "$env_file"
  fi

  # Update environment variables
  sed -i "/^host=/d" "$env_file"
  echo "host=$domain_name" >> "$env_file"

  # Update trojan configuration
  sed -i "s/<password>/$trojan_password/g" "$proxy_dir/trojan.json"

  # Start services
  cd "$proxy_dir" && docker compose up -d

  echo "--------------------"
  echo "Installation completed!"
  echo "Domain: $domain_name"
  echo "Password: $trojan_password"
  echo "--------------------"
  echo "Please ensure:"
  echo "1. Domain is correctly pointed to the server"
  echo "2. Traefik service is properly configured and running"
  echo "3. Wait for certificate to be automatically issued"
}

# 功能: docker 安装
function install_docker() {
  echo "Installing Docker..."
  sudo apt-get update
  sudo apt-get install ca-certificates curl -y
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc

  echo "Adding Docker repository..."
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update

  sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin -y
}

# 功能: dockge 安装
function install_dockge() {
  echo "Installing dockge..."

  # 检查并创建目录
  dockge_dir="/home/dockge"
  mkdir -p "$dockge_dir"

  wget -O "$dockge_dir/docker-compose.yml" https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/dockge/docker-compose.yml

  read -p "Please enter your email (default: user@example.com): " email
  email=${email:-user@example.com}
  read -p "Please enter the dockge host (default: localhost): " dockgeHost
  dockgeHost=${dockgeHost:-localhost}

  env_file="$dockge_dir/.env"
  if [ ! -f "$env_file" ]; then
    touch "$env_file"
  fi
  sed -i "/^EMAIL=/d" "$env_file"
  echo "EMAIL=$email" >> "$env_file"
  sed -i "/^DOCKGE_HOST=/d" "$env_file"
  echo "DOCKGE_HOST=$dockgeHost" >> "$env_file"

  docker compose -f "$dockge_dir/docker-compose.yml" up -d
}

# 功能: nezha-agent 安装
function install_nezha_agent() {
  echo "Installing nezha-agent..."

  if ! command -v uuidgen &> /dev/null; then
    echo "Installing uuid-runtime..."
    apt-get update && apt-get install -y uuid-runtime
  fi

  nezha_agent_dir="/home/dockge/docker/nezha-agent"
  mkdir -p "$nezha_agent_dir"

  wget -O "$nezha_agent_dir/docker-compose.yml" https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/nezha-agent/docker-compose.yml

  read -p "Please enter the dashboard domain: " dashboard_domain
  dashboard_domain=${dashboard_domain:-"localhost"}
  read -p "Please enter the secret: " secret
  
  generated_uuid=$(uuidgen)
  echo "Generated UUID: $generated_uuid"

  env_file="$nezha_agent_dir/.env"
  if [ ! -f "$env_file" ]; then
    touch "$env_file"
  fi
  sed -i "/^DASHBOARD_DOMAIN=/d" "$env_file"
  echo "DASHBOARD_DOMAIN=$dashboard_domain" >> "$env_file"
  sed -i "/^SECRET=/d" "$env_file"
  echo "SECRET=$secret" >> "$env_file"
  sed -i "/^UUID=/d" "$env_file"
  echo "UUID=$generated_uuid" >> "$env_file"

  docker compose -f "$nezha_agent_dir/docker-compose.yml" up -d
}

# 功能: tcp 窗口调优
tcp_window_optimization() {
  echo "Optimizing TCP window settings..."

  # 删除已有的相关配置（如果存在）
  sudo sed -i '/net.core.default_qdisc/d' /etc/sysctl.conf
  sudo sed -i '/net.ipv4.tcp_congestion_control/d' /etc/sysctl.conf
  sudo sed -i '/net.ipv4.tcp_rmem/d' /etc/sysctl.conf
  sudo sed -i '/net.ipv4.tcp_wmem/d' /etc/sysctl.conf
  sudo sed -i '/net.ipv4.tcp_window_scaling/d' /etc/sysctl.conf
  sudo sed -i '/net.ipv4.tcp_adv_win_scale/d' /etc/sysctl.conf
  sudo sed -i '/net.ipv4.tcp_notsent_lowat/d' /etc/sysctl.conf
  sudo sed -i '/net.ipv4.tcp_slow_start_after_idle/d' /etc/sysctl.conf

  # 追加新的配置
  echo "net.core.default_qdisc = cake" | sudo tee -a /etc/sysctl.conf
  echo "net.ipv4.tcp_congestion_control = bbr" | sudo tee -a /etc/sysctl.conf
  echo "net.ipv4.tcp_rmem = 8192 262144 67108864" | sudo tee -a /etc/sysctl.conf
  echo "net.ipv4.tcp_wmem = 4096 16384 67108864" | sudo tee -a /etc/sysctl.conf
  echo "net.ipv4.tcp_window_scaling = 1" | sudo tee -a /etc/sysctl.conf
  echo "net.ipv4.tcp_adv_win_scale = -2" | sudo tee -a /etc/sysctl.conf
  echo "net.ipv4.tcp_notsent_lowat = 131072" | sudo tee -a /etc/sysctl.conf
  echo "net.ipv4.tcp_slow_start_after_idle = 0" | sudo tee -a /etc/sysctl.conf

  echo "Running sysctl -p..."
  # 应用配置
  sudo sysctl -p
}

# 功能: 脚本启动和参数处理
function start_script() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      -x)
        init_debian
        shift
        ;;
      --key)
        ssh_key_url="$2"
        shift 2
        ;;
      *)
        echo "无效的选项: $1"
        exit 1
        ;;
    esac
  done

  # 显示菜单
  print_menu
}

# 主脚本执行
start_script "$@"

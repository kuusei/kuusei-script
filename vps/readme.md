# script

## 测试脚本

```shell
# 融合怪
curl -L https://gitlab.com/spiritysdx/za/-/raw/main/ecs.sh -o ecs.sh && chmod +x ecs.sh && bash ecs.sh
# yabs
curl -sL yabs.sh | bash
```

## dd debian 12

```shell
bash <(wget --no-check-certificate -qO- 'https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/script/dd.sh') -d 12 -v 64 -port "34522" -p "<password>"
# 如果dd不上去可以换, 默认密码 MoeClub.org
wget -qO InstallNET.sh https://github.com/teddysun/across/raw/master/InstallNET.sh && bash InstallNET.sh
# ARM DD
wget --no-check-certificate -qO InstallNET.sh 'https://raw.githubusercontent.com/leitbogioro/Tools/master/Linux_reinstall/InstallNET.sh' && chmod a+x InstallNET.sh && bash InstallNET.sh -debian
bash <(wget --no-check-certificate -qO- 'https://raw.githubusercontent.com/MoeClub/Note/master/InstallNET.sh') -u 20.04 -v 64 -p "<password>" -port 22 -a
# dd 后需要使用 ssh-keygen -R ip 来重置
# dd 后使用 -o PreferredAuthentications=password 强制进行密码链接
# 可以使用 cat /etc/issue 查看版本号
```

## init debian

```shell
apt update -y && apt upgrade -y && apt install sudo curl wget vim tmux git rsync htop -y
curl https://getcroc.schollz.com | bash
```

## set ssh key

```shell
# 禁用密码登录, 修改端口
# 注意也会修改端口号, 对于有防火墙的vps, 需要放行
bash <(curl -fsSL 'https://link.kuusei.moe/set-ssh-key') -o -d -p 34522 -u https://link.kuusei.moe/ssh-key
```

## trojan/vless config

```shell
wget -P /root -N --no-check-certificate "https://raw.githubusercontent.com/mack-a/v2ray-agent/master/install.sh" && chmod 700 /root/install.sh && /root/install.sh
```

## docker 安装

```shell
sudo apt-get update
sudo apt-get install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update

sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

## 文件传输&通用 dockge 文件夹

```shell
curl https://getcroc.schollz.com | bash

# 发送文件使用
croc send <path>

# dockge 文件夹
mkdir /home/dockge
cd /home/dockge
wget https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/dockge/docker-compose.yml
wget https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/dockge/.env
mkdir ./docker
mkdir ./docker/nezha-agent
cd ./docker/nezha-agent
wget https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/nezha-agent/docker-compose.yml
wget https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/nezha-agent/.env
cd ../../
```

## tcp 窗口调优

```shell
net.ipv4.tcp_window_scaling = 1
net.core.rmem_max = 33554432
net.core.wmem_max = 33554432
net.ipv4.tcp_rmem = 4096 131072 33554432
net.ipv4.tcp_wmem = 4096 16384 33554432

# 将这个写入 /etc/sysctl.conf, 然后
sysctl -p
```
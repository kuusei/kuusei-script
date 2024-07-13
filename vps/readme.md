# script

## dd debian 12

```shell
bash <(wget --no-check-certificate -qO- 'https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/script/dd.sh') -d 12 -v 64 -port "22" -p "PASSWORD"
# 如果dd不上去可以换, 默认密码 MoeClub.org
wget -qO InstallNET.sh https://github.com/teddysun/across/raw/master/InstallNET.sh && bash InstallNET.sh
# dd 后需要使用 ssh-keygen -R ip 来重置
# dd 后使用 -o PreferredAuthentications=password 强制进行密码链接
# 可以使用 cat /etc/issue 查看版本号
```

## init debian

```shell
apt update && apt upgrade && apt install sudo curl wget vim tmux -y
```

## set ssh key

```shell
# 禁用密码登录, 修改端口
# 注意也会修改端口号, 对于有防火墙的vps, 需要放行
bash <(curl -fsSL 'https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/script/key.sh') -o -d -p 34522 -u https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/key.pub
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
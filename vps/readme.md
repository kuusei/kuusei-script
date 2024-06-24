# script

## dd debian 12

```shell
bash <(wget --no-check-certificate -qO- 'https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/script/dd.sh') -d 12 -v 64 -port "22" -p "PASSWORD"
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

## trojan-go config

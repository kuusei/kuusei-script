# dd debian 12

```shell
bash <(wget --no-check-certificate -qO- 'https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/script/dd.sh') -d 12 -v 64 port "22" -p "PASSWORD"
```

## set ssh key

```shell
# 禁用密码登录, 修改端口, 
bash <(curl -fsSL git.io/key.sh) -o -p 34522 -u https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/key.pub
bash <(curl -fsSL git.io/key.sh) -o -d -p 34522 -u https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/key.pub
```

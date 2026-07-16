## 多功能一键脚本

此脚本绝大部分情况下只能在 Debian / Ubuntu 使用, 不建议其他系统使用
```shell
bash <(curl -sL -H 'Cache-Control: no-cache' https://link.kuusei.moe/vps-script)
```
对于全新机器, 可以直接安装 bash 并启动自动安装模式
```shell
bash <(curl -sL -H 'Cache-Control: no-cache' https://link.kuusei.moe/vps-script) -x
# or
apt-get update && apt install curl -y && bash <(curl -sL -H 'Cache-Control: no-cache' https://link.kuusei.moe/vps-script) -x
```

也可单独运行系统初始化脚本:
```shell
bash <(curl -fsSL -H 'Cache-Control: no-cache' https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/script/init.sh)
# Ubuntu Pro（可选）
bash <(curl -fsSL -H 'Cache-Control: no-cache' https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/script/init.sh) --pro <token>
```

| 参数    | 功能                                                         | 示例                                  |
|---------|--------------------------------------------------------------|---------------------------------------|
| `-x`    | 直接执行 Debian / Ubuntu 系统初始化                      |                                     |
| `--key` | 指定 SSH 密钥的 HTTPS URL；设置密钥或 DD 时直接复用  | `--key https://example.com/ssh-key` |
| `--pro` | Ubuntu Pro token；仅 Ubuntu 初始化时生效，Debian 忽略   | `--pro <token>` |

- **`--key`** 参数的 URL 需要以 `https://` 开头。
- **`--pro`** 仅 Ubuntu 使用；未提供时初始化过程中可交互输入，回车跳过。

## DD 网络重装

脚本已拆分为 `vps/script/dd/`：

| 文件 | 作用 |
|------|------|
| `main.sh` | 入口与参数解析 |
| `common.sh` | 网络 / GRUB / SSH 公钥等共用逻辑 |
| `debian.sh` | Debian 12/13（debian-installer + preseed） |
| `ubuntu.sh` | Ubuntu 24.04/26.04（live netboot + autoinstall） |

```shell
# 默认推荐：Ubuntu 26.04
bash <(curl -fsSL -H 'Cache-Control: no-cache' https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/script/dd/main.sh) \
  -u 26.04 -v 64 -port 34522 --key https://example.com/key.pub

# Debian 13
bash <(curl -fsSL -H 'Cache-Control: no-cache' https://raw.githubusercontent.com/kuusei/kuusei-script/main/vps/script/dd/main.sh) \
  -d 13 -v 64 -port 34522 --key https://example.com/key.pub
```

### 支持矩阵

| 系统 | 版本 | amd64 | arm64 | i386 |
|------|------|-------|-------|------|
| Ubuntu | 24.04 / 26.04 | 是 | 是 | 否 |
| Debian | 12 | 是 | 是 | 是 |
| Debian | 13 | 是 | 是 | 否 |

重装后仅允许 SSH 公钥登录（密码登录关闭）。`--key` 必须是 HTTPS 公钥地址。

Ubuntu 使用官方 Subiquity **autoinstall + NoCloud**：
- 默认：官方 netboot 内核/initrd 原样下载，仅追加 `cidata` 种子
- 可选：`--seed-url https://example.com/seed/`（目录下需有 `user-data`、`meta-data`），完全不改 initrd

## 关于推荐的构建方式
使用这种方式能够构建跨平台镜像, 但是性能也差一些, 注意机器使用

```shell
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 -t --load <name> .
```

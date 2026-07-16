## 多功能一键脚本

此脚本绝大部分情况下只能在 Debian / Ubuntu 使用, 不建议其他系统使用。

推荐用 jsDelivr（GitHub raw CDN 常缓存旧文件，会导致 `--pro` 等修复不生效）:
```shell
bash <(curl -fsSL https://cdn.jsdelivr.net/gh/kuusei/kuusei-script@main/vps/script.sh)
```
短链（可能仍指向会被缓存的 raw 地址）:
```shell
bash <(curl -sL -H 'Cache-Control: no-cache' https://link.kuusei.moe/vps-script)
```

对于全新机器, 可以直接启动自动初始化:
```shell
bash <(curl -fsSL https://cdn.jsdelivr.net/gh/kuusei/kuusei-script@main/vps/script.sh) -x
# or
apt-get update && apt install curl -y && \
  bash <(curl -fsSL https://cdn.jsdelivr.net/gh/kuusei/kuusei-script@main/vps/script.sh) -x
```

也可单独运行系统初始化脚本:
```shell
bash <(curl -fsSL https://cdn.jsdelivr.net/gh/kuusei/kuusei-script@main/vps/script/init.sh)
# Ubuntu Pro（可选）
bash <(curl -fsSL https://cdn.jsdelivr.net/gh/kuusei/kuusei-script@main/vps/script/init.sh) --pro <token>
```

| 参数    | 功能                                                         | 示例                                  |
|---------|--------------------------------------------------------------|---------------------------------------|
| `-x`    | 解析完所有参数后执行系统初始化并退出            | `-x --pro <token>`                  |
| `--key` | 指定 SSH 密钥的 HTTPS URL；设置密钥或 DD 时直接复用  | `--key https://example.com/ssh-key` |
| `--pro` | Ubuntu Pro token；仅 Ubuntu 初始化时生效，Debian 忽略   | `--pro <token>` |

示例（参数顺序无关；成功时应先看到「已预填 Ubuntu Pro token」）:
```shell
bash <(curl -fsSL https://cdn.jsdelivr.net/gh/kuusei/kuusei-script@main/vps/script.sh) \
  -x --key https://link.kuusei.moe/ssh-key --pro <token>
```

- **`--key`** 参数的 URL 需要以 `https://` 开头。
- **`--pro`** 仅 Ubuntu 使用；未提供时初始化过程中可交互输入，回车跳过。

## DD 网络重装

DD 入口是薄封装，实际安装委托给 [bin456789/reinstall](https://github.com/bin456789/reinstall)（Alpine 中转 / cloud image 等）。本仓库只负责选择发行版，并注入 SSH 公钥与端口。

```shell
# Ubuntu 26.04
bash <(curl -fsSL https://cdn.jsdelivr.net/gh/kuusei/kuusei-script@main/vps/script/dd/main.sh) \
  -u 26.04 -port 34522 --key https://example.com/key.pub

# Debian 13
bash <(curl -fsSL https://cdn.jsdelivr.net/gh/kuusei/kuusei-script@main/vps/script/dd/main.sh) \
  -d 13 -port 34522 --key https://example.com/key.pub
```

- `-k/--key`：SSH 公钥 HTTPS URL（也支持 `github:user` 等 reinstall 接受的格式）
- `-port/--ssh-port`：重装后 SSH 端口
- 固定以 `root` 用户安装；有公钥时不会再交互询问密码
- 版本/架构支持以 upstream reinstall 为准；脚本跑完后按提示手动重启

## 关于推荐的构建方式
使用这种方式能够构建跨平台镜像, 但是性能也差一些, 注意机器使用

```shell
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 -t --load <name> .
```

## 多功能一键脚本

此脚本绝大部分情况下只能在 Debian 使用, 不建议其他系统使用
```shell
bash <(curl -sL https://link.kuusei.moe/vps-script)
```
对于全新机器, 可以直接安装 bash 并启动自动安装模式
```shell
bash <(curl -sL https://link.kuusei.moe/vps-script) -x
# or
apt-get update && apt install curl -y && bash <(curl -sL https://link.kuusei.moe/vps-script) -x
```

| 参数    | 功能                                                         | 示例                                  |
|---------|--------------------------------------------------------------|---------------------------------------|
| `-x`    | 直接执行初始化 Debian 功能                              |                                     |
| `--key` | 指定 SSH 密钥的 URL; 如果未提供，则后续将提示输入有效的 URL  | `--key https://example.com/ssh-key` |

- **`--key`** 参数的 URL 需要以 `http://` 或 `https://` 开头。

## 关于推荐的构建方式
使用这种方式能够构建跨平台镜像, 但是性能也差一些, 注意机器使用

```shell
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 -t --load <name> .
```
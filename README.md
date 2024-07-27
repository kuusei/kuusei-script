## 多功能一键脚本

此脚本绝大部分情况下只能在 Debian 使用, 不建议其他系统使用
```shell
bash <(curl -sL https://link.kuusei.moe/vps-script)
```

## 关于推荐的构建方式
使用这种方式能够构建跨平台镜像, 但是性能也差一些, 注意机器使用

```shell
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 -t --load <name> .
```
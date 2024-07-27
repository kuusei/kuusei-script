## 关于推荐的构建方式
使用这种方式能够构建跨平台镜像, 但是性能也差一些, 注意机器使用

```shell
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 -t --load <name> .
```
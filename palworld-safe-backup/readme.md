# palworld 安全备份 docker

代码: https://github.com/kuusei/kuusei-script/tree/main/palworld-safe-backup

!本工具不会对原始文件进行任何修改, 程序内也不包含任何删除代码, 程序使用 rcon 提前保存的方式确保备份的文件是完整的

!!一定要对 backup 文件夹进行映射, 否则所有备份都可能会丢失

!!!第一次备份完成后, 强烈建议手动解压一下查看备份文件是否完整

使用样例:
docker run -v ./saved:/palworld/saved -v ./backup:/palworld/backup -e RCON_IP=YOUR_IP -e ADMIN_PASSWORD="YOUR_PASSWORD" palworld-save-backup

| 映射文件夹  | 映射路径             | 说明                                                                                                    |
|--------|------------------|-------------------------------------------------------------------------------------------------------|
| saved  | /palworld/saved  | 帕鲁的游戏存档文件夹, 文件夹内应当有 SaveGames, Config 等文件夹, 注意不要映射 SaveGames 文件夹. 也可以备份其他文件夹, 但注意不要备份游戏文件, 否则磁盘很快就要满了 |
| backup | /palworld/backup | 备份的存档文件夹, 文件夹内应当是空的.

| 变量                     | 默认值          | 说明                                                          |
|------------------------|--------------|-------------------------------------------------------------|
| RCON_IP                |              | 你游戏服务器的 Rcon 地址(含端口号), 如果 docker 和 服务器在同一服务器, 直接填本机 ip:port |
| ADMIN_PASSWORD         |              | Rcon 管理密码                                                   |
| BACKUP_CRON_EXPRESSION | */15 * * * * | 备份间隔, 使用 cron 配置, 默认为 15分钟一备份
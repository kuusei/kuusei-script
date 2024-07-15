DATE=$(date +%Y%m%d_%H%M%S)
TIME=$(date +%H-%M-%S)

echo ">>> Creating backup"
echo "> Sending message to gameserver"

rconcli "broadcast $TIME-Backup_in_progress"
sleep 1
rconcli 'broadcast Saving...'
rconcli 'save'
rconcli 'broadcast Done...'
sleep 15

cd ./saved
tar cfz ../backup/saved-$DATE.tar.gz ./

echo ">>> Done"


function startMain() {
    sed -i "s/###RCON_IP###/$RCON_IP/" ./rcon.yaml
    sed -i "s/###ADMIN_PASSWORD###/$ADMIN_PASSWORD/" ./rcon.yaml

    echo "$BACKUP_CRON_EXPRESSION sh ./backupmanager.sh" >> cronlist
    /usr/local/bin/supercronic cronlist &
}

startMain

wait
#!/bin/bash

show_help() {
  echo "Usage: $0 [options]"
  echo
  echo "Options:"
  echo "  --from <source_directory>        Specify the source directory to back up"
  echo "  --backup <backup_directory>      Specify the directory to store backups"
  echo "  --cron <cron_schedule>           Specify the cron job schedule (default: '0 2 * * *')"
  echo "  --age-recipient <age_key_url>    Specify the URL to download the age public key"
  echo "  -h, --help                       Show this help message and exit"
}

SOURCE_DIR=""
BACKUP_DIR=""
BACKUP_SCRIPT="/usr/local/bin/backup.sh"
CRON_JOB="30 2,8,14,20 * * *"
AGE_KEY_URL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --from)
      SOURCE_DIR="$2"
      shift 2
      ;;
    --backup)
      BACKUP_DIR="$2"
      shift 2
      ;;
    --cron)
      CRON_JOB="$2"
      shift 2
      ;;
    --age-recipient)
      AGE_KEY_URL="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      echo "Invalid option: $1"
      show_help
      exit 1
      ;;
  esac
done

if [ -z "$SOURCE_DIR" ]; then
  read -p "Enter the source directory to back up: " SOURCE_DIR
fi

if [ -z "$BACKUP_DIR" ]; then
  read -p "Enter the backup directory to store backups: " BACKUP_DIR
fi

if [ -z "$AGE_KEY_URL" ]; then
  read -p "Enter the URL to download the age public key: " AGE_KEY_URL
fi

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Source directory does not exist. Please create it first."
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# Remove existing cron job if it exists
existing_crontab=$(crontab -l 2>/dev/null)
if [ -n "$existing_crontab" ]; then
  echo "$existing_crontab" | grep -v "$BACKUP_SCRIPT" | crontab -
  echo "Removed all existing cron jobs for $BACKUP_SCRIPT."
fi

cat << EOF > "$BACKUP_SCRIPT"
#!/bin/bash

SOURCE_DIR="$SOURCE_DIR"
BACKUP_DIR="$BACKUP_DIR"
TIMESTAMP=\$(date +'%Y%m%d%H%M%S')
BACKUP_FILE="backup_\${TIMESTAMP}.tar.gz"
ENCRYPTED_FILE="backup_\${TIMESTAMP}.tar.gz.age"
AGE_KEY_URL="$AGE_KEY_URL"

tar -czf "\$BACKUP_DIR/\$BACKUP_FILE" -C "\$SOURCE_DIR" .

if [[ \$? -eq 0 ]]; then
  echo "Backup successful: \$BACKUP_DIR/\$BACKUP_FILE"
  curl -sL "\$AGE_KEY_URL" -o /tmp/age-key.pub
  age -R /tmp/age-key.pub -o "\$BACKUP_DIR/\$ENCRYPTED_FILE" "\$BACKUP_DIR/\$BACKUP_FILE"
  
  if [[ \$? -eq 0 ]]; then
    echo "Encryption successful: \$BACKUP_DIR/\$ENCRYPTED_FILE"
    rm "\$BACKUP_DIR/\$BACKUP_FILE"
  else
    echo "Encryption failed"
  fi
else
  echo "Backup failed"
fi
EOF

chmod +x "$BACKUP_SCRIPT"

"$BACKUP_SCRIPT"

(crontab -l 2>/dev/null; echo "$CRON_JOB $BACKUP_SCRIPT") | crontab -

echo "Backup script and crontab job have been set up."
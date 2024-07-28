#!/bin/bash

show_help() {
  echo "Usage: $0 [options]"
  echo
  echo "Options:"
  echo "  --from <source_directory>        Specify the source directory to back up"
  echo "  --backup <backup_directory>      Specify the directory to store backups"
  echo "  --cron <cron_schedule>           Specify the cron job schedule (default: '30 2,8,14,20 * * *')"
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

if ! command -v age &> /dev/null; then
  echo "age is not installed. Attempting to install..."
  
  if command -v apt-get &> /dev/null; then
    . /etc/os-release
    if [[ "$VERSION_ID" == "11" || "$VERSION_ID" < "11" ]]; then
      echo "Debian 11 or earlier detected. Adding bullseye-backports repository..."
      echo "deb http://deb.debian.org/debian bullseye-backports main" | sudo tee -a /etc/apt/sources.list.d/bullseye-backports.list
      sudo apt-get update
      sudo apt-get install -y -t bullseye-backports age
    else
      sudo apt-get update
      sudo apt-get install -y age
    fi
  elif command -v yum &> /dev/null; then
    sudo yum install -y age
  else
    echo "Package manager not found. Please install age manually."
    exit 1
  fi
  
  if ! command -v age &> /dev/null; then
    echo "Failed to install age. Exiting."
    exit 1
  fi
  
  echo "age installed successfully."
fi

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
LOG_FILE="\$BACKUP_DIR/backup.log"

log() {
  echo "\$(date +'%Y-%m-%d %H:%M:%S') - \$1" >> "\$LOG_FILE"
}

tar -czf "\$BACKUP_DIR/\$BACKUP_FILE" -C "\$SOURCE_DIR" . &>> "\$LOG_FILE"

if [[ \$? -eq 0 ]]; then
  log "Backup successful: \$BACKUP_DIR/\$BACKUP_FILE"
  curl -sL "\$AGE_KEY_URL" -o /tmp/age-key.pub &>> "\$LOG_FILE"
  age -R /tmp/age-key.pub -o "\$BACKUP_DIR/\$ENCRYPTED_FILE" "\$BACKUP_DIR/\$BACKUP_FILE" &>> "\$LOG_FILE"
  
  if [[ \$? -eq 0 ]]; then
    log "Encryption successful: \$BACKUP_DIR/\$ENCRYPTED_FILE"
    rm "\$BACKUP_DIR/\$BACKUP_FILE"
  else
    log "Encryption failed"
    exit 1
  fi
else
  log "Backup failed"
  exit 1
fi

find "\$BACKUP_DIR" -name "backup_*.tar.gz" -exec rm {} \;
EOF

chmod +x "$BACKUP_SCRIPT"

"$BACKUP_SCRIPT"

if [[ $? -ne 0 ]]; then
  echo "Backup script execution failed. Please check the log file at ${BACKUP_DIR}/backup.log for details."
  exit 1
else
  echo "Backup script executed successfully."
fi

(crontab -l 2>/dev/null; echo "$CRON_JOB $BACKUP_SCRIPT") | crontab -

echo "Backup crontab job have been set up."
#!/bin/bash

ENCRYPTED_FILE=""
DECRYPTED_FILE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    -i|--input)
      ENCRYPTED_FILE="$2"
      shift 2
      ;;
    -o|--output)
      DECRYPTED_FILE="$2"
      shift 2
      ;;
    *)
      echo "Invalid option: $1"
      echo "Usage: $0 [-i input_file] [-o output_file]"
      exit 1
      ;;
  esac
done

if [[ -z "$ENCRYPTED_FILE" ]]; then
  read -p "Please enter the path to the encrypted file: " ENCRYPTED_FILE
fi

if [[ -z "$DECRYPTED_FILE" ]]; then
  read -p "Please enter the path to the output decrypted file: " DECRYPTED_FILE
fi

SSH_KEY=$(op item get "VPS Encrypt" --fields label="private key" --reveal)

if [[ -z "$SSH_KEY" ]]; then
  echo "Failed to retrieve SSH key from 1Password"
  exit 1
fi

SSH_KEY=$(echo "$SSH_KEY" | sed 's/^"+//' | sed 's/"$//' | sed 's/\\n/\n/g' | sed '/^$/d')

TEMP_KEY_FILE=$(mktemp /tmp/temp_id_ed25519.XXXXXX)
echo "$SSH_KEY" > "$TEMP_KEY_FILE"
chmod 600 "$TEMP_KEY_FILE"

age -d -i "$TEMP_KEY_FILE" -o "$DECRYPTED_FILE" "$ENCRYPTED_FILE"

if [[ $? -eq 0 ]]; then
  echo "Decryption successful. Decrypted file saved to $DECRYPTED_FILE"
else
  echo "Decryption failed"
fi

rm "$TEMP_KEY_FILE"

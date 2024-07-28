详细说明见 https://kuusei.moe/post/20240728051924

## backup

```
bash <(curl -sL https://link.kuusei.moe/encrypt-backup) --from <source_directory> --backup <backup_directory> --age-recipient <age_key_url>
```

## decrypt

```
age -d -i ~/.ssh/id_ed25519 -o /path/to/decrypted_file /path/to/encrypted_file
# by 1password
bash <(curl -sL https://link.kuusei.moe/encrypt-decrypt) -i /path/to/encrypted_file -o /path/to/decrypted_file -k "private_key"
```
# Get the list of folders from dp and od
dpFolders=$(rclone lsf dp: --dirs-only)
# echo -e "dpFolders: \n$dpFolders \n"
odFolders=$(rclone lsf od: --dirs-only)
# echo -e "odFolders: \n$odFolders \n"

IFS=$'\n' read -r -d '' -a dpFoldersArray <<< "$dpFolders"
IFS=$'\n' read -r -d '' -a odFoldersArray <<< "$odFolders"

# Common
commonFolders=()
for dpFolder in "${dpFoldersArray[@]}"; do
    for odFolder in "${odFoldersArray[@]}"; do
        if [[ "$dpFolder" == "$odFolder" ]]; then
            commonFolders+=("$dpFolder")
            break
        fi
    done
done

# Output the contents of commonFolders
echo "commonFolders:"
for folder in "${commonFolders[@]}"; do
    echo "$folder"
done

# Sync common folders excluding GameTools
for folder in "${commonFolders[@]}"; do
    echo -e "\nSync of $folder from dp to od"
    # syncDetails=$(rclone sync dp:"$folder" od:"$folder" --dry-run -v --exclude "/GameTools/**")
    syncDetails=$(rclone sync dp:"$folder" od:"$folder" -v --exclude "/GameTools/**")
    echo "$syncDetails"
done
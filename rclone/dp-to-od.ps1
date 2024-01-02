$Env:http_proxy="http://127.0.0.1:7890";$Env:https_proxy="http://127.0.0.1:7890"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$dpFolders = rclone lsf dp: --dirs-only
$odFolders = rclone lsf od: --dirs-only
$commonFolders = $dpFolders | Where-Object { $odFolders -contains $_ }
foreach ($folder in $commonFolders) {
    Write-Host "Sync of $folder from dp to od"
    # $syncDetails = rclone sync dp:$folder od:$folder --dry-run -v --exclude "/GameTools/**"
    $syncDetails = rclone sync dp:$folder od:$folder -v --exclude "/GameTools/**"
    Write-Host $syncDetails
}
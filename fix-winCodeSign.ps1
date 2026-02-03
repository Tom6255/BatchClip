# Workaround script to extract winCodeSign without symlinks
# This script manually extracts the winCodeSign archive and skips symlink creation

$cachePath = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
$archiveUrl = "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z"

Write-Host "Creating workaround for winCodeSign symlink issue..."

# Create cache directory if it doesn't exist
if (-not (Test-Path $cachePath)) {
    New-Item -ItemType Directory -Path $cachePath -Force | Out-Null
}

# Download the archive
$archivePath = Join-Path $cachePath "winCodeSign-2.6.0.7z"
Write-Host "Downloading winCodeSign archive..."
Invoke-WebRequest -Uri $archiveUrl -OutFile $archivePath -UseBasicParsing

# Extract using 7zip with -snl flag to skip symlinks
$sevenZipPath = Join-Path $PSScriptRoot "node_modules\7zip-bin\win\x64\7za.exe"
if (Test-Path $sevenZipPath) {
    $extractPath = Join-Path $cachePath "workaround"
    New-Item -ItemType Directory -Path $extractPath -Force | Out-Null
    
    Write-Host "Extracting archive (skipping symlinks)..."
    & $sevenZipPath x -bd -snl $archivePath "-o$extractPath" | Out-Null
    
    Write-Host "Workaround completed. You can now try building again."
} else {
    Write-Host "7zip not found. Please run this script from the project root directory."
}

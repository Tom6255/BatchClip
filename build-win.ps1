# PowerShell script to build Windows version with proper environment variables
# This script works around the winCodeSign symlink issue by running as administrator

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "This script needs administrator privileges to create symlinks."
    Write-Host "Please run PowerShell as Administrator and try again."
    Write-Host "Alternatively, you can try: npm run build:win"
    exit 1
}

$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$env:WIN_CERT_FILE = ""
$env:SKIP_NOTARIZATION = "true"

# Clear winCodeSign cache to avoid symlink issues
$cachePath = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
if (Test-Path $cachePath) {
    Write-Host "Clearing winCodeSign cache..."
    Remove-Item -Path $cachePath -Recurse -Force -ErrorAction SilentlyContinue
}

# Run TypeScript compilation
Write-Host "Running TypeScript compilation..."
npm run --if-present tsc
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript compilation failed!"
    exit 1
}

# Run Vite build
Write-Host "Running Vite build..."
npm run --if-present vite build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Vite build failed!"
    exit 1
}

# Run electron-builder with explicit skip of code signing
Write-Host "Running electron-builder..."
npx electron-builder --win
if ($LASTEXITCODE -ne 0) {
    Write-Host "Electron builder failed!"
    exit 1
}

Write-Host "Build completed successfully!"

# Generate the Play Store UPLOAD keystore for SONGCHAINN.
#
#   .\scripts\make-keystore.ps1                       # generates a strong random password
#   .\scripts\make-keystore.ps1 -Password "yours"     # use your own
#
# WHAT THIS KEY IS
# With Play App Signing (on by default for new apps), Google holds the real app
# signing key and this is only your *upload* key. If you lose an upload key you
# can ask Google to reset it, so this is recoverable. It is still the key that
# proves uploads are yours, so back it up properly.
#
# BACK UP BOTH FILES, OFF THIS MACHINE:
#   android/songchainn-upload.keystore
#   android/keystore.properties
# Both are gitignored and must never be committed.

param(
  [string]$Password,
  [string]$Alias = 'songchainn-upload',
  [int]$ValidityDays = 10950   # 30 years; Play requires the key to outlive the app
)

$ErrorActionPreference = 'Stop'

$JdkHome     = 'E:\devtools\jdk\jdk-21.0.12+8'
$Keytool     = Join-Path $JdkHome 'bin\keytool.exe'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AndroidDir  = Join-Path $ProjectRoot 'android'
$KeystoreOut = Join-Path $AndroidDir 'songchainn-upload.keystore'
$PropsOut    = Join-Path $AndroidDir 'keystore.properties'

if (-not (Test-Path -LiteralPath $Keytool)) { throw "keytool not found at $Keytool" }
if (-not (Test-Path -LiteralPath $AndroidDir)) { throw "android/ not found. Run 'npx cap add android' first." }

if (Test-Path -LiteralPath $KeystoreOut) {
  Write-Host "Keystore already exists at $KeystoreOut" -ForegroundColor Yellow
  Write-Host "Refusing to overwrite it. Delete it by hand if you really want a new one." -ForegroundColor Yellow
  Write-Host "(If this app is already on Play, replacing the key breaks uploads.)" -ForegroundColor Yellow
  exit 0
}

if (-not $Password) {
  # 24 chars from an unambiguous alphabet, via the crypto RNG.
  # RandomNumberGenerator.Fill is .NET Core only; Windows PowerShell 5.1 runs on
  # .NET Framework, so use the RNG provider that exists on both.
  $alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  $bytes = New-Object byte[] 24
  $rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::new()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  $Password = -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
  Write-Host "Generated a random keystore password." -ForegroundColor Cyan
}

$dname = 'CN=SONGCHAINN, OU=SONGCHAINN, O=SONGCHAINN, L=Lusaka, S=Lusaka, C=ZM'

& $Keytool -genkeypair -v `
  -keystore $KeystoreOut `
  -alias $Alias `
  -keyalg RSA -keysize 2048 `
  -validity $ValidityDays `
  -storepass $Password `
  -keypass $Password `
  -dname $dname

if ($LASTEXITCODE -ne 0) { throw "keytool failed with exit code $LASTEXITCODE" }

# Gradle reads signing config from here. Forward slashes so the Java properties
# parser does not eat the backslashes as escapes.
#
# Must be written WITHOUT a byte-order mark. PowerShell 5.1's `-Encoding utf8`
# emits a BOM, and Java's Properties reader treats those three bytes as part of
# the first key, so `storeFile` silently becomes `﻿storeFile`, lookups
# return null, and Gradle fails with "path may not be null or empty string".
$storePathForProps = ($KeystoreOut -replace '\\', '/')
$propsText = @(
  "storeFile=$storePathForProps",
  "storePassword=$Password",
  "keyAlias=$Alias",
  "keyPassword=$Password"
) -join "`n"
[System.IO.File]::WriteAllText($PropsOut, $propsText + "`n", (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "Keystore: $KeystoreOut" -ForegroundColor Green
Write-Host "Config:   $PropsOut" -ForegroundColor Green
Write-Host ""
Write-Host "PASSWORD: $Password" -ForegroundColor Magenta
Write-Host ""
Write-Host "Copy both files somewhere safe and off this machine now." -ForegroundColor Yellow
Write-Host "They are gitignored and will not be pushed." -ForegroundColor Yellow

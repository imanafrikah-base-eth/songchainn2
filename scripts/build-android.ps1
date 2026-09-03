# Build the SONGCHAINN Android app.
#
#   .\scripts\build-android.ps1              # debug APK, installable, no keystore needed
#   .\scripts\build-android.ps1 -Release     # signed release APK + AAB for Play Store
#
# The system `java` on this machine is still a 1.8 JRE, which cannot build
# Android. JAVA_HOME is therefore set explicitly here rather than relying on PATH.

param(
  [switch]$Release,
  [switch]$SkipWebBuild
)

$ErrorActionPreference = 'Stop'

$JdkHome    = 'E:\devtools\jdk\jdk-21.0.12+8'
$AndroidSdk = 'E:\devtools\android-sdk'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AndroidDir  = Join-Path $ProjectRoot 'android'

foreach ($p in @($JdkHome, $AndroidSdk)) {
  if (-not (Test-Path -LiteralPath $p)) { throw "Missing toolchain path: $p" }
}

$env:JAVA_HOME         = $JdkHome
$env:ANDROID_HOME      = $AndroidSdk
$env:ANDROID_SDK_ROOT  = $AndroidSdk
$env:PATH              = "$JdkHome\bin;$AndroidSdk\platform-tools;$env:PATH"

Write-Host "JDK:     $JdkHome" -ForegroundColor Cyan
Write-Host "SDK:     $AndroidSdk" -ForegroundColor Cyan
Write-Host "Variant: $(if ($Release) { 'release' } else { 'debug' })" -ForegroundColor Cyan

# 1. Web bundle -------------------------------------------------------------
if (-not $SkipWebBuild) {
  Write-Host "`n[1/3] Building web bundle..." -ForegroundColor Yellow
  Push-Location $ProjectRoot
  npm run build
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Web build failed" }
  Pop-Location
} else {
  Write-Host "`n[1/3] Skipping web build (-SkipWebBuild)" -ForegroundColor DarkGray
}

# 2. Copy web assets into the native project --------------------------------
Write-Host "`n[2/3] Syncing to Android..." -ForegroundColor Yellow
Push-Location $ProjectRoot
npx cap sync android
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "cap sync failed" }
Pop-Location

# Two separate encoding traps live in this one file:
#
#   1. Forward slashes. A Java .properties file treats a lone backslash as an
#      escape, so `E:\devtools\android-sdk` silently collapses to
#      `E:devtoolsandroid-sdk` and Gradle dies with a confusing path error.
#   2. No BOM. PowerShell 5.1's `-Encoding utf8` writes a byte-order mark, and
#      the Properties reader folds those bytes into the first key, so `sdk.dir`
#      becomes `﻿sdk.dir` and resolves to null.
$sdkForProps = $AndroidSdk -replace '\\', '/'
[System.IO.File]::WriteAllText(
  (Join-Path $AndroidDir 'local.properties'),
  "sdk.dir=$sdkForProps`n",
  (New-Object System.Text.UTF8Encoding($false)))

# 3. Gradle -----------------------------------------------------------------
# --no-problems-report: on this disk Gradle's post-build HTML report writer can
# hang and then print BUILD FAILED *after* the artifact was packaged fine.
# Do NOT pipe gradlew through tail/Select-Object: it masks $LASTEXITCODE and a
# failed build looks like a successful one.
Write-Host "`n[3/3] Running Gradle..." -ForegroundColor Yellow
Push-Location $AndroidDir
if ($Release) {
  $keystoreProps = Join-Path $AndroidDir 'keystore.properties'
  if (-not (Test-Path -LiteralPath $keystoreProps)) {
    Pop-Location
    throw "android/keystore.properties not found. Run scripts/make-keystore.ps1 first."
  }
  & .\gradlew.bat clean assembleRelease bundleRelease --no-problems-report --no-daemon
} else {
  & .\gradlew.bat assembleDebug --no-problems-report --no-daemon
}
$gradleExit = $LASTEXITCODE
Pop-Location

if ($gradleExit -ne 0) { throw "Gradle failed with exit code $gradleExit" }

# Report what was actually produced ------------------------------------------
Write-Host "`nArtifacts:" -ForegroundColor Green
$outputs = @(
  (Join-Path $AndroidDir 'app\build\outputs\apk\debug\app-debug.apk'),
  (Join-Path $AndroidDir 'app\build\outputs\apk\release\app-release.apk'),
  (Join-Path $AndroidDir 'app\build\outputs\bundle\release\app-release.aab')
)
$found = $false
foreach ($o in $outputs) {
  if (Test-Path -LiteralPath $o) {
    $found = $true
    $sizeMb = [math]::Round((Get-Item -LiteralPath $o).Length / 1MB, 2)
    Write-Host ("  {0}  ({1} MB)" -f $o, $sizeMb) -ForegroundColor Green
  }
}
if (-not $found) { throw "Gradle reported success but no artifact was found" }

param(
    [string]$Url = 'http://127.0.0.1:3210/overlay'
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$profilePath = Join-Path $projectRoot '.runtime\chrome-overlay'

# Use Chrome explicitly instead of the Windows default browser.
$chromeCandidates = @()
foreach ($registryPath in @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe'
)) {
    $registeredChrome = Get-ItemProperty -LiteralPath $registryPath -ErrorAction SilentlyContinue
    if ($registeredChrome -and $registeredChrome.'(default)') {
        $chromeCandidates += $registeredChrome.'(default)'.Trim('"')
    }
}
foreach ($installRoot in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
    if ($installRoot) { $chromeCandidates += Join-Path $installRoot 'Google\Chrome\Application\chrome.exe' }
}
$chromeCommand = Get-Command 'chrome.exe' -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($chromeCommand) { $chromeCandidates += $chromeCommand.Source }
$chromePath = $chromeCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $chromePath) {
    throw 'Chua tim thay Google Chrome. Hay cai Google Chrome roi mo lai MO-MAN-HINH-PHAT.cmd.'
}

Add-Type -AssemblyName System.Windows.Forms
$workArea = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
# Fit the 1080 x 1920 preview, allowing room for Chrome's frame and title bar.
# Use a double for BOTH Min arguments: PowerShell otherwise selects the integer
# overload and rounds a scale such as 0.5125 up to 1 (an off-screen 1920px view).
$frameWidth = 16
$frameHeight = 48
$scale = [Math]::Min(1.0, [Math]::Min(($workArea.Width - $frameWidth - 24) / 1080.0, ($workArea.Height - $frameHeight - 24) / 1920.0))
$width = [int][Math]::Round(1080 * $scale) + $frameWidth
$height = [int][Math]::Round(1920 * $scale) + $frameHeight
$left = $workArea.Left + [int][Math]::Floor(($workArea.Width - $width) / 2)
$top = $workArea.Top + [int][Math]::Floor(($workArea.Height - $height) / 2)

New-Item -ItemType Directory -Path $profilePath -Force | Out-Null
# Measure and correct the actual Chrome content area, independently of which
# local copy of the scene is currently serving port 3210.
if (-not ('SceneOverlayWindow' -as [type])) {
    Add-Type -Path (Join-Path $PSScriptRoot 'OverlayWindow.cs')
}
function Get-OverlayBrowserProcess {
    $profileArgument = '--user-data-dir="?' + [Regex]::Escape($profilePath) + '(?:"|\s|$)'
    @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | Where-Object {
        $_.CommandLine -match $profileArgument -and $_.CommandLine -notmatch '\s--type='
    })
}
$previousWindows = @(foreach ($browserProcess in (Get-OverlayBrowserProcess)) {
    [SceneOverlayWindow]::GetWindows([int]$browserProcess.ProcessId)
})
$overlayWindow = $previousWindows | Where-Object IsOverlay | Select-Object -First 1
$arguments = @(
    "--app=`"$Url`"",
    "--user-data-dir=`"$profilePath`"",
    '--no-first-run',
    '--no-default-browser-check',
    "--window-size=$width,$height",
    "--window-position=$left,$top"
)
if (-not $overlayWindow) {
    Start-Process -FilePath $chromePath -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Normal
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    while ([DateTime]::UtcNow -lt $deadline) {
        $windows = @(foreach ($browserProcess in (Get-OverlayBrowserProcess)) {
            [SceneOverlayWindow]::GetWindows([int]$browserProcess.ProcessId)
        })
        $newWindows = @($windows | Where-Object { $_.IsOverlay -and $_.Handle -notin $previousWindows.Handle })
        if ($newWindows.Count -eq 1) { $overlayWindow = $newWindows[0]; break }
        Start-Sleep -Milliseconds 200
    }
}
if (-not $overlayWindow) {
    throw 'Khong xac dinh duoc cua so Chrome moi de can chinh. Dong cua so overlay roi mo lai MO-MAN-HINH-PHAT.cmd.'
}
$geometry = $null
for ($attempt = 0; $attempt -lt 5; $attempt++) {
    $geometry = [SceneOverlayWindow]::Fit($overlayWindow.Handle)
    if ($geometry.ContentWidth -gt 0 -and $geometry.ContentWidth * 16 -eq $geometry.ContentHeight * 9 -and $geometry.FitsWorkArea) { break }
    Start-Sleep -Milliseconds 250
}
if (-not $geometry -or $geometry.ContentWidth * 16 -ne $geometry.ContentHeight * 9 -or -not $geometry.FitsWorkArea) {
    throw 'Chrome da mo nhung chua can duoc khung 9:16 vua man hinh. Hay dong cua so overlay va mo lai.'
}
$geometry | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $projectRoot '.runtime\overlay-window.json') -Encoding UTF8
[SceneOverlayWindow]::Activate($overlayWindow.Handle)
Write-Host ("Da kiem tra Chrome: noi dung {0} x {1} (9:16), thanh tieu de nam trong man hinh." -f $geometry.ContentWidth, $geometry.ContentHeight)

param(
    [ValidateSet('control', 'overlay')]
    [string]$View = 'control'
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$serverPath = Join-Path $projectRoot 'server.mjs'
$runtimePath = Join-Path $projectRoot '.runtime'
$baseUrl = 'http://127.0.0.1:3210'

function Test-SceneServer {
    try {
        $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -TimeoutSec 2 -UseBasicParsing
        return ($health.app -eq 'tap-hoa-ong-ba' -and $health.ok -eq $true)
    } catch { return $false }
}

function Open-SceneView {
    if ($View -eq 'overlay') {
        & (Join-Path $PSScriptRoot 'open-overlay.ps1') -Url "$baseUrl/overlay"
    } else {
        Start-Process -FilePath "$baseUrl/$View"
    }
}

try {
    if (Test-SceneServer) {
        Write-Host 'Bo canh dang chay. Dang mo trinh duyet...'
        Open-SceneView
        exit 0
    }

    $nodeCommand = Get-Command 'node.exe' -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $nodeCommand) {
        throw 'Chua tim thay Node.js. Cai Node.js 22 tro len tu https://nodejs.org/ roi mo lai BAT-DAU.cmd.'
    }
    $nodePath = $nodeCommand.Source
    & $nodePath -e "if(Number(process.versions.node.split('.')[0])<22 || typeof WebSocket!=='function') process.exit(1)"
    if ($LASTEXITCODE -ne 0) {
        throw 'Can Node.js 22 tro len co WebSocket tich hop. Cap nhat Node.js tu https://nodejs.org/ roi thu lai.'
    }
    if (-not (Test-Path -LiteralPath $serverPath -PathType Leaf)) {
        throw 'Thieu server.mjs. Hay giai nen day du thu muc bo canh truoc khi chay.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'public\vendor\three.module.js') -PathType Leaf)) {
        throw 'Thieu thu vien 3D public\vendor\three.module.js. Hay giai nen day du bo canh.'
    }

    New-Item -ItemType Directory -Path $runtimePath -Force | Out-Null
    $stdoutPath = Join-Path $runtimePath 'server.log'
    $stderrPath = Join-Path $runtimePath 'server-error.log'
    # Only this child uses the fixed port; restore the calling process setting.
    $previousScenePort = [Environment]::GetEnvironmentVariable('PORT', 'Process')
    try {
        [Environment]::SetEnvironmentVariable('PORT', '3210', 'Process')
        $sceneProcess = Start-Process -FilePath $nodePath -ArgumentList ('"{0}"' -f $serverPath) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
    } finally {
        [Environment]::SetEnvironmentVariable('PORT', $previousScenePort, 'Process')
    }
    Set-Content -LiteralPath (Join-Path $runtimePath 'server.pid') -Value $sceneProcess.Id -Encoding Ascii
    $ready = $false
    $deadline = [DateTime]::UtcNow.AddSeconds(12)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Test-SceneServer) { $ready = $true; break }
        $sceneProcess.Refresh()
        if ($sceneProcess.HasExited) { break }
        Start-Sleep -Milliseconds 350
    }
    $sceneProcess.Refresh()
    if (-not $ready -or $sceneProcess.HasExited) {
        throw "Khong khoi dong duoc bo canh. Kiem tra cong 3210 va nhat ky: $stderrPath"
    }
    Write-Host "Da mo bo canh: $baseUrl/$View"
    Write-Host 'Dung DUNG-BO-CANH.cmd de dung dung may chu cua bo canh.'
    Open-SceneView
    exit 0
} catch {
    Write-Host ''
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

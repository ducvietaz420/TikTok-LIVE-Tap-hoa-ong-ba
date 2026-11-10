$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$serverPath = Join-Path $projectRoot 'server.mjs'
$pidPath = Join-Path $projectRoot '.runtime\server.pid'

try {
    if (-not (Test-Path -LiteralPath $pidPath -PathType Leaf)) {
        Write-Host 'Khong co ma tien trinh do BAT-DAU.cmd tao. Khong dung ung dung khac.'
        exit 0
    }
    $scenePidText = (Get-Content -LiteralPath $pidPath -Raw).Trim()
    $sceneProcessId = 0
    if (-not [int]::TryParse($scenePidText, [ref]$sceneProcessId) -or $sceneProcessId -le 0) {
        throw 'Ma tien trinh khong hop le. Khong dung bat ky ung dung nao.'
    }
    $sceneProcess = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $sceneProcessId" -ErrorAction Stop
    if (-not $sceneProcess) {
        Remove-Item -LiteralPath $pidPath -Force
        Write-Host 'Bo canh da dung.'
        exit 0
    }
    # A stale PID may belong to another application. Require node.exe and the
    # exact quoted, absolute script argument that start.ps1 passed to Node.
    $scriptArgument = '(?:^|\s)"' + [regex]::Escape($serverPath) + '"(?:\s|$)'
    if ($sceneProcess.Name -ine 'node.exe' -or -not $sceneProcess.CommandLine -or $sceneProcess.CommandLine -notmatch $scriptArgument) {
        throw 'Khong xac minh duoc tien trinh la may chu cua thu muc nay. Da giu nguyen tien trinh.'
    }
    Stop-Process -Id $sceneProcessId -ErrorAction Stop
    Remove-Item -LiteralPath $pidPath -Force
    Write-Host 'Da dung may chu Tap hoa Ong Ba. TikFinity va LIVE Studio van do ban dieu khien.'
    exit 0
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

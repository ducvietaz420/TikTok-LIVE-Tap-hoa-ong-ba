param(
    [string]$FileName = 'Bo-LIVE-Tap-Hoa-Ong-Ba-v5.zip',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workspaceRoot = [System.IO.Directory]::GetParent($projectRoot).FullName

if ([string]::IsNullOrWhiteSpace($FileName) -or
    [System.IO.Path]::GetFileName($FileName) -ne $FileName -or
    $FileName.IndexOfAny([System.IO.Path]::GetInvalidFileNameChars()) -ge 0 -or
    [System.IO.Path]::GetExtension($FileName) -ine '.zip') {
    throw 'FileName must be a ZIP filename without a directory path.'
}
$archiveTarget = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot $FileName))
if ([System.IO.Path]::GetDirectoryName($archiveTarget) -ine $workspaceRoot) {
    throw 'The archive target must stay in the workspace directory.'
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $archiveTarget) {
    if (-not $Force) { throw "Archive already exists: $archiveTarget. Use -Force to replace it." }
    if (-not (Test-Path -LiteralPath $archiveTarget -PathType Leaf)) {
        throw 'The archive target is not a file.'
    }
    # Do not replace an unrelated ZIP, even when -Force was supplied.
    $existingArchive = [System.IO.Compression.ZipFile]::OpenRead($archiveTarget)
    try {
        if (-not $existingArchive.GetEntry('tap-hoa-ong-ba/server.mjs') -or
            -not $existingArchive.GetEntry('tap-hoa-ong-ba/BAT-DAU.cmd')) {
            throw 'The existing ZIP was not recognized as this live kit.'
        }
    } finally { $existingArchive.Dispose() }
}

$sourcePaths = @('public', 'lib', 'tests', 'scripts', 'server.mjs', 'voice-lines.json', 'package.json', 'package-lock.json', '.gitignore')
$sourcePaths += @(Get-ChildItem -LiteralPath $projectRoot -File -Filter '*.md' | ForEach-Object Name)
$sourcePaths += @(Get-ChildItem -LiteralPath $projectRoot -File -Filter '*.cmd' | ForEach-Object Name)
if (Test-Path -LiteralPath (Join-Path $projectRoot 'XEM-TRUOC.jpg') -PathType Leaf) {
    $sourcePaths += 'XEM-TRUOC.jpg'
}

$requiredEntries = @(
    'server.mjs', 'lib/events.mjs', 'lib/world.mjs', 'lib/gifts.mjs', 'lib/avatar.mjs',
    'public/control.html', 'public/overlay.html', 'public/overlay.js', 'public/scene.js', 'public/chaos.js',
    'public/background-music.js', 'public/music/tiem-vui.wav', 'public/music/SOURCES.json',
    'scripts/start.ps1', 'scripts/open-overlay.ps1', 'scripts/OverlayWindow.cs',
    'public/visitors.js',
    'public/dog-audio.js', 'public/sfx/dog-bark.wav', 'public/sfx/SOURCES.json',
    'public/avatar-demo.svg', 'public/avatar-placeholder.svg',
    'public/gift-map.json', 'public/gift-catalog.json', 'public/gifts/SOURCES.json',
    'public/fonts/BeVietnamPro-Regular.ttf', 'public/fonts/OFL.txt',
    'public/vendor/three.module.js', 'public/vendor/three.core.js', 'public/vendor/THREE-LICENSE.txt',
    'voice-lines.json', 'BAT-DAU.cmd', 'MO-MAN-HINH-PHAT.cmd', 'DUNG-BO-CANH.cmd', 'README.md', 'QUA-TUONG-TAC.md'
)
$voiceManifest = Get-Content -LiteralPath (Join-Path $projectRoot 'voice-lines.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$voicePaths = @($voiceManifest.PSObject.Properties | ForEach-Object {
    foreach ($entry in $_.Value) { 'public' + [string]$entry.src }
})
if ($voicePaths.Count -ne 38 -or @($voicePaths | Select-Object -Unique).Count -ne 38) {
    throw 'The voice manifest must contain exactly 38 unique clips.'
}
$requiredEntries += $voicePaths

$stagingName = '.live-kit-package-' + [Guid]::NewGuid().ToString('N') + '.zip'
$stagingPath = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot $stagingName))
if ([System.IO.Path]::GetDirectoryName($stagingPath) -ine $workspaceRoot) {
    throw 'The staging archive must stay in the workspace directory.'
}
$archivePrefix = 'tap-hoa-ong-ba/'
$entryNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$entryCount = 0
$giftImageCount = 0
$audioCount = 0

try {
    $archive = [System.IO.Compression.ZipFile]::Open($stagingPath, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($sourceItem in $sourcePaths) {
            $sourcePath = Join-Path $projectRoot $sourceItem
            if (-not (Test-Path -LiteralPath $sourcePath)) { throw "Required source is missing: $sourceItem" }
            $sourceFiles = if (Test-Path -LiteralPath $sourcePath -PathType Container) {
                Get-ChildItem -LiteralPath $sourcePath -File -Recurse -Force
            } else { Get-Item -LiteralPath $sourcePath -Force }
            foreach ($sourceFile in $sourceFiles) {
                $relativeName = $sourceFile.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
                if ($relativeName -match '(^|/)(node_modules|\.runtime|__pycache__)(/|$)' -or
                    $relativeName -match '\.(log|pyc|partial\.mp3)$') { continue }
                $entryName = $archivePrefix + $relativeName
                if (-not $entryNames.Add($entryName)) { continue }
                [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                    $archive, $sourceFile.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal
                ) | Out-Null
            }
        }
    } finally { $archive.Dispose() }

    $verification = [System.IO.Compression.ZipFile]::OpenRead($stagingPath)
    try {
        foreach ($requiredEntry in $requiredEntries) {
            if (-not $verification.GetEntry($archivePrefix + $requiredEntry)) {
                throw "Packaged file is missing: $requiredEntry"
            }
        }
        $entryCount = $verification.Entries.Count
        $giftImageCount = @($verification.Entries | Where-Object FullName -Match '^tap-hoa-ong-ba/public/gifts/[^/]+\.webp$').Count
        $audioCount = @($verification.Entries | Where-Object FullName -Match '^tap-hoa-ong-ba/public/audio/[^/]+\.mp3$').Count
        if ($giftImageCount -ne 16) { throw "Expected 16 gift images, found $giftImageCount." }
        if ($audioCount -ne 38) { throw "Expected 38 MP3 clips, found $audioCount." }
        if (@($verification.Entries | Where-Object FullName -Match '/(node_modules|\.runtime|__pycache__)/|\.log$').Count) {
            throw 'An excluded runtime or dependency file was found in the archive.'
        }
    } finally { $verification.Dispose() }

    # Both paths were resolved and checked above; this moves one owned archive file.
    Move-Item -LiteralPath $stagingPath -Destination $archiveTarget -Force:$Force
    [pscustomobject]@{
        Archive = $archiveTarget
        Files = $entryCount
        GiftImages = $giftImageCount
        VoiceClips = $audioCount
        RequiredFiles = 'PASS'
        Bytes = (Get-Item -LiteralPath $archiveTarget).Length
    }
} finally {
    if (Test-Path -LiteralPath $stagingPath -PathType Leaf) {
        Remove-Item -LiteralPath $stagingPath -Force
    }
}

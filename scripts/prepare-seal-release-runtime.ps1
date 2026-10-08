#Requires -Version 5.1
[CmdletBinding()]
param([string]$LocalArchive)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pin = Get-Content -LiteralPath (Join-Path $repo 'release/windows-runtime.json') -Raw | ConvertFrom-Json
$cache = Join-Path $repo '.local/cache/seal-release-inputs'
New-Item -ItemType Directory -Force $cache | Out-Null
$archive = Join-Path $cache 'media.zip'
if ($LocalArchive) { $archive = (Resolve-Path -LiteralPath $LocalArchive).Path }
else {
    if ($pin.url -notlike 'https://github.com/wenlei-xu/Seal/releases/download/*') { throw 'Unexpected runtime source' }
    Invoke-WebRequest -Uri $pin.url -OutFile $archive -UseBasicParsing
}
if ((Get-Item -LiteralPath $archive).Length -ne $pin.size -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.sha256) { throw 'Editing runtime archive digest mismatch' }
$media = Join-Path $cache 'media'
if (Test-Path -LiteralPath $media) { throw 'Use a clean release input directory; runtime extraction does not overwrite existing files' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
    $prefix = [IO.Path]::GetFullPath($media).TrimEnd('\') + '\'
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    [long]$size = 0
    if ($zip.Entries.Count -gt 50000) { throw 'Too many runtime files' }
    foreach ($entry in $zip.Entries) {
        $name = $entry.FullName
        if ($name -match '\\|:|(^|/)\.\.?(/|$)|(^|/)(con|prn|aux|nul|com\d|lpt\d)([./]|$)' -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) { throw 'Unsafe runtime archive entry' }
        $destination = [IO.Path]::GetFullPath((Join-Path $media $name))
        if (-not $destination.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or -not $seen.Add($destination)) { throw 'Runtime archive path escapes or collides' }
        $size += $entry.Length
        if ($size -gt 2GB -or $entry.Length -gt 1GB) { throw 'Runtime archive exceeds size limits' }
    }
    [IO.Compression.ZipFile]::ExtractToDirectory($archive, $media)
} finally { $zip.Dispose() }
$env:BEEFTV_EDIT_BROWSER_ROOT = Join-Path $media 'browser'
$env:BEEFTV_EDIT_FFMPEG_ROOT = Join-Path $media 'ffmpeg'
$env:BEEFTV_ASR_RUNTIME = Join-Path $media 'asr'
if ($env:GITHUB_ENV) {
    foreach ($name in @('BEEFTV_EDIT_BROWSER_ROOT','BEEFTV_EDIT_FFMPEG_ROOT','BEEFTV_ASR_RUNTIME')) {
        [IO.File]::AppendAllText($env:GITHUB_ENV, "$name=$([Environment]::GetEnvironmentVariable($name))`n", (New-Object Text.UTF8Encoding($false)))
    }
}
Write-Host 'Verified and prepared pinned Windows editing tools.'

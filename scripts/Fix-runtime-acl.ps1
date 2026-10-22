<#
.SYNOPSIS
  Fix DSH workspace .runtime ACL so Low-IL sandbox / start-all can write pid/logs.

.DESCRIPTION
  For a workspace root (default: current directory):
    1. Ensure .runtime exists
    2. takeown /F .runtime /R /D Y
    3. Grant current user (OI)(CI)(F)
    4. Remove Everyone DENY ACEs
    5. Set integrity level Medium on .runtime (OI)(CI)
    6. Print a verify summary

  WARN: If the repo root stays at Low IL while .runtime is Medium, Low-IL
  sandbox processes are subject to No-Write-Up and may still fail writing into
  .runtime. Prefer Medium .runtime + running start-all outside Low sandbox,
  or keep both at compatible levels.

.PARAMETER Workspace
  Workspace root containing .runtime. Default: current directory.

.EXAMPLE
  pwsh -File scripts/Fix-runtime-acl.ps1 -Workspace E:\WorkSpaces\aida700-ERP
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Position = 0)]
  [string]$Workspace = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Info([string]$Text) { Write-Host "[fix-runtime-acl] $Text" }
function Write-WarnLine([string]$Text) { Write-Warning "[fix-runtime-acl] $Text" }

$Workspace = [System.IO.Path]::GetFullPath($Workspace)
if (-not (Test-Path -LiteralPath $Workspace -PathType Container)) {
  throw "Workspace not found: $Workspace"
}

$runtime = Join-Path $Workspace '.runtime'
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
Write-Info "workspace=$Workspace"
Write-Info "runtime=$runtime"
Write-Info "user=$user"

if (-not (Test-Path -LiteralPath $runtime)) {
  if ($PSCmdlet.ShouldProcess($runtime, 'Create .runtime directory')) {
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    Write-Info 'created .runtime'
  }
}

function Invoke-Checked([string]$FilePath, [string[]]$ArgumentList, [string]$Label) {
  Write-Info "$Label: $FilePath $($ArgumentList -join ' ')"
  $outFile = Join-Path $env:TEMP 'fix-runtime-acl-out.txt'
  $errFile = Join-Path $env:TEMP 'fix-runtime-acl-err.txt'
  $p = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -Wait -PassThru -NoNewWindow `
    -RedirectStandardOutput $outFile -RedirectStandardError $errFile
  if (Test-Path $outFile) {
    $out = Get-Content $outFile -Raw -ErrorAction SilentlyContinue
    if ($out) { Write-Host $out.TrimEnd() }
  }
  if (Test-Path $errFile) {
    $err = Get-Content $errFile -Raw -ErrorAction SilentlyContinue
    if ($err) { Write-Host $err.TrimEnd() }
  }
  if ($p.ExitCode -ne 0) { Write-WarnLine "$Label exit=$($p.ExitCode)" }
  return $p.ExitCode
}

if ($PSCmdlet.ShouldProcess($runtime, 'takeown recursively')) {
  [void](Invoke-Checked 'takeown.exe' @('/F', $runtime, '/R', '/D', 'Y') 'takeown')
}

if ($PSCmdlet.ShouldProcess($runtime, "Grant $user (OI)(CI)(F)")) {
  [void](Invoke-Checked 'icacls.exe' @($runtime, '/grant', "${user}:(OI)(CI)(F)", '/T', '/C') 'grant current user')
}

if ($PSCmdlet.ShouldProcess($runtime, 'Remove Everyone DENY')) {
  $code = Invoke-Checked 'icacls.exe' @($runtime, '/remove:d', 'Everyone', '/T', '/C') 'remove Everyone DENY'
  if ($code -ne 0) {
    Write-Info "remove Everyone DENY: no matching ACE or partial (exit=$code) - continuing"
  }
}

if ($PSCmdlet.ShouldProcess($runtime, 'setintegritylevel Medium')) {
  [void](Invoke-Checked 'icacls.exe' @($runtime, '/setintegritylevel', '(OI)(CI)M', '/T', '/C') 'setintegritylevel Medium')
}

Write-Info '--- verify summary ---'
$aclOut = & icacls.exe $runtime 2>&1 | Out-String
Write-Host $aclOut

$hasEveryoneDeny = ($aclOut -match 'Everyone:.*DENY') -or ($aclOut -match 'Everyone:\(N\)')
$hasMedium = $aclOut -match 'Medium Mandatory Level'
$rootAcl = & icacls.exe $Workspace 2>&1 | Out-String
$rootLow = $rootAcl -match 'Low Mandatory Level'
$userLeaf = ($user -split '\\')[-1]

Write-Info ("user_ace_hint=" + $(if ($aclOut -match [regex]::Escape($userLeaf)) { 'yes' } else { 'check' }))
Write-Info ("everyone_deny_present=" + $(if ($hasEveryoneDeny) { 'YES' } else { 'no' }))
Write-Info ("runtime_medium_il=" + $(if ($hasMedium) { 'yes' } else { 'NO/unknown' }))
Write-Info ("workspace_root_low_il=" + $(if ($rootLow) { 'YES' } else { 'no/unknown' }))

if ($rootLow -and $hasMedium) {
  Write-WarnLine 'Repo-root appears Low IL while .runtime is Medium. Low-IL sandbox is subject to No-Write-Up and may still be blocked writing into Medium .runtime. Run start-all outside Low sandbox, or align integrity levels intentionally.'
}

Write-Info 'done'
exit 0

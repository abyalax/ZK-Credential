
[CmdletBinding()]
param(
    [ValidateSet("Full", "Changed", "Staged", "Folder")]
    [string]$Mode = "Full",
    [switch]$ShowLog,                    # Display raw scanner logs

    [string]$Path = ".",                 # Used in Folder mode
    [string]$BaseRef = "HEAD",           # Comparison reference in Changed mode
    [string]$ProjectKey = "",            # Default: SONAR_PROJECT_KEY in .env
    [string]$Organization = "",          # Default: SONAR_ORGANIZATION in .env
    [string]$HostUrl = "https://sonarcloud.io",
    [string[]]$Extensions = @("ts", "tsx")
)

$ErrorActionPreference = "Stop"

# --- Load .env if available. Existing environment variables are not overwritten.
$envFile = Join-Path $PSScriptRoot "..\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line -match '^([^=]+)=(.*)$') {
            $name  = $Matches[1].Trim()
            $value = $Matches[2].Trim().Trim('"').Trim("'")
            if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
                [Environment]::SetEnvironmentVariable($name, $value, "Process")
            }
        }
    }
}

if (-not $Organization) { $Organization = $env:SONAR_ORGANIZATION }
if (-not $ProjectKey)   { $ProjectKey   = if ($env:SONAR_PROJECT_KEY) { $env:SONAR_PROJECT_KEY } else { "ZK-Credential" } }

# --- Validate configuration
if (-not $env:SONAR_TOKEN) {
    throw "SONAR_TOKEN is not set (configure it in .env or `$env:SONAR_TOKEN)."
}
if ($HostUrl -match "sonarcloud\.io|sonarqube\.us" -and -not $Organization) {
    throw "SonarQube Cloud requires an organization key (SONAR_ORGANIZATION or -Organization)."
}
if (-not (Get-Command sonar-scanner -ErrorAction SilentlyContinue)) {
    throw "sonar-scanner was not found in PATH."
}

# --- Determine analysis scope
$extPattern = "\.(" + ($Extensions -join "|") + ")$"
$exclusions = "**/node_modules/**,**/dist/**,**/build/**,**/coverage/**,**/*.d.ts"
$allGlobs   = ($Extensions | ForEach-Object { "**/*.$_" }) -join ","
$key        = $ProjectKey

switch ($Mode) {
    "Full" {
        $sources    = "."
        $inclusions = $allGlobs
    }
    "Folder" {
        if (-not (Test-Path $Path)) { throw "Folder not found: $Path" }
        $sources    = ((Resolve-Path -Relative $Path) -replace "\\", "/")
        $inclusions = $allGlobs
        $key        = "$ProjectKey-partial"
    }
    { $_ -in "Changed", "Staged" } {
        if ($Mode -eq "Staged") {
            $list = git diff --cached --name-only --diff-filter=ACMR
        }
        else {
            $tracked   = git diff --name-only --diff-filter=ACMR $BaseRef
            $untracked = git ls-files --others --exclude-standard
            $list      = @($tracked) + @($untracked)
        }
        $files = $list | Where-Object { $_ -match $extPattern } | Sort-Object -Unique
        if (-not $files) {
            Write-Verbose "Files to analyze ($($files.Count)): $($files -join ', ')"
            exit 0
        }
        Write-Verbose "Files to analyze ($($files.Count)): $($files -join ', ')"
        $files | ForEach-Object { Write-Host "  $_" }
        $sources    = "."
        $inclusions = ($files -replace "\\", "/") -join ","
        $key        = "$ProjectKey-partial"
    }
}

# --- Write temporary properties file (avoids comma/quote issues in .bat)
$props = @(
    "sonar.projectKey=$key"
    "sonar.host.url=$HostUrl"
    "sonar.sources=$sources"
    "sonar.inclusions=$inclusions"
    "sonar.exclusions=$exclusions"
    "sonar.scm.disabled=true"
)
if ($Organization) { $props += "sonar.organization=$Organization" }

# --- Run scanner silently and capture its output
$tmp = [IO.Path]::GetTempFileName()
try {
    Set-Content -Path $tmp -Value $props -Encoding ASCII
    $log  = sonar-scanner "-Dproject.settings=$tmp" 2>&1 | Out-String
    $code = $LASTEXITCODE
}
finally {
    Remove-Item $tmp -ErrorAction SilentlyContinue
}

if ($ShowLog) { Write-Host $log }

if ($code -ne 0) {
    if (-not $ShowLog) { Write-Host $log }   # Display logs only on failure
    Write-Host "Scanner failed (exit code $code)." -ForegroundColor Red
    exit $code
}

# --- Wait for server-side processing to complete (poll task from report-task.txt)
$headers = @{ Authorization = "Bearer $env:SONAR_TOKEN" }
$api     = $HostUrl.TrimEnd('/')
$report  = Join-Path (Get-Location) ".scannerwork\report-task.txt"

if (Test-Path $report) {
    $taskUrl = ((Get-Content $report | Where-Object { $_ -like "ceTaskUrl=*" }) -replace '^ceTaskUrl=', '').Trim()
    $deadline = (Get-Date).AddSeconds(180)
    do {
        Start-Sleep -Seconds 2
        $task = (Invoke-RestMethod -Uri $taskUrl -Headers $headers).task
    } while ($task.status -in @("PENDING", "IN_PROGRESS") -and (Get-Date) -lt $deadline)

    if ($task.status -ne "SUCCESS") {
        Write-Host "Server-side processing failed (status: $($task.status))." -ForegroundColor Red
        exit 1
    }
}

# --- Retrieve unresolved issues (with pagination)
$issues = @()
$page   = 1
do {
    $q = "organization=$Organization&components=$key&resolved=false&ps=500&p=$page"
    $r = Invoke-RestMethod -Uri "$api/api/issues/search?$q" -Headers $headers
    $issues += $r.issues
    $page++
} while ($issues.Count -lt $r.paging.total -and $issues.Count -lt 10000)

# --- Exit silently if no issues are found
if ($issues.Count -eq 0) { exit 0 }

$order = @{ BLOCKER = 0; CRITICAL = 1; MAJOR = 2; MINOR = 3; INFO = 4 }
Write-Host "`n$($issues.Count) issues found in $key" -ForegroundColor Yellow

$issues |
    Sort-Object { $order[$_.severity] }, component, line |
    Select-Object severity, type, rule,
        @{ n = "file"; e = { $_.component -replace '^.*?:', '' } },
        line, message |
    Format-Table -AutoSize -Wrap |
    Out-String | Write-Host

Write-Host "Details: $api/project/issues?id=$key&organization=$Organization&resolved=false"
exit 1

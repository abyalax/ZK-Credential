
[CmdletBinding()]
param(
    [ValidateSet("Full", "Changed", "Staged", "Folder")]
    [string]$Mode = "Full",

    [switch]$ShowLog,                    # Legacy switch; scanner output remains suppressed
    [switch]$VerboseScanner,             # Enable scanner debug output

    [string]$Path = ".",                 # Used in Folder mode
    [string]$BaseRef = "HEAD",           # Comparison reference in Changed mode
    [string]$ProjectKey = "",            # Default: SONAR_PROJECT_KEY in .env
    [string[]]$Extensions = @("ts", "tsx"),

    [string]$SonarUrl = "",  # Existing SonarQube server URL (skip Docker if set, e.g., http://localhost:9000)
    [string]$SonarImage = "sonarqube:lts-community",
    [int]$StartupTimeoutSeconds = 600,
    [int]$TaskTimeoutSeconds = 900
)

$ErrorActionPreference = "Stop"

# Configuration

$containerName = "sonar-ephemeral-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$containerStarted = $false
$tokenName = $null
$sonarToken = $null
$tokenHeaders = $null
$hostUrl = $null
$tmp = $null
$exitCode = 0
$skipAnalysis = $false
$containerLogs = $null

$previousSonarToken = $env:SONAR_TOKEN
$sonarTokenWasSet = Test-Path Env:SONAR_TOKEN

# Helper functions

function Invoke-WslDocker {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    $output = & wsl.exe docker @Arguments 2>&1
    $code = $LASTEXITCODE

    if ($code -ne 0) {
        throw "Docker command failed (exit code $code):`n$($output | Out-String)"
    }

    return ($output | Out-String).Trim()
}

function Set-WslSysctl {
    param(
        [Parameter(Mandatory)]
        [string]$Setting
    )

    $output = & wsl.exe -u root -- sysctl -w $Setting 2>&1
    $code = $LASTEXITCODE

    if ($code -ne 0) {
        throw "Failed to configure WSL kernel setting '$Setting':`n$($output | Out-String)"
    }

    Write-Host "  $output" -ForegroundColor DarkGray
}

function New-BasicAuthHeader {
    param(
        [string]$Username,
        [string]$Password
    )

    $bytes = [Text.Encoding]::ASCII.GetBytes("${Username}:${Password}")
    $encoded = [Convert]::ToBase64String($bytes)

    return @{
        Authorization = "Basic $encoded"
    }
}

function New-TemporaryPassword {
    $bytes = New-Object byte[] 24
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()

    try {
        $rng.GetBytes($bytes)
    }
    finally {
        $rng.Dispose()
    }

    return [BitConverter]::ToString($bytes).Replace("-", "")
}

function Get-AvailablePort {
    $listener = [System.Net.Sockets.TcpListener]::new(
        [Net.IPAddress]::Loopback, 0
    )

    try {
        $listener.Start()
        return ([Net.IPEndPoint]$listener.LocalEndpoint).Port
    }
    finally {
        $listener.Stop()
    }
}

# Main execution

try {
    Write-Host "`n SonarQube Local Analysis " -ForegroundColor Cyan

    # --------------------------------------------------------
    # Load .env
    # --------------------------------------------------------

    $envFile = Join-Path $PSScriptRoot "..\.env"

    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            $line = $_.Trim()

            if ($line -and -not $line.StartsWith("#") -and
                $line -match '^([^=]+)=(.*)$') {

                $name = $Matches[1].Trim()
                $value = $Matches[2].Trim().Trim('"').Trim("'")

                if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
                    [Environment]::SetEnvironmentVariable(
                        $name, $value, "Process"
                    )
                }
            }
        }
    }

    if (-not $ProjectKey) {
        $ProjectKey = if ($env:SONAR_PROJECT_KEY) {
            $env:SONAR_PROJECT_KEY
        }
        else {
            "ZK-Credential"
        }
    }

    # --------------------------------------------------------
    # Validate scanner
    # --------------------------------------------------------

    if (-not (Get-Command sonar-scanner -ErrorAction SilentlyContinue)) {
        throw "sonar-scanner was not found in PATH."
    }

    # --------------------------------------------------------
    # Determine analysis scope
    # --------------------------------------------------------

    $extPattern = "\.(" + ($Extensions -join "|") + ")$"
    $exclusions = "**/node_modules/**,**/dist/**,**/build/**,**/coverage/**,**/*.d.ts"
    $allGlobs = ($Extensions | ForEach-Object { "**/*.$_" }) -join ","

    $key = $ProjectKey
    $sources = "."
    $inclusions = $allGlobs

    switch ($Mode) {
        "Full" {
            Write-Host "Analysis mode: Full"
        }

        "Folder" {
            if (-not (Test-Path $Path)) {
                throw "Folder not found: $Path"
            }

            $sources = ((Resolve-Path -Relative $Path) -replace "\\", "/")
            $key = "$ProjectKey-partial"

            Write-Host "Analysis mode: Folder"
            Write-Host "Target: $sources"
        }

        { $_ -in "Changed", "Staged" } {
            Write-Host "Analysis mode: $Mode"

            if ($Mode -eq "Staged") {
                $list = git diff --cached --name-only --diff-filter=ACMR
            }
            else {
                $tracked = git diff --name-only --diff-filter=ACMR $BaseRef
                $untracked = git ls-files --others --exclude-standard

                $list = @($tracked) + @($untracked)
            }

            $files = @(
                $list |
                    Where-Object { $_ -match $extPattern } |
                    Sort-Object -Unique
            )

            if ($files.Count -eq 0) {
                Write-Host "No matching files found. Analysis skipped." `
                    -ForegroundColor Yellow

                $skipAnalysis = $true
                break
            }

            $files | ForEach-Object {
                Write-Host "  $_"
            }

            $sources = "."
            $inclusions = ($files -replace "\\", "/") -join ","
            $key = "$ProjectKey-partial"
        }
    }

    if (-not $skipAnalysis) {

        Write-Host "`nProject key: $key"
        Write-Host "Extensions: $($Extensions -join ', ')"

        # ----------------------------------------------------
        # Use existing server or start Docker
        # ----------------------------------------------------

        if ($SonarUrl) {
            $hostUrl = $SonarUrl
            Write-Host "`nUsing existing SonarQube server: $hostUrl" -ForegroundColor Cyan
            $containerStarted = $false
        }
        else {
            # ----------------------------------------------------
            # Validate Docker
            # ----------------------------------------------------

            Write-Host "`n[1/7] Checking WSL Docker..." -ForegroundColor Cyan

            $dockerVersion = Invoke-WslDocker @(
                "info", "--format", "{{.ServerVersion}}"
            )

            Write-Host "Docker Engine: $dockerVersion" -ForegroundColor Green

            # ----------------------------------------------------
            # Configure Elasticsearch requirements
            # ----------------------------------------------------

            Write-Host "`n[2/7] Configuring WSL kernel..." -ForegroundColor Cyan

            Set-WslSysctl "vm.max_map_count=524288"
            Set-WslSysctl "fs.file-max=131072"

            # ----------------------------------------------------
            # Start temporary SonarQube
            # ----------------------------------------------------

            Write-Host "`n[3/7] Starting SonarQube..." -ForegroundColor Cyan

            $port = Get-AvailablePort
            $hostUrl = "http://localhost:$port"

            Write-Host "Image: $SonarImage"
            Write-Host "Endpoint: $hostUrl"

            Invoke-WslDocker @(
                "run",
                "-d",
                "--name", $containerName,
                "-p", "0.0.0.0:$port`:9000",
                "--ulimit", "nofile=131072:131072",
                "--ulimit", "nproc=8192:8192",
                "--restart", "no",
                $SonarImage
            ) | Out-Null

            $containerStarted = $true

            # Capture initial logs for debugging
            Start-Sleep -Seconds 2
            try {
                $containerLogs = Invoke-WslDocker @("logs", "--tail", "50", $containerName)
            }
            catch {
                $containerLogs = "Unable to capture initial logs."
            }

            # ----------------------------------------------------
            # Wait for server readiness
            # ----------------------------------------------------

            Write-Host "Waiting for SonarQube initialization..."

            $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
            $serverReady = $false
            $attempt = 0

            while ((Get-Date) -lt $deadline) {
                $attempt++
                Write-Host "  Health check attempt $attempt..." -NoNewline

                try {
                    $status = Invoke-RestMethod `
                        -Uri "$hostUrl/api/system/status" `
                        -TimeoutSec 5

                    if ($status.status -eq "UP") {
                        Write-Host " UP" -ForegroundColor Green
                        $serverReady = $true
                        break
                    }
                    else {
                        Write-Host " $($status.status)"
                    }
                }
                catch {
                    Write-Host " Not ready yet"
                }

                Start-Sleep -Seconds 5

                try {
                    $running = Invoke-WslDocker @(
                        "inspect", "-f", "{{.State.Running}}", $containerName
                    )

                    if ($running -notmatch "true") {
                        $logs = Invoke-WslDocker @("logs", "--tail", "50", $containerName)
                        throw "SonarQube container stopped unexpectedly.`nLogs:`n$logs"
                    }
                }
                catch {
                    throw "SonarQube container is no longer available."
                }
            }

            if (-not $serverReady) {
                $logs = Invoke-WslDocker @("logs", "--tail", "100", $containerName)
                throw "SonarQube startup timed out after $StartupTimeoutSeconds seconds.`nLogs:`n$logs"
            }

            Write-Host "SonarQube is ready." -ForegroundColor Green

            # Additional wait for batch endpoint to be ready
            Write-Host "Waiting for batch services..."
            $batchReady = $false
            $batchAttempts = 0

            while ($batchAttempts -lt 30) {
                $batchAttempts++
                try {
                    $null = Invoke-RestMethod `
                        -Uri "$hostUrl/api/server/version" `
                        -TimeoutSec 5
                    $batchReady = $true
                    break
                }
                catch {
                    Start-Sleep -Seconds 2
                }
            }

            if (-not $batchReady) {
                throw "SonarQube batch services not ready after 60 seconds."
            }

            Write-Host "SonarQube fully operational." -ForegroundColor Green

            # Verify the API endpoints are ready before authentication
            Write-Host "Verifying API endpoints..."
            $apiReady = $false
            $apiAttempts = 0
            $maxApiAttempts = 60  # Increased to 2 minutes

            while ($apiAttempts -lt $maxApiAttempts) {
                $apiAttempts++
                try {
                    $null = Invoke-RestMethod `
                        -Uri "$hostUrl/api/server/version" `
                        -TimeoutSec 10
                    $apiReady = $true
                    break
                }
                catch {
                    # Check if container is still running
                    try {
                        $running = Invoke-WslDocker @(
                            "inspect", "-f", "{{.State.Running}}", $containerName
                        )
                        if ($running -notmatch "true") {
                            $logs = Invoke-WslDocker @("logs", "--tail", "100", $containerName)
                            throw "SonarQube container stopped unexpectedly during API verification.`nLogs:`n$logs"
                        }
                    }
                    catch {
                        throw "SonarQube container is no longer available during API verification."
                    }

                    Start-Sleep -Seconds 2
                }
            }

            if (-not $apiReady) {
                $logs = Invoke-WslDocker @("logs", "--tail", "100", $containerName)
                throw "SonarQube API endpoints not ready after $($maxApiAttempts * 2) seconds.`nLogs:`n$logs"
            }

            Write-Host "API endpoints ready." -ForegroundColor Green
        }

        # ----------------------------------------------------
        # Bootstrap temporary authentication
        # --------------------------------------------------------

        Write-Host "`n[4/7] Initializing temporary authentication..." `
            -ForegroundColor Cyan

        $adminHeaders = New-BasicAuthHeader "admin" "admin"

        # Generate a temporary user token directly using default admin credentials.
        $tokenName = "ephemeral-$([guid]::NewGuid().ToString('N'))"

        # Retry logic for token generation with exponential backoff
        $tokenResponse = $null
        $tokenAttempts = 0
        $maxTokenAttempts = 10

        while ($tokenAttempts -lt $maxTokenAttempts -and -not $tokenResponse) {
            $tokenAttempts++
            try {
                $tokenResponse = Invoke-RestMethod `
                    -Method Post `
                    -Uri "$hostUrl/api/user_tokens/generate" `
                    -Headers $adminHeaders `
                    -Body @{
                        name = $tokenName
                    } `
                    -TimeoutSec 15
            }
            catch {
                if ($tokenAttempts -lt $maxTokenAttempts) {
                    $waitTime = [Math]::Min(5 * $tokenAttempts, 30)
                    Write-Host "  Token generation attempt $tokenAttempts failed, retrying in $waitTime seconds..." -ForegroundColor Yellow
                    Start-Sleep -Seconds $waitTime
                }
                else {
                    throw "Failed to generate SonarQube token after $maxTokenAttempts attempts: $($_.Exception.Message)"
                }
            }
        }

        $sonarToken = $tokenResponse.token

        if (-not $sonarToken) {
            throw "Failed to generate a temporary SonarQube token."
        }

        $tokenHeaders = @{
            Authorization = "Bearer $sonarToken"
        }

        Write-Host "Temporary authentication initialized." `
            -ForegroundColor Green

        # Verify container is still running before scanner
        if ($containerStarted) {
            try {
                $running = Invoke-WslDocker @(
                    "inspect", "-f", "{{.State.Running}}", $containerName
                )
                if ($running -notmatch "true") {
                    $logs = Invoke-WslDocker @("logs", "--tail", "100", $containerName)
                    throw "SonarQube container stopped unexpectedly after authentication.`nLogs:`n$logs"
                }
            }
            catch {
                throw "SonarQube container is no longer available after authentication."
            }
        }

        # Short wait for server to be ready for scanner
        Start-Sleep -Seconds 5

        # ----------------------------------------------------
        # Prepare scanner configuration
        # ----------------------------------------------------

        $props = @(
            "sonar.projectKey=$key"
            "sonar.host.url=$hostUrl"
            "sonar.sources=$sources"
            "sonar.inclusions=$inclusions"
            "sonar.exclusions=$exclusions"
            "sonar.scm.disabled=true"
            "sonar.sourceEncoding=UTF-8"
            "sonar.language=ts"
            "sonar.typescript.node=22.13.0"
            "sonar.javascript.environments=browser,node"
        )

        $tmp = [IO.Path]::GetTempFileName()

        Set-Content -Path $tmp -Value $props -Encoding ASCII

        # Use environment variables instead of exposing the token
        # in the scanner command-line arguments.
        $env:SONAR_TOKEN = $sonarToken

        # Remove any previous report-task file.
        $report = Join-Path (Get-Location) ".scannerwork\report-task.txt"

        if (Test-Path $report) {
            Remove-Item $report -Force
        }

        # ----------------------------------------------------
        # Run scanner
        # ----------------------------------------------------

        Write-Host "`n[5/7] Running SonarScanner..." -ForegroundColor Cyan

        $scannerArgs = @("-Dproject.settings=$tmp")

        if ($VerboseScanner) {
            $scannerArgs += "-X"
        }

        # Run scanner synchronously. The managed SonarQube container remains
        # running throughout scanner upload, Compute Engine processing, and
        # the interactive report-review session.
        $scannerOutput = & sonar-scanner @scannerArgs 2>&1
        $scannerCode = $LASTEXITCODE

        if ($scannerCode -ne 0) {
            $exitCode = $scannerCode
            throw "SonarScanner failed (exit code $scannerCode). Check scanner diagnostics with -VerboseScanner if needed."
        }

        Write-Host "Scanner execution completed successfully." `
            -ForegroundColor Green

        # ----------------------------------------------------
        # Wait for Compute Engine processing
        # ----------------------------------------------------

        Write-Host "`n[6/7] Waiting for SonarQube processing..." `
            -ForegroundColor Cyan

        if (-not (Test-Path $report)) {
            throw "SonarScanner completed but report-task.txt was not generated. The analysis may not have been submitted."
        }

        $reportProperties = @{}
        Get-Content $report | ForEach-Object {
            if ($_ -match '^([^=]+)=(.*)$') {
                $reportProperties[$matches[1]] = $matches[2]
            }
        }

        $ceTaskUrl = $reportProperties["ceTaskUrl"]
        $ceTaskId = $reportProperties["ceTaskId"]
        $dashboardUrl = $reportProperties["dashboardUrl"]

        if (-not $ceTaskId -and $ceTaskUrl -match '[?&]id=([^&]+)') {
            $ceTaskId = [Uri]::UnescapeDataString($Matches[1])
        }

        if (-not $ceTaskId) {
            throw "Unable to locate ceTaskId in report-task.txt. The analysis may not have been submitted correctly."
        }

        if (-not $dashboardUrl) {
            $dashboardUrl = "$hostUrl/dashboard?id=$key"
        }

        # Poll the task through this server's API endpoint rather than relying
        # on ceTaskUrl's embedded host/proxy URL. This avoids localhost,
        # port-mapping, and URL-rewrite mismatches.
        $taskStatusUrl = "$hostUrl/api/ce/task?id=$([Uri]::EscapeDataString($ceTaskId))"
        $deadline = (Get-Date).AddSeconds($TaskTimeoutSeconds)
        $analysisCompleted = $false
        $lastTaskStatus = "PENDING"
        $lastPollError = $null

        while ((Get-Date) -lt $deadline) {
            try {
                $ceResponse = Invoke-RestMethod `
                    -Uri $taskStatusUrl `
                    -Headers $tokenHeaders `
                    -TimeoutSec 20

                $lastTaskStatus = [string]$ceResponse.task.status
                $lastPollError = $null

                switch ($lastTaskStatus) {
                    "SUCCESS" {
                        $analysisCompleted = $true
                        break
                    }
                    "FAILED" {
                        $errorMessage = $ceResponse.task.errorMessage
                        if (-not $errorMessage) { $errorMessage = "No server error detail was provided." }
                        throw "SonarQube server-side analysis failed: $errorMessage"
                    }
                    "CANCELED" {
                        throw "SonarQube analysis was canceled."
                    }
                    default {
                        # Keep terminal output quiet; the detailed analysis
                        # report is available in SonarQube after completion.
                        Write-Verbose "Compute Engine task status: $lastTaskStatus"
                    }
                }
            }
            catch {
                if ($_.Exception.Message -match 'server-side analysis failed|analysis was canceled') {
                    throw
                }
                $lastPollError = $_.Exception.Message
                Write-Verbose "Unable to read Compute Engine task status yet: $lastPollError"
            }

            if ($analysisCompleted) { break }
            Start-Sleep -Seconds 3
        }

        if (-not $analysisCompleted) {
            $timeoutDetail = "Timed out after $TaskTimeoutSeconds seconds waiting for Compute Engine task '$ceTaskId'. Last status: '$lastTaskStatus'."
            if ($lastPollError) {
                $timeoutDetail += " Last API error: $lastPollError"
            }
            throw $timeoutDetail
        }

        Write-Host "Analysis successfully processed by SonarQube." `
            -ForegroundColor Green

        # ----------------------------------------------------
        # Open browser and keep this terminal session alive
        # ----------------------------------------------------

        Write-Host "`n[7/7] Opening SonarQube report..." `
            -ForegroundColor Cyan
        Write-Host "Report URL: $dashboardUrl" -ForegroundColor White

        Start-Process $dashboardUrl

        Write-Host "`nSonarQube report is open in your browser." `
            -ForegroundColor Green
        Write-Host "Keep this terminal open while reviewing the report." `
            -ForegroundColor Gray
        Write-Host ""
        Write-Host "Choose an action when you are finished:" -ForegroundColor Cyan
        Write-Host "  [T] Terminate session and clean up managed resources"
        Write-Host "  [C] Close reporting session and clean up managed resources"

        do {
            $sessionChoice = (Read-Host "Your choice (T/C)").Trim().ToUpperInvariant()
            if ($sessionChoice -notin @("T", "C")) {
                Write-Host "Invalid choice. Enter T or C." -ForegroundColor Yellow
            }
        } while ($sessionChoice -notin @("T", "C"))

        if ($sessionChoice -eq "T") {
            Write-Host "Terminating SonarQube session..." -ForegroundColor Yellow
        }
        else {
            Write-Host "Closing reporting session..." -ForegroundColor Yellow
        }
    }
    else {
        # Analysis was skipped (no files to analyze)
        Write-Host "`nAnalysis skipped - no files matched the criteria." `
            -ForegroundColor Yellow
    }
}
catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red

    # Show container logs when server-side operations fail.
    if ($containerStarted) {
        Write-Host "`n--- SonarQube Container Logs ---" `
            -ForegroundColor DarkYellow

        try {
            $logs = Invoke-WslDocker @(
                "logs", "--tail", "100", $containerName
            )

            Write-Host $logs
        }
        catch {
            if ($containerLogs) {
                Write-Host "Using captured initial logs:"
                Write-Host $containerLogs
            }
            else {
                Write-Host "Container logs are no longer available."
            }
        }
    }

    if ($exitCode -eq 0) {
        $exitCode = 1
    }
}
finally {
    # --------------------------------------------------------
    # Revoke temporary authentication
    # --------------------------------------------------------

    if ($sonarToken -and $tokenHeaders -and $hostUrl) {
        try {
            Invoke-RestMethod `
                -Method Post `
                -Uri "$hostUrl/api/user_tokens/revoke" `
                -Headers $tokenHeaders `
                -Body @{ name = $tokenName } `
                -TimeoutSec 10 | Out-Null
        }
        catch {
            Write-Verbose "Temporary token revocation skipped."
        }
    }

    # --------------------------------------------------------
    # Stop and remove temporary container
    # --------------------------------------------------------

    if ($containerStarted) {
        Write-Host "`nCleaning up SonarQube container..." `
            -ForegroundColor Cyan

        try {
            # Force-remove only the ephemeral container created by this script.
            # `docker rm -f` stops it if necessary and removes it in one operation.
            Invoke-WslDocker @("rm", "-f", $containerName) | Out-Null

            Write-Host "Managed SonarQube container stopped and removed." `
                -ForegroundColor Green
        }
        catch {
            Write-Warning "Container cleanup failed: $($_.Exception.Message)"
        }
    }
    else {
        Write-Host "`nExisting SonarQube server was not started by this script; leaving it running." `
            -ForegroundColor Gray
    }

    # --------------------------------------------------------
    # Restore environment
    # --------------------------------------------------------

    if ($sonarTokenWasSet) {
        $env:SONAR_TOKEN = $previousSonarToken
    }
    else {
        Remove-Item Env:SONAR_TOKEN -ErrorAction SilentlyContinue
    }

    if ($tmp -and (Test-Path $tmp)) {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }

    Write-Host "`n Analysis Finished (Exit Code: $exitCode) " `
        -ForegroundColor Cyan
}

exit $exitCode

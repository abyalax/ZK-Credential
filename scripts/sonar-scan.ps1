[CmdletBinding()]
param(
    [ValidateSet("Full", "Changed", "Staged", "Folder")]
    [string]$Mode = "Full",

    [switch]$ShowLog,                    # Stream scanner output live
    [switch]$VerboseScanner,             # Enable scanner debug output (-X) and stream it

    [string]$Path = ".",                 # Used in Folder mode
    [string]$BaseRef = "HEAD",           # Comparison reference in Changed mode
    [string]$ProjectKey = "",            # Default: SONAR_PROJECT_KEY in .env
    [string[]]$Extensions = @("ts", "tsx"),

    [string]$SonarUrl = "",              # Existing SonarQube server URL (skips Docker)
    [string]$SonarImage = "sonarqube:lts-community",
    [string]$NodePath = "",              # Optional Node.js executable for the JS/TS analyzer
    [string]$AdminPassword = "",         # Default: SONAR_ADMIN_PASSWORD in .env, else built-in
    [int]$StartupTimeoutSeconds = 600,
    [int]$TaskTimeoutSeconds = 900
)

$ErrorActionPreference = "Stop"

# Configuration

$containerName = "sonar-ephemeral-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$containerStarted = $false
$wslKeepAlive = $null
$tokenName = $null
$sonarToken = $null
$tokenGenerated = $false
$adminHeaders = $null
$tokenHeaders = $null
$hostUrl = $null
$exitCode = 0

$previousSonarToken = $env:SONAR_TOKEN
$sonarTokenWasSet = Test-Path Env:SONAR_TOKEN
$previousScannerOpts = $env:SONAR_SCANNER_OPTS

$clock = [System.Diagnostics.Stopwatch]::StartNew()

# Helper functions

function Get-Elapsed {
    $t = $clock.Elapsed
    return ("{0:00}:{1:00}" -f [int][Math]::Floor($t.TotalMinutes), $t.Seconds)
}

function Write-Timing {
    param([string]$Label)
    Write-Host "  [$(Get-Elapsed)] $Label" -ForegroundColor DarkGray
}

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

function Assert-ContainerRunning {
    param(
        [Parameter(Mandatory)][string]$Name,
        [string]$Context = "unknown stage"
    )

    $running = $null

    try {
        $running = Invoke-WslDocker @(
            "inspect", "-f", "{{.State.Running}}", $Name
        )
    }
    catch {
        throw "SonarQube container is no longer available ($Context)."
    }

    if ($running -notmatch "true") {
        $logs = ""
        try {
            $logs = Invoke-WslDocker @("logs", "--tail", "100", $Name)
        }
        catch { }

        throw "SonarQube container stopped unexpectedly ($Context).`nLogs:`n$logs"
    }
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

function Get-WslIpAddresses {
    try {
        $out = & wsl.exe hostname -I 2>$null
        return @(
            ($out | Out-String) -split '\s+' |
                Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' }
        )
    }
    catch {
        return @()
    }
}

function Find-ReachableEndpoint {
    param(
        [Parameter(Mandatory)][int]$Port,
        [string[]]$ExtraHosts = @()
    )

    # IP literals only: avoids IPv4/IPv6 resolution differences.
    $candidates = @("http://127.0.0.1:$Port") +
                  @($ExtraHosts | ForEach-Object { "http://${_}:$Port" }) +
                  @("http://[::1]:$Port")

    foreach ($candidate in $candidates) {
        try {
            $null = Invoke-RestMethod -Uri "$candidate/api/system/status" -TimeoutSec 3
            return $candidate
        }
        catch { }
    }

    return $null
}

function Start-WslKeepAlive {
    # WSL2 stops the distro (including dockerd and every container in it)
    # shortly after the last wsl.exe session ends. Hold one session open
    # for the entire run.
    $process = Start-Process -FilePath "wsl.exe" `
        -ArgumentList @("--exec", "sleep", "infinity") `
        -WindowStyle Hidden -PassThru

    Start-Sleep -Milliseconds 500

    if ($process.HasExited) {
        throw "Failed to start the WSL keep-alive session (exit code $($process.ExitCode))."
    }

    return $process
}

function Stop-WslKeepAlive {
    param($Process)

    if ($Process -and -not $Process.HasExited) {
        try { Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue }
        catch { }
    }
}

function Get-AnalysisScope {
    $extPattern = "\.(" + ($Extensions -join "|") + ")$"

    $scope = @{
        Skip       = $false
        Key        = $ProjectKey
        Sources    = "."
        Inclusions = (($Extensions | ForEach-Object { "**/*.$_" }) -join ",")
    }

    switch ($Mode) {
        "Full" {
            Write-Host "Analysis mode: Full"
        }

        "Folder" {
            if (-not (Test-Path $Path)) {
                throw "Folder not found: $Path"
            }

            $scope.Sources = ((Resolve-Path -Relative $Path) -replace "\\", "/")
            $scope.Key = "$ProjectKey-partial"

            Write-Host "Analysis mode: Folder"
            Write-Host "Target: $($scope.Sources)"
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

                $scope.Skip = $true
                return $scope
            }

            $files | ForEach-Object { Write-Host "  $_" }

            $scope.Inclusions = ($files -replace "\\", "/") -join ","
            $scope.Key = "$ProjectKey-partial"
        }
    }

    return $scope
}

function Invoke-SonarAnalysis {
    param(
        [Parameter(Mandatory)][hashtable]$Scope
    )

    $props = @(
        "sonar.projectKey=$($Scope.Key)"
        "sonar.host.url=$hostUrl"
        "sonar.login=$sonarToken"
        "sonar.sources=$($Scope.Sources)"
        "sonar.inclusions=$($Scope.Inclusions)"
        "sonar.exclusions=$exclusions"
        "sonar.scm.disabled=true"
        "sonar.sourceEncoding=UTF-8"
        "sonar.javascript.environments=browser,node"
        "sonar.javascript.node.maxspace=4096"
    )

    if ($NodePath) {
        $props += "sonar.nodejs.executable=$($NodePath -replace '\\', '/')"
    }

    $propsFile = [IO.Path]::GetTempFileName()
    $report = Join-Path (Get-Location) ".scannerwork\report-task.txt"

    try {
        Set-Content -Path $propsFile -Value $props -Encoding ASCII

        if (Test-Path $report) {
            Remove-Item $report -Force
        }

        # ------------------------------------------------
        # Run scanner
        # ------------------------------------------------

        Write-Host "`n[5/7] Running SonarScanner..." -ForegroundColor Cyan

        $scannerArgs = @("-Dproject.settings=$propsFile")

        if ($VerboseScanner) {
            $scannerArgs += "-X"
        }

        $streamOutput = $VerboseScanner -or $ShowLog
        $scannerLines = [System.Collections.Generic.List[string]]::new()

        # Native stderr + $ErrorActionPreference=Stop would turn scanner
        # warnings into terminating errors in Windows PowerShell 5.1.
        $previousEap = $ErrorActionPreference
        $ErrorActionPreference = "Continue"

        try {
            & sonar-scanner @scannerArgs 2>&1 | ForEach-Object {
                $line = "$_"
                $scannerLines.Add($line)

                if ($streamOutput) {
                    Write-Host $line
                }
            }

            $scannerCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previousEap
        }

        if ($scannerCode -ne 0) {
            $scannerLog = Join-Path ([IO.Path]::GetTempPath()) `
                "sonar-scanner-$([guid]::NewGuid().ToString('N').Substring(0, 8)).log"
            Set-Content -Path $scannerLog -Value $scannerLines -Encoding UTF8

            if (-not $streamOutput) {
                Write-Host "`n--- SonarScanner output (last 40 lines, stack frames hidden) ---" `
                    -ForegroundColor DarkYellow

                $scannerLines |
                    Where-Object {
                        $_ -notmatch '^\s+at ' -and
                        $_ -notmatch '^\s+\.\.\. \d+ (common frames omitted|more)$'
                    } |
                    Select-Object -Last 40 |
                    ForEach-Object { Write-Host $_ }
            }

            Write-Host "`nFull scanner log: $scannerLog" -ForegroundColor DarkYellow

            if ($containerStarted) {
                Assert-ContainerRunning -Name $containerName -Context "while SonarScanner was running"
            }

            throw "SonarScanner failed (exit code $scannerCode). See the scanner output above."
        }

        Write-Host "Scanner execution completed successfully." -ForegroundColor Green
        Write-Timing "scanner finished"

        # ------------------------------------------------
        # Wait for Compute Engine processing
        # ------------------------------------------------

        Write-Host "`n[6/7] Waiting for SonarQube processing..." -ForegroundColor Cyan

        if (-not (Test-Path $report)) {
            throw "SonarScanner completed but report-task.txt was not generated. The analysis may not have been submitted."
        }

        $reportProperties = @{}
        Get-Content $report | ForEach-Object {
            if ($_ -match '^([^=]+)=(.*)$') {
                $reportProperties[$Matches[1]] = $Matches[2]
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
            $dashboardUrl = "$hostUrl/dashboard?id=$($Scope.Key)"
        }

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

                if ($containerStarted) {
                    Assert-ContainerRunning -Name $containerName -Context "Compute Engine processing"
                }
            }

            if ($analysisCompleted) { break }
            Start-Sleep -Seconds 1
        }

        if (-not $analysisCompleted) {
            $timeoutDetail = "Timed out after $TaskTimeoutSeconds seconds waiting for Compute Engine task '$ceTaskId'. Last status: '$lastTaskStatus'."
            if ($lastPollError) {
                $timeoutDetail += " Last API error: $lastPollError"
            }
            throw $timeoutDetail
        }

        Write-Host "Analysis successfully processed by SonarQube." -ForegroundColor Green
        Write-Timing "server-side processing finished"

        return $dashboardUrl
    }
    finally {
        if (Test-Path $propsFile) {
            Remove-Item $propsFile -Force -ErrorAction SilentlyContinue
        }
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

    # Token supplied by the environment/.env (only used with -SonarUrl).
    $externalToken = $env:SONAR_TOKEN

    if (-not $ProjectKey) {
        $ProjectKey = if ($env:SONAR_PROJECT_KEY) {
            $env:SONAR_PROJECT_KEY
        }
        else {
            "ZK-Credential"
        }
    }

    # Admin password policy (SonarQube 9.9): >= 12 chars, mixed case, digit, symbol.
    $explicitPassword = if ($AdminPassword) { $AdminPassword }
                        elseif ($env:SONAR_ADMIN_PASSWORD) { $env:SONAR_ADMIN_PASSWORD }
                        else { $null }

    $resolvedAdminPassword = if ($explicitPassword) { $explicitPassword } else { "Zk-Credential#Local2026" }

    # Password currently valid on the server. A fresh container starts with "admin".
    $currentAdminPassword = "admin"

    if ($SonarUrl -and $explicitPassword) {
        $currentAdminPassword = $explicitPassword
    }

    # --------------------------------------------------------
    # Validate scanner
    # --------------------------------------------------------

    if (-not (Get-Command sonar-scanner -ErrorAction SilentlyContinue)) {
        throw "sonar-scanner was not found in PATH."
    }

    if ($NodePath -and -not (Test-Path $NodePath)) {
        throw "NodePath not found: $NodePath"
    }

    # Larger heap for the scanner JVM (this machine has plenty of RAM).
    $env:SONAR_SCANNER_OPTS = "-Xmx3072m"

    $exclusions = "**/node_modules/**,**/dist/**,**/build/**,**/coverage/**,**/*.d.ts," +
                  "**/artifacts/**,**/cache/**,**/typechain-types/**,**/.next/**,**/out/**"

    # --------------------------------------------------------
    # Determine analysis scope
    # --------------------------------------------------------

    $scope = Get-AnalysisScope

    if ($scope.Skip) {
        Write-Host "`nAnalysis skipped - no files matched the criteria." `
            -ForegroundColor Yellow
    }
    else {
        Write-Host "`nProject key: $($scope.Key)"
        Write-Host "Extensions: $($Extensions -join ', ')"

        # ----------------------------------------------------
        # Use existing server or start Docker
        # ----------------------------------------------------

        if ($SonarUrl) {
            $hostUrl = $SonarUrl.TrimEnd("/")
            Write-Host "`nUsing existing SonarQube server: $hostUrl" -ForegroundColor Cyan
        }
        else {
            # Keep WSL (and therefore Docker) alive for the whole run.
            $wslKeepAlive = Start-WslKeepAlive

            Write-Host "`n[1/7] Checking WSL Docker..." -ForegroundColor Cyan

            $dockerVersion = Invoke-WslDocker @(
                "info", "--format", "{{.ServerVersion}}"
            )

            Write-Host "Docker Engine: $dockerVersion" -ForegroundColor Green

            Write-Host "`n[2/7] Configuring WSL kernel..." -ForegroundColor Cyan

            Set-WslSysctl "vm.max_map_count=524288"
            Set-WslSysctl "fs.file-max=131072"

            Write-Host "`n[3/7] Starting SonarQube..." -ForegroundColor Cyan

            $port = Get-AvailablePort

            Write-Host "Image: $SonarImage"
            Write-Host "Host port: $port"

            # Larger heaps for Compute Engine (report processing) and web.
            Invoke-WslDocker @(
                "run",
                "-d",
                "--name", $containerName,
                "-p", "0.0.0.0:$port`:9000",
                "--ulimit", "nofile=131072:131072",
                "--ulimit", "nproc=8192:8192",
                "-e", "SONAR_CE_JAVAOPTS=-Xmx3g",
                "-e", "SONAR_WEB_JAVAOPTS=-Xmx1g",
                "--restart", "no",
                $SonarImage
            ) | Out-Null

            $containerStarted = $true
            $wslIps = Get-WslIpAddresses

            Write-Host "Waiting for SonarQube initialization..."

            $hostUrl = $null
            $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
            $serverReady = $false
            $pollCount = 0
            $lastState = ""

            while ((Get-Date) -lt $deadline) {
                $pollCount++
                $state = "NOT_READY"

                if (-not $hostUrl) {
                    $hostUrl = Find-ReachableEndpoint -Port $port -ExtraHosts $wslIps
                }

                if ($hostUrl) {
                    try {
                        $status = Invoke-RestMethod `
                            -Uri "$hostUrl/api/system/status" `
                            -TimeoutSec 5

                        $state = [string]$status.status

                        if ($state -eq "UP") {
                            $serverReady = $true
                        }
                    }
                    catch {
                        $state = "NOT_READY"
                        $hostUrl = $null    # re-resolve on the next poll
                    }
                }

                if ($state -ne $lastState) {
                    Write-Host "  [$(Get-Elapsed)] SonarQube status: $state"
                    $lastState = $state
                }

                if ($serverReady) { break }

                Start-Sleep -Seconds 2

                if ($pollCount % 3 -eq 0) {
                    Assert-ContainerRunning -Name $containerName -Context "startup"
                }
            }

            if (-not $serverReady) {
                $logs = Invoke-WslDocker @("logs", "--tail", "100", $containerName)
                throw "SonarQube startup timed out after $StartupTimeoutSeconds seconds.`nLogs:`n$logs"
            }

            Write-Host "SonarQube is ready at $hostUrl" -ForegroundColor Green

            # Replace default admin/admin so SonarQube does not force a
            # password change on first login in the browser.
            Write-Host "Setting admin password..."

            $passwordChanged = $false
            $passwordAttempts = 0

            while (-not $passwordChanged) {
                $passwordAttempts++
                try {
                    Invoke-RestMethod `
                        -Method Post `
                        -Uri "$hostUrl/api/users/change_password" `
                        -Headers (New-BasicAuthHeader "admin" "admin") `
                        -Body @{
                            login            = "admin"
                            previousPassword = "admin"
                            password         = $resolvedAdminPassword
                        } `
                        -TimeoutSec 15 | Out-Null

                    $passwordChanged = $true
                }
                catch {
                    if ($passwordAttempts -ge 10) {
                        throw "Failed to set the admin password: $($_.Exception.Message) (check the password policy)"
                    }
                    Start-Sleep -Seconds 2
                }
            }

            $currentAdminPassword = $resolvedAdminPassword
            Write-Host "Admin password set." -ForegroundColor Green
        }

        # ----------------------------------------------------
        # Authentication
        # ----------------------------------------------------

        Write-Host "`n[4/7] Initializing authentication..." -ForegroundColor Cyan

        if ($SonarUrl -and $externalToken) {
            $sonarToken = $externalToken
            Write-Host "Using SONAR_TOKEN from environment/.env." -ForegroundColor Green
        }
        else {
            $adminHeaders = New-BasicAuthHeader "admin" $currentAdminPassword
            $tokenName = "ephemeral-$([guid]::NewGuid().ToString('N'))"

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
                        -Body @{ name = $tokenName } `
                        -TimeoutSec 15
                }
                catch {
                    if ($tokenAttempts -lt $maxTokenAttempts) {
                        $waitTime = [Math]::Min(2 * $tokenAttempts, 10)
                        Write-Host "  Token generation attempt $tokenAttempts failed, retrying in $waitTime seconds..." -ForegroundColor Yellow
                        Start-Sleep -Seconds $waitTime
                    }
                    else {
                        throw "Failed to generate SonarQube token after $maxTokenAttempts attempts: $($_.Exception.Message)"
                    }
                }
            }

            $sonarToken = $tokenResponse.token
            $tokenGenerated = [bool]$sonarToken
        }

        if (-not $sonarToken) {
            throw "Failed to obtain a SonarQube token."
        }

        # SonarQube 9.9 expects Basic auth (token as username, empty password).
        $tokenHeaders = New-BasicAuthHeader $sonarToken ""
        $env:SONAR_TOKEN = $sonarToken

        Write-Host "Authentication initialized." -ForegroundColor Green

        # ----------------------------------------------------
        # Analyze
        # ----------------------------------------------------

        $dashboardUrl = @(Invoke-SonarAnalysis -Scope $scope)[-1]

        # ----------------------------------------------------
        # Open browser and keep the server alive until the user
        # explicitly terminates it
        # ----------------------------------------------------

        Write-Host "`n[7/7] Opening SonarQube report..." -ForegroundColor Cyan
        Write-Host "Report URL: $dashboardUrl" -ForegroundColor White
        Write-Timing "report ready"

        Start-Process $dashboardUrl

        if ($containerStarted) {
            Write-Host "`nSonarQube report is open in your browser." -ForegroundColor Green
            Write-Host "The SonarQube server stays RUNNING while this terminal is waiting." -ForegroundColor Green
            Write-Host "Closing the browser does NOT stop the server." -ForegroundColor Gray
            Write-Host "Login: admin / $resolvedAdminPassword" -ForegroundColor White
            Write-Host ""
            Write-Host "Commands:" -ForegroundColor Cyan
            Write-Host "  RESCAN (R)     run the analysis again on this server (no restart), then refresh the browser"
            Write-Host "  TERMINATE (T)  stop the server and clean up   (Ctrl+C does the same)"

            while ($true) {
                $answer = (Read-Host "`nCommand").Trim().ToUpperInvariant()

                if ($answer -in @("T", "TERMINATE")) {
                    Write-Host "Terminating SonarQube session..." -ForegroundColor Yellow
                    break
                }

                if ($answer -in @("R", "RESCAN")) {
                    try {
                        Assert-ContainerRunning -Name $containerName -Context "before rescan"

                        $scope = Get-AnalysisScope

                        if ($scope.Skip) {
                            continue
                        }

                        $dashboardUrl = @(Invoke-SonarAnalysis -Scope $scope)[-1]

                        Write-Host "`nReport updated. Refresh the browser tab: $dashboardUrl" `
                            -ForegroundColor Green
                    }
                    catch {
                        Write-Host "`nRESCAN failed: $($_.Exception.Message)" -ForegroundColor Red

                        try {
                            Assert-ContainerRunning -Name $containerName -Context "after failed rescan"
                            Write-Host "The server is still running. Fix the problem and type RESCAN again." `
                                -ForegroundColor Gray
                        }
                        catch {
                            Write-Host "WARNING: $($_.Exception.Message)" -ForegroundColor Yellow
                            $containerStarted = $false
                            break
                        }
                    }

                    continue
                }

                try {
                    Assert-ContainerRunning -Name $containerName -Context "report review"
                    Write-Host "Server is still running at $hostUrl. Type RESCAN or TERMINATE." `
                        -ForegroundColor Gray
                }
                catch {
                    Write-Host "WARNING: $($_.Exception.Message)" -ForegroundColor Yellow
                    $containerStarted = $false
                    break
                }
            }
        }
        else {
            Write-Host "`nUsing an existing server; nothing to wait for." -ForegroundColor Gray
        }
    }
}
catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red

    if ($containerStarted) {
        Write-Host "`n--- SonarQube Container Logs ---" -ForegroundColor DarkYellow

        try {
            Write-Host (Invoke-WslDocker @("logs", "--tail", "100", $containerName))
        }
        catch {
            Write-Host "Container logs are no longer available."
        }
    }

    if ($exitCode -eq 0) {
        $exitCode = 1
    }
}
finally {
    # Revoke the token only on an existing server (a managed container is
    # removed below anyway).
    if ($tokenGenerated -and $SonarUrl -and $adminHeaders -and $hostUrl -and $tokenName) {
        try {
            Invoke-RestMethod `
                -Method Post `
                -Uri "$hostUrl/api/user_tokens/revoke" `
                -Headers $adminHeaders `
                -Body @{ name = $tokenName } `
                -TimeoutSec 10 | Out-Null
        }
        catch {
            Write-Verbose "Temporary token revocation skipped."
        }
    }

    # Reached only after explicit TERMINATE / Ctrl+C, or on failure.
    if ($containerStarted) {
        Write-Host "`nCleaning up SonarQube container..." -ForegroundColor Cyan

        try {
            Invoke-WslDocker @("rm", "-f", $containerName) | Out-Null

            Write-Host "Managed SonarQube container stopped and removed." -ForegroundColor Green
        }
        catch {
            Write-Warning "Container cleanup failed: $($_.Exception.Message)"
        }
    }
    elseif ($SonarUrl) {
        Write-Host "`nExisting SonarQube server was not started by this script; leaving it running." `
            -ForegroundColor Gray
    }

    # Must come after `docker rm`, which still needs WSL.
    Stop-WslKeepAlive $wslKeepAlive

    if ($sonarTokenWasSet) {
        $env:SONAR_TOKEN = $previousSonarToken
    }
    else {
        Remove-Item Env:SONAR_TOKEN -ErrorAction SilentlyContinue
    }

    if ($null -ne $previousScannerOpts) {
        $env:SONAR_SCANNER_OPTS = $previousScannerOpts
    }
    else {
        Remove-Item Env:SONAR_SCANNER_OPTS -ErrorAction SilentlyContinue
    }

    Write-Host "`n Analysis Finished (Exit Code: $exitCode) " -ForegroundColor Cyan
}

exit $exitCode
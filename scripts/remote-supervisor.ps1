# Keeps the phone remote running.
# Double-click "Start Remote.bat". This window watches both servers.
# It restarts them if they crash, stop answering, or the PC wakes from sleep.
# Output is shown in each server window and saved under logs\.
param(
  [ValidateSet('supervisor', 'backend', 'frontend')]
  [string]$Role = 'supervisor'
)

$ErrorActionPreference = 'Continue'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$LogDir = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Log([string]$File, [string]$Message) {
  $path = Join-Path $LogDir $File
  if ((Test-Path $path) -and ((Get-Item $path).Length -gt 5MB)) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    Move-Item $path "$path.$stamp" -Force
    Get-ChildItem "$path.*" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 5 | Remove-Item -Force
  }
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -Path $path -Value $line -Encoding utf8
  Write-Host $line
}

function Test-OurProcess($proc) {
  if (-not $proc -or -not $proc.CommandLine) { return $false }
  $cmd = $proc.CommandLine
  return ($cmd -like "*$Root*") -and ($cmd -match 'node\.exe|python\.exe|app\.py|start-server\.js|\\next')
}

function Stop-Tree([int]$ProcId) {
  & taskkill.exe /PID $ProcId /T /F 2>$null | Out-Null
}

function Get-OurRoot([int]$ProcId) {
  $top = $ProcId
  $current = $ProcId
  while ($current -gt 0) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue
    if (-not (Test-OurProcess $proc)) { break }
    $top = $current
    $current = [int]$proc.ParentProcessId
  }
  return $top
}

function Stop-Logged([string]$Name) {
  $file = Join-Path $LogDir "$Name.pid"
  if (-not (Test-Path $file)) { return }
  $procId = 0
  [void][int]::TryParse((Get-Content $file -Raw).Trim(), [ref]$procId)
  if ($procId -le 0) { return }
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
  if (-not $proc) { return }
  if (Test-OurProcess $proc) {
    Stop-Tree (Get-OurRoot $procId)
    Write-Log 'supervisor.log' "Stopped $Name (pid $procId) so it can restart"
  }
}

function Clear-OurPort([int]$Port) {
  $lines = netstat -ano -p TCP | Select-String -Pattern ":$Port\s+\S+\s+LISTENING\s+(\d+)"
  $stopped = @()
  foreach ($line in $lines) {
    $procId = [int]$line.Matches[0].Groups[1].Value
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
    if (-not (Test-OurProcess $proc)) { continue }
    $root = Get-OurRoot $procId
    if ($stopped -contains $root) { continue }
    Stop-Tree $root
    $stopped += $root
    Write-Log "$Role.log" "Freed port $Port (pid $root)"
  }
  if (-not $stopped.Count) { return }
  for ($i = 0; $i -lt 15; $i++) {
    $busy = netstat -ano -p TCP | Select-String -Pattern ":$Port\s+\S+\s+LISTENING"
    if (-not $busy) { return }
    Start-Sleep -Milliseconds 300
  }
  Write-Log "$Role.log" "Port $Port is still in use after stopping the old process"
}

function Start-RoleWindow([string]$Name) {
  Start-Process -FilePath 'powershell.exe' -WorkingDirectory $Root -ArgumentList @(
    '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-Role', $Name
  ) | Out-Null
}

function Invoke-GitPull {
  $git = (Get-Command git -ErrorAction SilentlyContinue).Source
  if (-not $git) {
    Write-Log 'supervisor.log' 'git not found. Starting with the local files.'
    return
  }
  Write-Log 'supervisor.log' "Pulling latest in $Root"
  Push-Location $Root
  try {
    $out = & $git pull --ff-only 2>&1 | ForEach-Object { "$_" }
    foreach ($line in $out) { Write-Log 'supervisor.log' $line }
    if ($LASTEXITCODE -ne 0) {
      Write-Log 'supervisor.log' "git pull failed (exit $LASTEXITCODE). Starting anyway."
    }
  } catch {
    Write-Log 'supervisor.log' "git pull failed: $_. Starting anyway."
  } finally {
    Pop-Location
  }
}

if ($Role -eq 'supervisor') {
  $created = $false
  $mutex = New-Object System.Threading.Mutex($true, 'MovieControllerRemoteSupervisor', [ref]$created)
  if (-not $created) {
    Write-Host 'Remote is already running. Close that supervisor window first.'
    return
  }

  Write-Host 'Remote supervisor'
  Write-Host 'Backend   http://127.0.0.1:9282'
  Write-Host 'Frontend  http://127.0.0.1:9283'
  Write-Host "Logs      $LogDir"
  Write-Host 'Close this window, then the two server windows, to stop.'
  Write-Host ''
  Write-Log 'supervisor.log' 'Supervisor started'
  Invoke-GitPull

  Start-RoleWindow 'backend'
  Start-RoleWindow 'frontend'

  $fail = @{ backend = 0; frontend = 0 }
  $tick = [datetime]::UtcNow
  try {
    while ($true) {
      Start-Sleep -Seconds 5
      $now = [datetime]::UtcNow
      $gap = ($now - $tick).TotalSeconds
      $tick = $now
      if ($gap -gt 30) {
        Write-Log 'supervisor.log' "Woke from sleep (${gap}s gap). Restarting both servers."
        Stop-Logged 'backend'
        Stop-Logged 'frontend'
        $fail.backend = 0
        $fail.frontend = 0
        continue
      }
      foreach ($check in @(
          @{ Name = 'backend'; Url = 'http://127.0.0.1:9282/' },
          @{ Name = 'frontend'; Url = 'http://127.0.0.1:9283/' }
        )) {
        $pidFile = Join-Path $LogDir "$($check.Name).pid"
        if (-not (Test-Path $pidFile)) { continue }
        if (((Get-Date) - (Get-Item $pidFile).LastWriteTime).TotalSeconds -lt 45) { continue }
        $ok = $false
        try {
          $ProgressPreference = 'SilentlyContinue'
          Invoke-WebRequest -Uri $check.Url -UseBasicParsing -TimeoutSec 5 | Out-Null
          $ok = $true
        } catch {}
        if ($ok) {
          $fail[$check.Name] = 0
        } else {
          $fail[$check.Name]++
          Write-Log 'supervisor.log' "$($check.Name) did not answer ($($fail[$check.Name])/3)"
          if ($fail[$check.Name] -ge 3) {
            Write-Log 'supervisor.log' "$($check.Name) looks stuck. Restarting it."
            Stop-Logged $check.Name
            $fail[$check.Name] = 0
          }
        }
      }
    }
  } finally {
    Stop-Logged 'backend'
    Stop-Logged 'frontend'
    Write-Log 'supervisor.log' 'Supervisor stopped'
    $mutex.ReleaseMutex() | Out-Null
    $mutex.Dispose()
  }
  return
}

# One server, in its own window. Restarts itself after a crash.
$host.UI.RawUI.WindowTitle = "Remote $Role"
$fast = 0
while ($true) {
  if ($Role -eq 'backend') {
    $python = Join-Path $Root 'backend\venv\Scripts\python.exe'
    if (-not (Test-Path $python)) {
      Write-Log 'backend.log' "Missing $python. Create the backend venv, then this will retry."
      Start-Sleep -Seconds 20
      continue
    }
    $file = $python
    $argList = @('-u', 'app.py')
    $workdir = Join-Path $Root 'backend'
    $port = 9282
  } else {
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    $next = Join-Path $Root 'frontend\node_modules\next\dist\bin\next'
    if (-not $node -or -not (Test-Path $next)) {
      Write-Log 'frontend.log' 'Node or Next.js is missing. Install frontend dependencies, then this will retry.'
      Start-Sleep -Seconds 20
      continue
    }
    $file = $node
    $argList = @($next, 'dev', '-p', '9283', '-H', '0.0.0.0')
    $workdir = Join-Path $Root 'frontend'
    $port = 9283
  }

  Clear-OurPort $port
  Write-Log "$Role.log" "Starting $Role"

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $file
  $psi.Arguments = ($argList | ForEach-Object { if ($_ -match '\s') { '"{0}"' -f $_ } else { $_ } }) -join ' '
  $psi.WorkingDirectory = $workdir
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.StandardOutputEncoding = [Text.Encoding]::UTF8
  $psi.StandardErrorEncoding = [Text.Encoding]::UTF8
  $psi.CreateNoWindow = $true
  $psi.EnvironmentVariables['PYTHONUNBUFFERED'] = '1'
  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  $queue = New-Object 'System.Collections.Concurrent.ConcurrentQueue[string]'
  Register-ObjectEvent -InputObject $proc -EventName OutputDataReceived -MessageData $queue -Action {
    if ($EventArgs.Data) { $Event.MessageData.Enqueue([string]$EventArgs.Data) }
  } | Out-Null
  Register-ObjectEvent -InputObject $proc -EventName ErrorDataReceived -MessageData $queue -Action {
    if ($EventArgs.Data) { $Event.MessageData.Enqueue("ERROR: $($EventArgs.Data)") }
  } | Out-Null
  [void]$proc.Start()
  $proc.BeginOutputReadLine()
  $proc.BeginErrorReadLine()
  Set-Content -Path (Join-Path $LogDir "$Role.pid") -Value $proc.Id -Encoding ascii
  $started = Get-Date

  while (-not $proc.HasExited) {
    $item = $null
    while ($queue.TryDequeue([ref]$item)) { Write-Log "$Role.log" $item }
    Start-Sleep -Milliseconds 200
  }
  $proc.WaitForExit()
  Start-Sleep -Milliseconds 300
  $item = $null
  while ($queue.TryDequeue([ref]$item)) { Write-Log "$Role.log" $item }
  $code = $proc.ExitCode
  Remove-Item (Join-Path $LogDir "$Role.pid") -ErrorAction SilentlyContinue
  Get-EventSubscriber | Unregister-Event
  $proc.Dispose()

  $ran = ((Get-Date) - $started).TotalSeconds
  if ($ran -lt 8) { $fast++ } else { $fast = 0 }
  $wait = 3
  if ($fast -ge 4) { $wait = 20 }
  Write-Log "$Role.log" "Exited with code $code after $([int]$ran)s. Restarting in $wait s."
  Start-Sleep -Seconds $wait
}

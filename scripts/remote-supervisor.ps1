# Keeps the phone remote running.
# Double-click "Start Remote.bat". This window watches both servers.
# It restarts them if they crash, stop answering, or the PC wakes from sleep.
# Output is shown in each server window and saved under logs\.
#
# Updates (a new commit upstream) restart only the two servers: the remote's
# Chrome stays open and keeps playing, and the backend re-attaches to it. The
# phone page is built into a second folder while the old one keeps serving,
# so it's only down for the few seconds the servers take to restart.
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

# Close a server's whole window: its restart loop and the server under it.
# Stopping only the server isn't enough, because the window's loop restarts it.
# Also catches windows left over from an earlier supervisor run.
function Stop-RoleWindow([string]$Name) {
  $scriptName = Split-Path $PSCommandPath -Leaf
  $windows = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like "*$scriptName*" -and $_.CommandLine -match "-Role\s+$Name\b" }
  foreach ($w in $windows) {
    Stop-Tree ([int]$w.ProcessId)
    Write-Log 'supervisor.log' "Closed old $Name window (pid $($w.ProcessId))"
  }
  # A server whose window is already gone can still hold the port.
  Stop-Logged $Name
}

# The phone page's build folders. The server serves from the one named in
# frontend\.next-active; an update is built into the other one meanwhile.
$FrontendDir = Join-Path $Root 'frontend'
$DistMarker = Join-Path $FrontendDir '.next-active'

function Get-FrontendDist {
  if (Test-Path $DistMarker) {
    $d = (Get-Content $DistMarker -Raw).Trim()
    if ($d -in @('.next', '.next-b')) { return $d }
  }
  return '.next'
}

# Build the phone page into the folder the running server isn't using, then
# make it the active one. Returns $true when the new build is ready.
function Build-FrontendAhead {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  $next = Join-Path $FrontendDir 'node_modules\next\dist\bin\next'
  if (-not $node -or -not (Test-Path $next)) { return $false }
  $target = if ((Get-FrontendDist) -eq '.next') { '.next-b' } else { '.next' }
  Write-Log 'supervisor.log' "Building the updated phone page into $target (the current one keeps serving)..."
  Push-Location $FrontendDir
  $env:NEXT_DIST_DIR = $target
  try {
    & $node $next build 2>&1 | ForEach-Object { Write-Log 'frontend.log' "$_" }
    $ok = ($LASTEXITCODE -eq 0)
  } finally {
    Remove-Item Env:NEXT_DIST_DIR -ErrorAction SilentlyContinue
    Pop-Location
  }
  if ($ok) {
    Set-Content -Path $DistMarker -Value $target -Encoding ascii
    Write-Log 'supervisor.log' 'Updated phone page is built.'
  } else {
    Write-Log 'supervisor.log' 'Building the update failed; the frontend will rebuild when it restarts.'
  }
  return $ok
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

  # Never run two copies of a server: close leftovers first.
  Stop-RoleWindow 'backend'
  Stop-RoleWindow 'frontend'
  Start-RoleWindow 'backend'
  Start-RoleWindow 'frontend'

  $fail = @{ backend = 0; frontend = 0 }
  $tick = [datetime]::UtcNow
  $gitTick = 0          # counter for the 2-minute git-check cycle
  $needRestart = $false  # set true when git pull fetched changes
  try {
    while ($true) {
      Start-Sleep -Seconds 5
      $gitTick++

      # Every 2 minutes (24 × 5s): fetch, then pull and restart if remote changed.
      if ($gitTick -ge 24) {
        $gitTick = 0
        try {
          Push-Location $Root
          Write-Log 'supervisor.log' 'Checking for git updates…'

          # Always fetch from remote.
          $out = & git fetch --quiet 2>&1 | ForEach-Object { "$_" }
          foreach ($line in $out) { if ($line) { Write-Log 'supervisor.log' $line } }

          # New code means commits upstream that we don't have. A local commit
          # that isn't pushed yet makes the hashes differ too, but has nothing
          # to pull.
          $remoteHash = & git rev-parse '@{u}' 2>$null
          $behind = 0
          [void][int]::TryParse((& git rev-list --count 'HEAD..@{u}' 2>$null), [ref]$behind)
          Pop-Location

          if ($behind -gt 0 -and $remoteHash) {
            Write-Log 'supervisor.log' "Update available ($remoteHash). Chrome stays open; only the servers restart."
            $needRestart = $true
          }
        } catch {
          Write-Log 'supervisor.log' "Git check failed: $_"
        }
      }

      if ($needRestart) {
        # Pull and build while the old servers keep running (Python has its
        # code loaded already, and the phone page serves from its own build
        # folder), then swap the servers over. Chrome is never touched.
        Write-Log 'supervisor.log' 'Pulling latest...'
        try {
          Push-Location $Root
          $out = & git pull --ff-only 2>&1 | ForEach-Object { "$_" }
          foreach ($line in $out) { Write-Log 'supervisor.log' $line }
        } catch {
          Write-Log 'supervisor.log' "git pull failed: $_. Restarting anyway."
        } finally {
          Pop-Location
        }
        $needRestart = $false
        [void](Build-FrontendAhead)
        Write-Log 'supervisor.log' 'Restarting the servers with the new code (Chrome stays as it is)...'
        Stop-RoleWindow 'backend'
        Stop-RoleWindow 'frontend'
        Start-Sleep -Seconds 2
        Start-RoleWindow 'backend'
        Start-RoleWindow 'frontend'
        Write-Log 'supervisor.log' 'Restarted both servers with latest code'
        $fail.backend = 0
        $fail.frontend = 0
        # The build took a while; that isn't the PC waking from sleep.
        $tick = [datetime]::UtcNow
        continue
      }

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
$roleCreated = $false
$roleMutex = New-Object System.Threading.Mutex($true, "MovieControllerRemote-$Role", [ref]$roleCreated)
if (-not $roleCreated) {
  Write-Host "A $Role window is already running. You can close this one."
  return
}
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
    $workdir = $FrontendDir
    $port = 9283
    $dist = Get-FrontendDist
    # Production mode by default: ~100 MB instead of the dev server's ~300+ MB
    # (and growing). Set REMOTE_FRONTEND_MODE=dev for live reload while editing.
    $frontendMode = if ($env:REMOTE_FRONTEND_MODE -eq 'dev') { 'dev' } else { 'prod' }
    $argList = @($next, 'dev', '-p', '9283', '-H', '0.0.0.0')
  }

  # A pid file left by a window that was closed (an update) would make the
  # supervisor health-check this server while it is still building. Without
  # one it waits until the server has started.
  Remove-Item (Join-Path $LogDir "$Role.pid") -ErrorAction SilentlyContinue
  Clear-OurPort $port

  # Build the phone page (only when its code is newer than the last build),
  # after the old server has stopped: building under a running server breaks
  # it. (An update arrives already built: see Build-FrontendAhead.)
  if ($Role -eq 'frontend' -and $frontendMode -eq 'prod') {
    $buildId = Join-Path $workdir "$dist\BUILD_ID"
    $sources = @(Get-ChildItem -Path (Join-Path $workdir 'src') -Recurse -File -ErrorAction SilentlyContinue) +
      @(Get-Item (Join-Path $workdir 'package.json'), (Join-Path $workdir 'next.config.mjs') -ErrorAction SilentlyContinue)
    $newest = ($sources | Measure-Object -Property LastWriteTime -Maximum).Maximum
    $stale = -not (Test-Path $buildId) -or ((Get-Item $buildId).LastWriteTime -lt $newest)
    $built = $true
    if ($stale) {
      Write-Log 'frontend.log' 'Building the phone page (production)...'
      Push-Location $workdir
      $env:NEXT_DIST_DIR = $dist
      try {
        & $node $next build 2>&1 | ForEach-Object { Write-Log 'frontend.log' "$_" }
        $built = ($LASTEXITCODE -eq 0)
      } finally {
        Remove-Item Env:NEXT_DIST_DIR -ErrorAction SilentlyContinue
        Pop-Location
      }
      if (-not $built) { Write-Log 'frontend.log' 'Build failed. Running in dev mode for now.' }
    }
    if ($built) { $argList = @($next, 'start', '-p', '9283', '-H', '0.0.0.0') }
  }
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
  if ($Role -eq 'frontend') { $psi.EnvironmentVariables['NEXT_DIST_DIR'] = $dist }
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
  # Don't wait forever for the output pipe: a leftover child (chromedriver)
  # can hold it open after the server itself has exited.
  [void]$proc.WaitForExit(3000)
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

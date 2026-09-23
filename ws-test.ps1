<#
.SYNOPSIS
  CircleSync WebSocket test client.
  Connects to the DO Worker as a test user and logs all incoming messages.
.DESCRIPTION
  Usage:
    .\ws-test.ps1 -CircleId "ee7a3ceb..." -UserId "test1" -Username "test1"
  Press Ctrl+C to disconnect.
#>

param(
  [Parameter(Mandatory=$true)] [string]$CircleId,
  [Parameter(Mandatory=$true)] [string]$UserId,
  [Parameter(Mandatory=$true)] [string]$Username,
  [string]$DisplayName = "",
  [string]$AvatarColor = "%2310b981",
  [int]$RefreshMs = 10000
)

if (-not $DisplayName) { $DisplayName = $Username }

$baseUrl = "wss://circlesync-do.rasrasayan.workers.dev/ws"
$query = "circle=$CircleId&userId=$UserId&username=$Username&displayName=$DisplayName&avatarColor=$AvatarColor"
  $url = $baseUrl + "?" + $query

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host " CircleSync WS Test Client" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host " URL: $url"
Write-Host ""

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$uri = [System.Uri]$url
$cts = New-Object System.Threading.CancellationTokenSource

try {
  Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Connecting..." -ForegroundColor Yellow
  $connectTask = $ws.ConnectAsync($uri, $cts.Token)
  $connectTask.Wait()
  Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ? Connected. State: $($ws.State)" -ForegroundColor Green
  Write-Host ""

  # Start a background task to send location updates periodically
  $sendJob = Start-Job -ArgumentList $RefreshMs -ScriptBlock {
    param($interval)
    # We can't share the WebSocket across jobs, so this won't work directly.
    # Instead, we'll send from the main thread using a timer.
  }

  # Instead of a job, we'll use a simple loop with timing
  $lastSend = [DateTime]::MinValue
  $buffer = New-Object byte[] 16384
  $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)

  Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Listening for messages (Ctrl+C to stop)..." -ForegroundColor Cyan
  Write-Host ""

  while ($ws.State -eq 'Open') {
    # Send a location update if it's time
    $now = Get-Date
    if (($now - $lastSend).TotalMilliseconds -ge $RefreshMs) {
      $payload = @{
        type = 'location-update'
        lat = 27.7214
        lng = 85.2865
        accuracy = 10
        heading = 0
        speed = 0
      } | ConvertTo-Json -Compress
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
      $sendSegment = New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)
      $sendCts = New-Object System.Threading.CancellationTokenSource
      $sendCts.CancelAfter(3000)
      try {
        $sendTask = $ws.SendAsync($sendSegment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $sendCts.Token)
        $sendTask.Wait()
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ? SENT location-update: $payload" -ForegroundColor Magenta
        $lastSend = $now
      } catch {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ? Send failed: $($_.Exception.Message)" -ForegroundColor Red
      }
    }

    # Try to receive a message (with 500ms timeout)
    $recvCts = New-Object System.Threading.CancellationTokenSource
    $recvCts.CancelAfter(500)
    try {
      $localBuf = New-Object byte[] 16384
      $localSeg = New-Object System.ArraySegment[byte] -ArgumentList @(,$localBuf)
      $recvTask = $ws.ReceiveAsync($localSeg, $recvCts.Token)
      $recvTask.Wait()
      if ($recvTask.Result.Count -gt 0) {
        $text = [System.Text.Encoding]::UTF8.GetString($localBuf, 0, $recvTask.Result.Count)
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ? RECV: $text" -ForegroundColor Green
      }
    } catch [System.OperationCanceledException] {
      # timeout � normal, just loop
    } catch {
      Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ? Recv failed: $($_.Exception.Message)" -ForegroundColor Red
      break
    }
  }

  Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Connection closed" -ForegroundColor Yellow
} catch {
  Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ? Fatal error: $($_.Exception.Message)" -ForegroundColor Red
} finally {
  if ($ws.State -eq 'Open') {
    $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [System.Threading.CancellationToken]::None).Wait()
  }
  $ws.Dispose()
}
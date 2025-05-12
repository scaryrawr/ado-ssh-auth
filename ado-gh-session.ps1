#!/usr/bin/env pwsh

# Define cleanup function to handle termination
function Cleanup {
  # Clean up SSH connection running socat if it exists
  if ($null -ne $Global:SOCAT_SSH_PID) {
    Write-Host "Cleaning up socat SSH connection (PID: $Global:SOCAT_SSH_PID)..."
    Stop-Process -Id $Global:SOCAT_SSH_PID -ErrorAction SilentlyContinue
    Write-Host 'Socat SSH connection terminated'
  }

  # Clean up by killing the auth service process
  if ($null -ne $Global:ADO_AUTH_SERVICE_PID) {
    Write-Host "Stopping ado-auth-service (PID: $Global:ADO_AUTH_SERVICE_PID)..."
    Stop-Process -Id $Global:ADO_AUTH_SERVICE_PID -ErrorAction SilentlyContinue
    Write-Host 'ado-auth-service stopped'
  }
}

# Set up trap to ensure cleanup happens on exit
try {
  # Start the ado-auth-service in the background
  $auth_service = Join-Path -Path (Split-Path -Parent $MyInvocation.MyCommand.Path) -ChildPath 'apps\ado-auth-service'
  Write-Host 'Starting ado-auth-service in the background...'
  $adoAuthProcess = Start-Process -FilePath 'node' -ArgumentList $auth_service -PassThru -NoNewWindow
  $Global:ADO_AUTH_SERVICE_PID = $adoAuthProcess.Id

  Write-Host "ado-auth-service started with PID: $Global:ADO_AUTH_SERVICE_PID"

  # List codespaces and let user select one using Out-GridView
  Write-Host 'Fetching codespaces list...'
  $codespaces = (gh cs ls | Out-String) -split "`n" | Where-Object { $_ -match '\S' } | Select-Object -Skip 1
    
  if ($codespaces.Count -eq 0) {
    Write-Error 'No codespaces found.'
    exit 1
  }

  $selected = $codespaces | Out-GridView -Title 'Select a codespace' -OutputMode Single
  if ($null -eq $selected) {
    Write-Host 'No codespace selected. Exiting.'
    exit 0
  }
    
  $codespace = $selected.Split()[0]
  Write-Host "Selected codespace: $codespace"

  # Generate a unique socket ID for this session
  $SOCKET_ID = [guid]::NewGuid().ToString()
  $SOCKET_PATH = "/tmp/ado-auth-${SOCKET_ID}.sock"

  # Start a dedicated SSH connection to run socat continuously
  Write-Host 'Starting dedicated SSH connection for socat...'
  $socatProcess = Start-Process -FilePath 'gh' -ArgumentList "cs ssh -c `"$codespace`" -- -R 9000:localhost:9000 `"socat UNIX-LISTEN:$SOCKET_PATH,fork TCP:localhost:9000`"" -PassThru -NoNewWindow
  $Global:SOCAT_SSH_PID = $socatProcess.Id

  # Wait a moment for socat to start
  Write-Host "Socat started in dedicated SSH connection with PID: $Global:SOCAT_SSH_PID"
  Start-Sleep -Seconds 2

  # Start an interactive SSH session (no need to forward port again)
  Write-Host 'Starting interactive SSH session...'
  $env:TERM = 'xterm-256color'
  gh cs ssh -c $codespace -- -t

}
finally {
  # Ensure cleanup runs when the script exits
  Cleanup
}

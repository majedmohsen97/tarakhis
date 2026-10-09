@echo off
rem Stops Tarakhis when it was started with "start-pilot.cmd -Background".
powershell -NoProfile -Command "$f = Join-Path '%~dp0' 'pilot.pids'; if (Test-Path $f) { Get-Content $f | ForEach-Object { Stop-Process -Id $_ -ErrorAction SilentlyContinue }; Remove-Item $f; 'Tarakhis stopped.' } else { 'Tarakhis is not running in the background.' }"

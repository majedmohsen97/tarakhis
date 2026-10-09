@echo off
rem Double-click to run Tarakhis on this computer with a free public link.
rem Add "-Demo" after the .ps1 path to use the demo company instead of real pilot data.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-pilot.ps1" %*

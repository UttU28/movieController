@echo off
cd /d "%~dp0"
title Remote supervisor
powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0scripts\remote-supervisor.ps1"

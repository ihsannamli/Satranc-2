@echo off
cd /d %~dp0
start /b python -m http.server 8080
start http://localhost:8080
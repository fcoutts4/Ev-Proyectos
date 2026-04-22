@echo off
setlocal
cd /d "%~dp0"
start "" "http://127.0.0.1:8000/vista_estatica.html"
python -m http.server 8000 --bind 127.0.0.1

@echo off
setlocal
cd /d "%~dp0"

if not exist ".env" (
  echo Falta el archivo .env con DATABASE_URL.
  echo Copia .env.example a .env y reemplaza USER, PASSWORD, HOST y DATABASE.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias...
  call "C:\Program Files\nodejs\npm.cmd" install
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)

start "" "http://localhost:3000"
"C:\Program Files\nodejs\npm.cmd" start

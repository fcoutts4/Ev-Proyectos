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

REM Modo dev: nodemon reinicia el servidor automaticamente cuando editas server.js o db.js.
REM No vigila public/ porque el front se sirve estatico (basta con recargar el browser).
start "" "http://localhost:3000"
"C:\Program Files\nodejs\npm.cmd" run dev

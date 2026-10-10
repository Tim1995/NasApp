@echo off
chcp 65001 >nul
title 小脚丫旅行记
cd /d "%~dp0"

echo.
echo   小脚丫旅行记 · 宝宝的旅行纪念册
echo   ============================================
echo.

rem 这个文件夹里有没有「服务器模式」存下的数据？
set "HAS_DATA="
if exist "%~dp0data\db.json" set "HAS_DATA=1"

set "NODE_EXE="

rem ---------- 1) 自带的便携版 Node（放在 runtime 目录里）----------
if exist "%~dp0runtime\node.exe" set "NODE_EXE=%~dp0runtime\node.exe"
if defined NODE_EXE goto found

rem ---------- 2) 系统 PATH ----------
for %%I in (node.exe) do if not "%%~$PATH:I"=="" set "NODE_EXE=%%~$PATH:I"
if defined NODE_EXE goto found

rem ---------- 3) 常见安装位置 ----------
call :probe "%ProgramFiles%\nodejs\node.exe"
call :probe "%ProgramFiles(x86)%\nodejs\node.exe"
call :probe "%LOCALAPPDATA%\Programs\nodejs\node.exe"
call :probe "%USERPROFILE%\scoop\shims\node.exe"
call :probe "%ProgramData%\chocolatey\bin\node.exe"
call :probe "%APPDATA%\npm\node.exe"
if defined NODE_EXE goto found

rem nvm-windows
for /d %%D in ("%APPDATA%\nvm\v*") do call :probe "%%~fD\node.exe"
if defined NODE_EXE goto found

rem fnm
for /d %%D in ("%LOCALAPPDATA%\fnm_multishells\*") do call :probe "%%~fD\node.exe"
if defined NODE_EXE goto found

rem ---------- 4) 没找到 Node ----------
if defined HAS_DATA goto neednode
goto staticmode

:probe
if defined NODE_EXE exit /b
if exist %1 set "NODE_EXE=%~1"
exit /b


:found
echo   已找到 Node.js：%NODE_EXE%
echo.
echo   正在启动本地服务…
echo   数据目录：%~dp0data\
echo.
echo   浏览器会自动打开。手机 / 平板连同一个 WiFi，
echo   也能用下面提示的局域网地址访问，看到的是同一份记录。
echo.
start "" /b cmd /c "ping -n 4 127.0.0.1 >nul & start http://localhost:5178"
"%NODE_EXE%" server.js 5178
echo.
echo   服务已停止。
pause
exit /b


:neednode
echo   ⚠️  注意 —— 这个文件夹里有服务器模式存下的数据：
echo.
echo        %~dp0data\
echo.
echo   但是没能在本机找到 Node.js，所以起不了服务。
echo   如果直接打开网页，读到的是「浏览器本地数据」，
echo   **看不到上面那个 data 文件夹里的行程和照片。**
echo.
echo   ---------------- 想看到数据，二选一 ----------------
echo.
echo   A. 装个 Node.js（推荐，一劳永逸）
echo      https://nodejs.org   下载 LTS 版本，一路「下一步」装完，
echo      再把本文件双击一次就好了。
echo.
echo   B. 已经装了、只是不在标准位置？
echo      把 node.exe 复制到下面这个位置，再双击本文件：
echo.
echo        %~dp0runtime\node.exe
echo.
echo   ----------------------------------------------------
echo.
pause
exit /b


:staticmode
echo   没有检测到 Node.js，直接用浏览器打开。
echo.
echo   功能一样全（地图、真实道路里程、备份都能用），
echo   只是数据存在浏览器里，而不是本项目的 data 文件夹。
echo.
start "" "%~dp0index.html"
echo   已经打开了。如果没有自动弹出，手动双击 index.html 也一样。
echo.
echo   想换成「本地服务」模式（数据存 data 文件夹、手机也能一起看），
echo   装上 Node.js 再双击本文件即可：https://nodejs.org
echo.
timeout /t 10 >nul
exit /b

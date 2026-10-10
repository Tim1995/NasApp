@echo off
chcp 65001 >nul
title 小脚丫旅行记
cd /d "%~dp0"

rem 要内置的 Node 版本（LTS，任何 18+ 都能跑这个项目）
set "NODE_VER=v22.23.3"

echo.
echo   小脚丫旅行记 · 宝宝的旅行纪念册
echo   ============================================
echo.

rem 这个文件夹里有没有「服务器模式」存下的数据？
set "HAS_DATA="
if exist "%~dp0data\db.json" set "HAS_DATA=1"

set "NODE_EXE="

rem ---------- 1) 自带的便携版 Node ----------
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

rem ---------- 4) 没找到，问要不要自动装一份 ----------
goto askdownload


:probe
if defined NODE_EXE exit /b
if exist %1 set "NODE_EXE=%~1"
exit /b


:askdownload
echo   没有找到 Node.js。这个项目有两种用法：
echo.
echo     [1] 本地服务模式   数据存在本项目的 data 文件夹，
echo                        手机、平板连同一个 WiFi 也能一起看同一份记录
echo.
echo     [2] 浏览器模式     直接当网页打开，功能一样全，
echo                        但数据存在浏览器里，换设备看不了
echo.
echo   选 [1] 的话需要 Node.js。可以现在自动下载一份便携版：
echo   约 34 MB，只解压到本项目的 runtime 文件夹里，**不会装进系统**。
echo.
set "CHOICE="
set /p "CHOICE=  要下载吗？(Y = 下载 / N = 用浏览器模式) [Y/n] : "

if /i "%CHOICE%"=="n"  goto decline
if /i "%CHOICE%"=="no" goto decline
goto download


:decline
if defined HAS_DATA goto warn_data
goto staticmode


:download
echo.
echo   正在下载 Node.js %NODE_VER% …
echo   （失败了也没关系，直接关掉窗口双击 index.html 一样能用）
echo.
if not exist "%~dp0runtime" mkdir "%~dp0runtime" >nul 2>nul
set "NODE_ZIP=%TEMP%\xiaojiaoya-node-%RANDOM%.zip"
del "%NODE_ZIP%" >nul 2>nul

curl.exe -L --fail --progress-bar --connect-timeout 20 --retry 2 ^
  -o "%NODE_ZIP%" ^
  "https://nodejs.org/dist/%NODE_VER%/node-%NODE_VER%-win-x64.zip"
if errorlevel 1 goto dlfail
if not exist "%NODE_ZIP%" goto dlfail

echo.
echo   下载完成，正在解压…
tar.exe -xf "%NODE_ZIP%" -C "%~dp0runtime" --strip-components=1
if not exist "%~dp0runtime\node.exe" goto dlfail

del "%NODE_ZIP%" >nul 2>nul
echo.
echo   ✅ 便携版 Node.js 已就位（放在 runtime 目录里，没有装进系统）
set "NODE_EXE=%~dp0runtime\node.exe"
goto found


:dlfail
echo.
echo   ------------------------------------------------------------
echo   ❌ 没能自动装好 Node.js，多半是网络问题
echo      （公司代理、网络受限、或者中途断网）
echo.
echo   还有两条路：
echo.
echo     1. 换个网络，再双击一次本文件
echo     2. 自己装一个：https://nodejs.org  下载 LTS，一路「下一步」
echo.
echo     3. 不想折腾？双击 index.html 直接用浏览器模式，
echo        功能一样全（地图、真实道路里程、备份都能用），
echo        只是数据存在浏览器里。
echo   ------------------------------------------------------------
echo.
pause
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


:warn_data
echo   ⚠️  注意 —— 这个文件夹里有服务器模式存下的数据：
echo.
echo        %~dp0data\
echo.
echo   但你没装 Node.js，也没选择下载，所以起不了服务。
echo   直接打开网页的话，读到的是「浏览器本地数据」，
echo   **看不到上面那个 data 文件夹里的行程和照片。**
echo.
echo   想看到那些数据，重新双击本文件，然后在提问那里选 Y，
echo   让它自动下载一份便携版 Node.js 就行了。
echo.
pause
exit /b


:staticmode
echo   好的，直接用浏览器打开。
echo.
echo   功能一样全 —— 地图、真实道路里程、照片、备份都能用，
echo   只是数据存在浏览器里，而不是本项目的 data 文件夹。
echo.
start "" "%~dp0index.html"
echo   已经打开了。如果没有自动弹出，手动双击 index.html 也一样。
echo.
echo   以后想让手机、平板也看到同一份记录：
echo   重新双击本文件，在提问那里选 Y 下载便携版 Node.js 即可。
echo.
timeout /t 12 >nul
exit /b

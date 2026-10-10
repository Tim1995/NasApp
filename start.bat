@echo off
chcp 65001 >nul
title 小脚丫旅行记
cd /d "%~dp0"

echo.
echo   小脚丫旅行记 · 宝宝的旅行纪念册
echo   ============================================
echo.

rem ---------- 1) 优先用自带的 Node（作者若打包了 runtime 目录） ----------
set "NODE_EXE="
if exist "%~dp0runtime\node.exe" set "NODE_EXE=%~dp0runtime\node.exe"

rem ---------- 2) 其次找系统里已装好的 Node ----------
if not defined NODE_EXE (
  for %%I in (node.exe) do if not "%%~$PATH:I"=="" set "NODE_EXE=%%~$PATH:I"
)

if defined NODE_EXE goto server

rem ---------- 3) 没有 Node：不打扰用户，直接当普通网页打开 ----------
echo   正在打开…（无需安装任何东西）
echo.
start "" "%~dp0index.html"
echo   --------------------------------------------
echo   已经打开了。
echo.
echo   如果浏览器没有自动弹出来，手动双击 index.html 也一样。
echo.
echo   数据保存在你自己的浏览器里，换浏览器或清理缓存会丢失，
echo   记得偶尔用「设置 → 导出备份」存一份文件留底。
echo.
echo   想让家人用手机一起看：装上 Node.js 后运行本文件，
echo   改成用本地服务打开，手机连同一个 WiFi 就能访问。
echo   --------------------------------------------
echo.
timeout /t 8 >nul
goto :eof

:server
echo   正在启动本地服务…
echo   数据会存在本目录的 data 文件夹里。
echo   手机连同一个 WiFi，也能打开下面提示的地址。
echo.
start "" /b cmd /c "ping -n 3 127.0.0.1 >nul & start http://localhost:5178"
"%NODE_EXE%" server.js 5178
echo.
echo   服务已停止。
pause

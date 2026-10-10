#!/usr/bin/env bash
# 小脚丫旅行记 · 启动脚本（macOS / Linux）
# 有 Node 就用本地服务打开；没有就直接当网页打开，功能一样。

cd "$(dirname "$0")" || exit 1

echo
echo "  小脚丫旅行记 · 宝宝的旅行纪念册"
echo "  ============================================"
echo

open_url() {
  if command -v open >/dev/null 2>&1; then
    open "$1"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$1"
  else
    echo "  请手动打开：$1"
  fi
}

if command -v node >/dev/null 2>&1; then
  echo "  正在启动本地服务…"
  echo "  数据会存在本目录的 data 文件夹里。"
  echo "  手机连同一个 WiFi，也能打开下面提示的地址。"
  echo
  (
    sleep 1.5
    open_url "http://localhost:5178"
  ) &
  node server.js 5178
  echo
  echo "  服务已停止。"
else
  echo "  没有检测到 Node.js，直接用浏览器打开（功能一样，数据存在浏览器里）。"
  echo
  open_url "file://$(pwd)/index.html"
  echo
  echo "  数据保存在你自己的浏览器里，换浏览器或清理缓存会丢失，"
  echo "  记得偶尔用「设置 → 导出备份」存一份文件留底。"
  echo
  read -r -p "  按回车键关闭…" _
fi

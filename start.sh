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

# 找 Node：优先用自带的 runtime/node，其次系统 PATH
NODE_BIN=""
if [ -x "./runtime/node" ]; then
  NODE_BIN="$PWD/runtime/node"
elif command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
fi

# 这个文件夹里有没有服务端模式存下的数据？
HAS_DATA=""
[ -f "./data/db.json" ] && HAS_DATA="1"

if [ -n "$NODE_BIN" ]; then
  echo "  已找到 Node：$NODE_BIN"
  echo "  正在启动本地服务…"
  echo "  数据会存在本目录的 data 文件夹里。"
  echo "  手机连同一个 WiFi，也能打开下面提示的地址。"
  echo
  (
    sleep 1.5
    open_url "http://localhost:5178"
  ) &
  "$NODE_BIN" server.js 5178
  echo
  echo "  服务已停止。"
elif [ -n "$HAS_DATA" ]; then
  echo "  ⚠️  注意 —— 这个文件夹里有服务端模式存下的数据："
  echo "        $(pwd)/data/"
  echo
  echo "  但是没找到 Node.js，起不了服务。直接打开网页的话，"
  echo "  读到的是浏览器本地数据，看不到 data 文件夹里的行程和照片。"
  echo
  echo "  想看到数据，二选一："
  echo "    A. 安装 Node.js（推荐）：https://nodejs.org 选 LTS 版本"
  echo "    B. 已经装了但不在 PATH 里？把 node 可执行文件放到："
  echo "         $(pwd)/runtime/node"
  echo "       然后重新运行本脚本。"
  echo
  read -r -p "  按回车键关闭…" _
else
  echo "  没有检测到 Node.js，直接用浏览器打开。"
  echo "  功能一样全，只是数据存在浏览器里，而不是本项目的 data 文件夹。"
  echo
  open_url "file://$(pwd)/index.html"
  echo
  echo "  想换成「本地服务」模式（数据存 data 文件夹、手机也能一起看），"
  echo "  装上 Node.js 再运行本脚本即可：https://nodejs.org"
  echo
  read -r -p "  按回车键关闭…" _
fi

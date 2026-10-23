#!/usr/bin/env bash
# 用无头 Edge 截取真实页面，供设计评审使用：shot.sh <路径> <输出名> [宽,高]
set -euo pipefail
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/.shots"
mkdir -p "$OUT"
timeout 70 "$EDGE" --headless=new --user-data-dir="$(cygpath -w "$OUT/.profile")" --disable-gpu --hide-scrollbars \
  --window-size="${3:-1440,900}" --virtual-time-budget=${BUDGET:-5000} \
  --screenshot="$(cygpath -w "$OUT/$2.png")" "http://127.0.0.1:5173$1" >/dev/null 2>&1 || true
ls -la "$OUT/$2.png"

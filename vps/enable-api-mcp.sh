#!/usr/bin/env bash
# ============================================================================
# 外部API v1 ＋ MCP（AI）を 有効化 / 無効化 する — VPS 上で実行
# ----------------------------------------------------------------------------
# 使い方（VPS で）:
#     bash vps/enable-api-mcp.sh          # 有効にする
#     bash vps/enable-api-mcp.sh off      # 元に戻す（route が 404 に戻るだけ）
#     bash vps/enable-api-mcp.sh rotate   # 秘密を作り直す（全AIの接続を切る）
#
# なぜスクリプトにするのか（2026-09-13）:
#   手順を長い塊で貼ると、手元のMacに貼ってしまったり、1文字欠けたまま走ったりします
#   （実際に起きました）。VPS でないと動かないことをスクリプト自身に確かめさせます。
#
# やること:
#   ① ここが VPS の 予実 のディレクトリか確かめる（違えば何もせず終了）
#   ② .env を控える → API_V1_* と MCP_* を書き換える
#      MCP_TOKEN_SECRET は この中で作り、画面にもログにも GitHub にも出しません
#   ③ api コンテナだけ作り直す（env_file は「作るとき」しか読まれない）
#   ④ 外から4本叩いて確かめる。tools/call が 401 でなければ失敗にする
# 何度実行しても同じ結果になります。
# ============================================================================
set -euo pipefail

MODE="${1:-on}"
case "$MODE" in on|off|rotate) ;; *) echo "使い方: bash vps/enable-api-mcp.sh [on|off|rotate]"; exit 2 ;; esac

# ---------- ① 場所の確認 ----------
cd "$(dirname "$0")/.."
DIR="$(pwd)"
# 手元のMacで走らせてしまう事故を止める（2026-09-13 に実際に起きました）。
if [ "$(uname -s)" != "Linux" ]; then
  echo "!! ここは $(uname -s) です。このスクリプトは VPS（Linux）の上で実行してください。"
  echo "   手元のMacではなく、Termius などで VPS に入ってから実行します。"; exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "!! docker がありません。このスクリプトは VPS 上で実行してください。"; exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "!! docker が動いていません。VPS 上で実行してください。"; exit 1
fi
if [ ! -f "$DIR/docker-compose.yml" ] || ! grep -qE '^\s{2}api:' "$DIR/docker-compose.yml"; then
  echo "!! ここは 予実管理システム のディレクトリではありません: $DIR"
  echo "   正しい場所: docker inspect yojitsu-web --format '{{index .Config.Labels \"com.docker.compose.project.working_dir\"}}'"
  exit 1
fi
# 本番のコンテナが居ることまで確かめる（同じソースを別の場所で動かしている場合の取り違え防止）
if ! docker ps --format '{{.Names}}' | grep -qx 'yojitsu-api'; then
  echo "!! yojitsu-api コンテナが動いていません。ここは本番の 予実 ではない可能性があります。"
  docker ps --format '   {{.Names}}'
  exit 1
fi
echo "▶ ディレクトリ: $DIR"

PUBLIC_BASE="https://finance.biglight.jp"
MCP_URL="$PUBLIC_BASE/mcp"

# ---------- ② .env ----------
touch .env
BAK=".env.bak-$(date +%Y%m%d-%H%M%S)"
cp -a .env "$BAK"
echo "▶ .env を控えました → $BAK"

# 既にある秘密は使い回す（作り直すのは rotate のときだけ）。
CUR_SECRET="$(grep -E '^MCP_TOKEN_SECRET=' .env | head -1 | cut -d= -f2- || true)"
if [ "$MODE" = "rotate" ] || [ -z "$CUR_SECRET" ] || [ "${#CUR_SECRET}" -lt 32 ]; then
  CUR_SECRET="$(openssl rand -hex 32)"
  echo "▶ MCP_TOKEN_SECRET: 新しく作りました（表示しません）"
  [ "$MODE" = "rotate" ] && echo "   ※ いま繋がっている AI は、もう一度「許可」からやり直しになります"
else
  echo "▶ MCP_TOKEN_SECRET: 既存のものを使います"
fi
[ "$MODE" = "rotate" ] && MODE="on"

if [ "$MODE" = "on" ]; then ON=true; else ON=false; fi

grep -vE '^(API_V1_ENABLED|API_V1_PUBLIC_BASE|MCP_ENABLED|MCP_PUBLIC_URL|MCP_TOKEN_SECRET|MCP_OAUTH_)' .env > .env.new || true
{
  echo "API_V1_ENABLED=$ON"
  echo "API_V1_PUBLIC_BASE=$PUBLIC_BASE"
  echo "MCP_ENABLED=$ON"
  echo "MCP_PUBLIC_URL=$MCP_URL"
  echo "MCP_TOKEN_SECRET=$CUR_SECRET"
  echo "MCP_OAUTH_REDIRECT_URIS=https://chatgpt.com/connector_platform_oauth_redirect"
  echo "MCP_OAUTH_REDIRECT_PREFIXES=https://chatgpt.com/connector/oauth/"
  echo "MCP_OAUTH_ALLOW_DCR=true"
} >> .env.new
mv .env.new .env
chmod 600 .env
unset CUR_SECRET
echo "▶ API_V1_ENABLED=$ON · MCP_ENABLED=$ON"

# ---------- ③ api だけ作り直す ----------
# env_file はコンテナを「作るとき」にしか読まれません。restart では変わりません。
echo "▶ api コンテナを作り直します"
if ! docker compose up -d --force-recreate api; then
  echo "   !! --force-recreate に失敗。いったん外して作り直します"
  docker compose rm -sf api >/dev/null 2>&1 || true
  docker compose up -d api
fi

echo "▶ 起動待ち"
for i in $(seq 1 30); do
  if docker exec yojitsu-api node -e "fetch('http://127.0.0.1:4000/health').then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "   ・api 応答あり"; break
  fi
  [ "$i" = "30" ] && { echo "   !! api が応答しません。元に戻します"; cp -a "$BAK" .env; docker compose up -d --force-recreate api; docker compose logs api --tail 50; exit 1; }
  sleep 2
done
docker compose logs api --tail 40 | grep -F '[BOOT]' | tail -5 || true

# ---------- ④ 外から確かめる ----------
echo "▶ 外から確認（Caddy → nginx → api）"
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@"; }
A="$(code "$PUBLIC_BASE/api/v1/health")"
M="$(code "$MCP_URL/health")"
W="$(code "$PUBLIC_BASE/.well-known/oauth-protected-resource/mcp")"
C="$(code -X POST "$MCP_URL" -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_yojitsu_summary","arguments":{}}}')"
echo "   /api/v1/health                              → $A"
echo "   /mcp/health                                 → $M"
echo "   /.well-known/oauth-protected-resource/mcp   → $W"
echo "   POST /mcp（トークン無しの tools/call）       → $C"

fail=0
if [ "$ON" = "true" ]; then
  [ "$A" = "200" ] || { echo "   !! API v1 が有効になっていません"; fail=1; }
  [ "$M" = "200" ] || { echo "   !! MCP が有効になっていません"; fail=1; }
  [ "$W" = "200" ] || { echo "   !! OAuth のメタデータが出ていません"; fail=1; }
  # ここが 200 なら、トークン無しでデータが出ているということ。絶対に見逃さない。
  [ "$C" = "401" ] || { echo "   !! 危険: トークン無しの tools/call が $C を返しました（401 でなければいけません）"; fail=1; }
else
  [ "$A" = "404" ] && [ "$M" = "404" ] || { echo "   !! まだ口が開いています"; fail=1; }
fi
if [ "$fail" != "0" ]; then
  echo
  echo "!! うまくいきませんでした。元の .env に戻すには:"
  echo "     cp -a $BAK .env && docker compose up -d --force-recreate api"
  exit 1
fi

echo
if [ "$ON" = "true" ]; then
cat <<'MSG'
────────────────────────────────────────────────────────
 有効になりました。ただし、まだ誰も何も読めません。

 次にやること:
   1. https://finance.biglight.jp → 設定 › API・AI連携（管理者のみ）
   2. 「＋ 鍵を発行」… 名前は使う人の名前。1人1鍵。
      段は 基本 / 全画面 / 全画面＋個人情報 から選ぶ
   3. 鍵はその場で1回だけ表示されます。本人に直接渡してください
   4. ChatGPT のコネクタに https://finance.biglight.jp/mcp を登録（認証は OAuth）
      → 許可画面が出たら、その鍵を貼る

 止めるとき : bash vps/enable-api-mcp.sh off
 1人だけ止める: 画面で その人の鍵を「失効」
 全員を止める : bash vps/enable-api-mcp.sh rotate
 手順の全部  : docs/API-MCP.md
────────────────────────────────────────────────────────
MSG
else
cat <<'MSG'
────────────────────────────────────────────────────────
 止めました。/api/v1 と /mcp は 404 に戻りました。
 鍵・範囲・連携ログはそのまま残っています（また on にすれば戻ります）。
────────────────────────────────────────────────────────
MSG
fi

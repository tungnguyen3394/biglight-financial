#!/usr/bin/env bash
# ============================================================================
# Money Forward の鍵を この サーバーに入れる（VPS で1回だけ）
# ----------------------------------------------------------------------------
# ★ ClientSecret は この端末の中だけで扱います:
#     ・画面に表示しません（入力は伏字）
#     ・履歴（.bash_history）にも残しません（引数で渡さないため）
#     ・Git にも入りません（.env は .gitignore）
#     ・ログにも出しません
#
# 使い方（VPS 上で）:
#     cd "$(docker inspect yojitsu-web --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}')" \
#       && bash vps/enable-mf.sh
#
# やめたいとき（鍵を消す）:  bash vps/enable-mf.sh off
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=".env"

if [ ! -f docker-compose.yml ] || [ ! -d backend ]; then
  echo "ここは 予実管理システム のディレクトリではないようです。中止します。"; exit 1
fi
[ -f "$ENV_FILE" ] || { echo ".env がありません。中止します。"; exit 1; }

# .env の1行を書き換える（無ければ足す）。値はファイルの中だけ。
set_env() {
  local key="$1" val="$2"
  # 値に | や & が入っていても壊れないように、行を作り直す（sed は使わない）
  grep -v "^${key}=" "$ENV_FILE" > "${ENV_FILE}.tmp" || true
  printf '%s=%s\n' "$key" "$val" >> "${ENV_FILE}.tmp"
  mv "${ENV_FILE}.tmp" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

if [ "${1:-}" = "off" ]; then
  cp -a "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  set_env MF_CLIENT_ID ""
  set_env MF_CLIENT_SECRET ""
  echo "鍵を消しました。api を作り直します…"
  docker compose up -d --force-recreate api >/dev/null
  echo "完了。連携は停止しました（画面の取り込みは CSV だけになります）。"
  exit 0
fi

echo "== Money Forward の鍵を入れます =="
echo "（MF アプリポータル › BIGLIGHT Finance の ClientID / ClientSecret）"
read -r -p "ClientID    : " MFID
read -r -s -p "ClientSecret: " MFSECRET; echo
read -r -p "クライアント認証方式 [basic/post]（既定 basic）: " MFAUTH
MFAUTH="${MFAUTH:-basic}"

[ -n "$MFID" ] || { echo "ClientID が空です。中止します。"; exit 1; }
[ -n "$MFSECRET" ] || { echo "ClientSecret が空です。中止します。"; exit 1; }

cp -a "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
set_env MF_CLIENT_ID "$MFID"
set_env MF_CLIENT_SECRET "$MFSECRET"
set_env MF_TOKEN_AUTH "$MFAUTH"
set_env MF_REDIRECT_URI "https://finance.biglight.jp/api/mf/callback"
unset MFSECRET

echo
echo "→ .env に書きました（バックアップも取りました）。api コンテナを作り直します…"
#   env_file はコンテナを「作るとき」にしか読まれないので、restart では反映されません。
docker compose up -d --force-recreate api >/dev/null
sleep 4

echo "→ 確かめます（トークンは出しません）"
# 自己診断（dist/mfcheck.js）は push から2分ほどで届きます。無ければ少し待つ。
for i in 1 2 3 4 5 6; do
  if docker compose exec -T api test -f dist/mfcheck.js 2>/dev/null; then break; fi
  if [ "$i" = "6" ]; then
    echo "  新しい版（dist/mfcheck.js）がまだ届いていません。"
    echo "  自動デプロイ（2分ごと）を待って、あとで次を実行してください:"
    echo "    docker compose exec api node dist/mfcheck.js"
    exit 0
  fi
  echo "  新しい版を待っています… ($i/6)"; sleep 30
done
docker compose exec -T api node dist/mfcheck.js || true

cat <<'MSG'

== 次にやること ==
1) 画面 https://finance.biglight.jp を開く → 設定 › API・AI連携
2) 「Money Forward 連携」の［接続する］を押す → MF の画面で許可
3) 戻ってきたら、もう一度この確認を流す:
     docker compose exec api node dist/mfcheck.js --refresh
   実際に取り込むところまで確かめるなら:
     docker compose exec api node dist/mfcheck.js --apply
MSG

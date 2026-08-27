#!/usr/bin/env bash
# ============================================================================
# BIGLIGHT 予実管理システム — VPSへのデプロイ
# ----------------------------------------------------------------------------
# 使い方（VPS上で）:
#     cd <このリポジトリのディレクトリ> && bash deploy.sh
#
# やること:
#   ① 最新を取得        git fetch && reset --hard origin/main
#   ② .env を整える     足りない項目だけ足す（既存の値は触らない）
#   ③ 旧コンテナを停止  biglight-financial（Next.js版）を止めて外す
#                       ※ 旧データのボリューム dbdata は消しません
#   ④ 新構成を起動      web / api / db
#   ⑤ 動作確認          /api/health を叩く
#
# 何度実行しても同じ結果になります（途中で止まってもやり直せます）。
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")"
echo "▶ ディレクトリ: $(pwd)"

# ---------- ① 最新を取得 ----------
echo "▶ ① GitHubから最新を取得"
git fetch origin
git reset --hard origin/main
git log --oneline -1

# ---------- ② .env ----------
echo "▶ ② .env を確認"
touch .env
add_if_missing() {                       # 既にある項目は絶対に書き換えない
  local key="$1" val="$2"
  if grep -q "^${key}=" .env; then
    echo "   ・${key} … 既存の値を使います"
  else
    echo "${key}=${val}" >> .env
    echo "   ・${key} … 追加しました"
  fi
}
# DBのパスワードは初回だけ自動生成（プレースホルダのままなら作り直す）
if grep -q '^DB_PASSWORD=REPLACE_ME' .env || ! grep -q '^DB_PASSWORD=' .env; then
  NEWPW="$(openssl rand -hex 24)"
  if grep -q '^DB_PASSWORD=' .env; then
    sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=${NEWPW}|" .env
  else
    echo "DB_PASSWORD=${NEWPW}" >> .env
  fi
  echo "   ・DB_PASSWORD … 自動生成しました"
else
  echo "   ・DB_PASSWORD … 既存の値を使います"
fi
add_if_missing GOOGLE_CLIENT_ID "904648416175-3dsfs6iji7oki7jdrnks1s7vucj30m7a.apps.googleusercontent.com"
add_if_missing ALLOWED_DOMAIN   "biglight.jp"
add_if_missing ADMIN_EMAIL      "n-tung@biglight.jp"
add_if_missing PERM_MODE        "enforce"
add_if_missing CRM_API_BASE     "https://api-crm.biglight.jp"
add_if_missing CRM_EXPORT_KEY   ""

# ---------- ③ 旧コンテナ ----------
echo "▶ ③ 旧Next.js版のコンテナを停止"
if docker ps -a --format '{{.Names}}' | grep -qx 'biglight-financial'; then
  docker stop biglight-financial >/dev/null 2>&1 || true
  docker rm   biglight-financial >/dev/null 2>&1 || true
  echo "   ・停止して削除しました（ボリューム dbdata は残しています）"
else
  echo "   ・見つかりません（すでに停止済み）"
fi

# ---------- ④ 起動 ----------
echo "▶ ④ 新しい構成を起動（初回はビルドに数分かかります）"
docker compose up -d --build --remove-orphans
docker compose ps

# ---------- ⑤ 確認 ----------
echo "▶ ⑤ 動作確認"
for i in $(seq 1 30); do
  if docker exec yojitsu-api node -e "fetch('http://localhost:4000/health').then(r=>r.text()).then(t=>{console.log(t);process.exit(0)}).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "   ・API 正常"
    break
  fi
  [ "$i" = "30" ] && { echo "   ・APIが応答しません。ログ: docker compose logs api --tail 50"; exit 1; }
  sleep 2
done
echo -n "   ・公開URL: "
curl -s -o /dev/null -w "%{http_code}\n" https://finance.biglight.jp/ || true

cat <<'MSG'

────────────────────────────────────────────────────────
 完了しました。 https://finance.biglight.jp を開いてください。

 ★ ログインできない場合（"origin is not allowed" 等）
   Google Cloud Console → 認証情報 → 該当のOAuthクライアント →
   「承認済みのJavaScript生成元」に次を追加してください:
        https://finance.biglight.jp
   （CRMと同じクライアントIDを使っているため、この1行の追加が必要です）

 ★ 次にやること
   1. マスタ › CRM連携   … CSV取り込み、またはAPI連携の設定
                            （手順: crm-integration/README.md）
   2. マスタ › 取引先管理 … 締日・支払サイト・請求ルールを登録
   3. 請求管理 › 請求を作成（月まとめ）
   4. 予実管理 › 予算・見込の入力

 ★ 元に戻したいとき（旧Next.js版へ）
      git reset --hard 3be085f && docker compose down && docker compose up -d --build
   旧データのボリューム dbdata はそのまま残してあります。
────────────────────────────────────────────────────────
MSG

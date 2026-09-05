#!/usr/bin/env bash
# ============================================================================
# 自動デプロイを VPS に仕込む — 実行するのは「1回だけ」
# ----------------------------------------------------------------------------
# これを入れると、GitHub の main に push するだけで 2分以内に
# finance.biglight.jp が新しくなります。SSH鍵も GitHub の secrets も要りません。
#
# 使い方（VPS 上で1回）:
#     cd <このリポジトリのディレクトリ> && bash vps/autodeploy.sh
#     （場所が分かっている場合は  bash vps/autodeploy.sh /root/xxxx  でも可）
#
# なぜ「GitHubから叩く」ではなく「VPSから見に行く」のか:
#   GitHub Actions から入るには VPS の秘密鍵を GitHub に預ける必要があり、
#   鍵が漏れると VPS ごと持っていかれます。こちらは VPS が外へ git fetch する
#   だけなので、外から入る穴を1つも開けません。
#
# やめたいとき:  systemctl disable --now yojitsu-autodeploy.timer
# 動きを見るとき: journalctl -u yojitsu-autodeploy -n 50 --no-pager
# ============================================================================
set -euo pipefail

# ---------- ① リポジトリの場所を突き止める ----------
DIR="${1:-}"
if [ -z "$DIR" ]; then
  # 動いているコンテナ自身に「どこから起動したか」を聞く。パスを覚えなくて済む。
  DIR="$(docker inspect yojitsu-web \
        --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>/dev/null || true)"
fi
if [ -z "$DIR" ] || [ ! -f "$DIR/deploy.sh" ]; then
  echo "!! リポジトリの場所が分かりませんでした。"
  echo "   引数で渡してください:  bash vps/autodeploy.sh /root/<ディレクトリ名>"
  echo "   候補を探すには:        docker ps --format '{{.Names}}  {{.Label \"com.docker.compose.project.working_dir\"}}'"
  exit 1
fi
DIR="$(cd "$DIR" && pwd)"
echo "▶ リポジトリ: $DIR"

if [ ! -d "$DIR/.git" ]; then
  echo "!! $DIR は git リポジトリではありません。中止します。"; exit 1
fi

# ---------- ② 「変わっていたときだけ」デプロイするスクリプト ----------
# 毎回 build すると2分ごとにコンテナが作り直されるので、必ず差分を見てから動かす。
cat > /usr/local/bin/yojitsu-autodeploy.sh <<EOS
#!/usr/bin/env bash
set -euo pipefail
cd "$DIR"
git fetch origin main --quiet
LOCAL="\$(git rev-parse HEAD)"
REMOTE="\$(git rev-parse origin/main)"
if [ "\$LOCAL" = "\$REMOTE" ]; then exit 0; fi
echo "[\$(date '+%F %T')] 新しいコミット \${REMOTE:0:7} を検出 → デプロイします"
bash deploy.sh
echo "[\$(date '+%F %T')] デプロイ完了"
EOS
chmod +x /usr/local/bin/yojitsu-autodeploy.sh
echo "▶ /usr/local/bin/yojitsu-autodeploy.sh を作成"

# ---------- ③ systemd タイマー（2分ごと） ----------
cat > /etc/systemd/system/yojitsu-autodeploy.service <<'EOS'
[Unit]
Description=BIGLIGHT 予実 — GitHub main に新しいコミットがあれば自動デプロイ
After=docker.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/yojitsu-autodeploy.sh
EOS

cat > /etc/systemd/system/yojitsu-autodeploy.timer <<'EOS'
[Unit]
Description=2分ごとに GitHub を見に行く（予実管理システム）

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
Unit=yojitsu-autodeploy.service

[Install]
WantedBy=timers.target
EOS

systemctl daemon-reload
systemctl enable --now yojitsu-autodeploy.timer
echo "▶ タイマーを登録しました"
systemctl list-timers yojitsu-autodeploy.timer --no-pager || true

# ---------- ④ 今すぐ1回まわす ----------
echo
echo "▶ いま溜まっている分をデプロイします"
/usr/local/bin/yojitsu-autodeploy.sh

cat <<'MSG'

────────────────────────────────────────────────────────
 これで以後は  git push  だけで、2分以内に反映されます。

   動いているか   : systemctl list-timers yojitsu-autodeploy.timer
   ログを見る     : journalctl -u yojitsu-autodeploy -n 50 --no-pager
   すぐ反映したい : /usr/local/bin/yojitsu-autodeploy.sh
   やめる         : systemctl disable --now yojitsu-autodeploy.timer
────────────────────────────────────────────────────────
MSG

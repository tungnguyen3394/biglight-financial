# BIGLIGHT 予実管理システム

社内の**お金**を1か所で見るための業務システム。
**予実管理 ／ 売掛金 ／ 買掛金 ／ OKR** の4つが柱です。

- 会計年度：**8月1日 〜 翌年7月31日**（Q1=8〜10月）
- 公開先：https://finance.biglight.jp
- 設計思想と作り方：[`CONG-THUC-XAY-DUNG-APP.md`](CONG-THUC-XAY-DUNG-APP.md)（BIGLIGHT共通の作法）
- データ設計：[`THIET-KE-YOJITSU.md`](THIET-KE-YOJITSU.md)

---

## 構成

```
web/index.html      画面のすべて（1ファイル・ビルド不要）
backend/            API（Express + TypeScript）
  src/index.ts        /state /state-delta /events /audit /state-history /crm/*
  src/db.ts           テーブル定義（app_state / audit_log / sync_log / 履歴）
  src/auth.ts         Googleログイン（@biglight.jp のみ）
  src/authz.ts        権限（frontend と同じ表）
  src/merge.ts        レコード単位のマージ・安全装置
  src/crmsync.ts      CRMからの取り込み（API / CSV）
crm-integration/    CRM側に足す読み取り専用エンドポイント＋手順
test/smoke.js       金額・在籍者数・会計年度の計算テスト（36件）
nginx.conf          画面配信 ＋ /api 中継（同一オリジン＝CORSなし）
docker-compose.yml  web / api / db
_legacy/            旧 Next.js 版（参照用・削除して構いません）
```

---

## 動かす

### 本番（VPS・Caddy共有ネットワーク "web"）

```bash
cp .env.example .env      # DB_PASSWORD などを設定
docker compose up -d --build
```

### 手元で確認だけしたいとき

画面は静的HTMLなので、そのまま開いても**表示だけ**は確認できます（APIが無いのでログインはできません）。
計算ロジックの確認はテストで行います：

```bash
node test/smoke.js web/index.html
```

---

## 使いはじめる順番

1. **CRM連携** — 所属機関・特定技能者・在籍期間を取り込む（[手順](crm-integration/README.md)）
   API未設定でも **CSV取り込み** で始められます。
2. **取引先管理** — 会社ごとに
   - 締日・支払サイト・支払日（→ 入金期日が自動で決まる）
   - **請求ルール**（人数×単価／月額固定／都度）
   CRMに無い会社（仕入先・外部取引先）はここで直接追加します。
3. **請求管理 › 請求を作成（月まとめ）** — 在籍者数から請求書を自動生成 → 内容を確認 → 確定
4. **予実管理 › 予算・見込の入力** — 年間予算を入力（前年実績×○%からの作成も可）
5. **費用管理 › ＋費目を追加** — 毎月かかるもの（家賃・給与・通信・リース…）を登録し、月額予定を入れる
   → 「定期費用を反映」で12か月ぶんを一気に埋め、以後は毎月マスの数字を直すだけ
6. あとは **入金・支払** を記録するだけ。実績・資金繰り・OKRの数字は自動で埋まります。

### 費用管理は「表1枚」です
領収書を1枚ずつ入れる台帳ではありません。正しい決算数値は会計事務所の試算表が優先です。
この画面の役目は **「毎月かかる費用が、いくらで、増えていないか」** を見ること。
月額予定から **10%以上ズレたマス** に色が付くので、値上げ・想定外の出費がその場で分かります。
金額は **税込**（実際に出ていく額）で入力し、予実には自動で **税抜** で入ります。
表の下に「うち消費税」の行があるので、税率が上がったときの負担も月ごとに追えます。

---

## デプロイ — push するだけ

VPS 側に **2分ごとに GitHub を見に行くタイマー** を入れてあります。`git push origin main` すれば、
2分以内に finance.biglight.jp が新しくなります。手で何かする必要はありません。

**最初の1回だけ**、VPS でこれを実行してタイマーを仕込みます：

```bash
ssh root@194.233.85.198
cd $(docker inspect yojitsu-web --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}')
git pull origin main
bash vps/autodeploy.sh          # ← タイマー登録 ＋ 溜まっている分を即デプロイ
```

| したいこと | コマンド（VPS上） |
|---|---|
| 動いているか見る | `systemctl list-timers yojitsu-autodeploy.timer` |
| ログを見る | `journalctl -u yojitsu-autodeploy -n 50 --no-pager` |
| 2分待たずに反映 | `/usr/local/bin/yojitsu-autodeploy.sh` |
| 止める | `systemctl disable --now yojitsu-autodeploy.timer` |

> **なぜ GitHub Actions を本命にしないのか**
> Actions から入るには VPS の秘密鍵を GitHub に預ける必要があり、鍵が漏れると VPS ごと取られます。
> タイマー方式は VPS が外へ `git fetch` するだけなので、外から入る穴を1つも開けません。
> `.github/workflows/deploy.yml` も置いてありますが、secrets（`VPS_HOST` / `VPS_USER` / `VPS_PORT` /
> `VPS_SSH_KEY`）を入れるまでは黙ってスキップします。

---

## 数字の約束（ここを間違えると全部ずれます）

| 事柄 | 決まり |
|---|---|
| 予実に効くのは | **計上月（bookMonth）**。入金日・支払日ではありません（発生主義） |
| 入金・支払は | P/L に影響しません。売掛金・買掛金の**残高が減る**だけ |
| 実績は | **保存しません**。請求書・支払請求・経費から毎回計算します |
| 予実の金額は | **税抜**。消費税は預り金であって儲けではないため |
| 確定した伝票は | **削除できません**（取消のみ）。金額変更は管理者・マネージャーのみ |
| CRMから来た項目は | 同期のたびに上書き。**締日・支払サイト・口座・請求ルールは絶対に触りません** |
| CRMで消えた会社・人は | 削除せず「CRM消失」の印だけ付けます（過去の請求書から辿れるように） |

---

## 安全装置（CRMの事故から持ち込んだもの）

- **全体書き込みAPIは存在しません。** レコード単位（`/state-delta`）のみ。
- **縮小ガード** — 1回の書き込みで件数が3割以上減るときは中止します。
- **バージョン履歴** — 書き込みのたびに全体のスナップショット。操作履歴から数秒で戻せます。
- **同期ログ** — ブロックされた書き込みも含め、誰が・どの端末から書いたかをDBに記録。
- **監査ログ** — どの項目が「いくら → いくら」に変わったかを日本語の項目名で表示。

---

## 権限

| 役割 | 予実 | 債権・債務 | OKR | マスタ | ユーザー |
|---|---|---|---|---|---|
| Admin | ○ | ○ | ○ | ○ | ○ |
| Manager（経営） | ○ | ○（削除不可） | ○ | ○ | × |
| Staff（経理） | 実績調整のみ | ○（削除不可） | 閲覧＋更新 | 取引先のみ | × |
| Viewer | 閲覧 | 閲覧 | 閲覧 | 閲覧 | × |

ページ単位の上書きは **ユーザー管理 › 個別設定** から。
導入直後に様子を見たい場合は `.env` の `PERM_MODE=log`（記録するだけでブロックしない）にできます。

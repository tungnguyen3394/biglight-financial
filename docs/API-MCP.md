# API連携 と AI（MCP） — 手順書

> 予実管理システム（finance.biglight.jp）の数字を、**外部システム**と**AI**に読ませるための仕組み。
> 設計の根拠は `CONG-THUC-XAY-DUNG-APP.md` §17。ここは「実際にどう動かすか」だけを書きます。
> 作成 2026-09-13。

---

## 0. いちばん大事なこと

| | |
|---|---|
| **読むだけです** | 書き込みの口はありません。鍵を持っていても、AI でも、ここから請求・入金・支払を作ったり金額を変えたりはできません。 |
| **鍵は1人1つ** | 鍵の名前＝使う人の名前。共有すると連携ログで誰が見たか分からなくなります。 |
| **鍵は1回しか出ません** | データベースにはハッシュしか置きません。無くしたら「鍵を作り直す」。 |
| **失効はその場で効く** | 範囲はリクエストのたびに読み直します。AIのトークンの期限を待ちません。 |
| **既定では停止** | `API_V1_ENABLED=false` / `MCP_ENABLED=false`。開けるのは必要になったときだけ。 |

---

## 1. 二つの入口・ひとつの鍵

| 入口 | 誰が使う | アドレス | 認証 |
|---|---|---|---|
| **API v1**（REST） | Power Automate・AI Builder・他システム | `https://finance.biglight.jp/api/v1/…` | ヘッダー `X-API-Key: bl_live_…` |
| **MCP** | ChatGPT など MCP を話す AI | `https://finance.biglight.jp/mcp` | OAuth（許可画面に鍵を1回貼る） |

鍵は同じもの（`bl_live_` + 40文字）。発行・範囲の変更・失効・ログは **設定 › API・AI連携**（管理者のみ）で1か所。

---

## 2. 開ける手順（VPS で1回だけ）

Termius などで VPS に入り、**そのまま貼り付け**てください。置き場所は動いているコンテナ自身に聞くので、
ディレクトリ名を覚えていなくて大丈夫です。

```bash
# ① 予実のリポジトリへ移動（パスを覚えなくていい）
DIR=$(docker inspect yojitsu-web --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}')
cd "$DIR" && pwd

# ② .env を控えてから書き換える（秘密はこの中で作る。画面にも GitHub にも出ません）
cp -a .env ".env.bak-$(date +%Y%m%d-%H%M%S)"
SECRET=$(openssl rand -hex 32)
grep -vE '^(API_V1_ENABLED|API_V1_PUBLIC_BASE|MCP_ENABLED|MCP_PUBLIC_URL|MCP_TOKEN_SECRET|MCP_OAUTH_)' .env > .env.new
cat >> .env.new <<EOF
API_V1_ENABLED=true
API_V1_PUBLIC_BASE=https://finance.biglight.jp
MCP_ENABLED=true
MCP_PUBLIC_URL=https://finance.biglight.jp/mcp
MCP_TOKEN_SECRET=$SECRET
MCP_OAUTH_REDIRECT_URIS=https://chatgpt.com/connector_platform_oauth_redirect
MCP_OAUTH_REDIRECT_PREFIXES=https://chatgpt.com/connector/oauth/
MCP_OAUTH_ALLOW_DCR=true
EOF
mv .env.new .env && chmod 600 .env && unset SECRET

# ③ api だけ作り直す（env_file はコンテナを作るときにしか読まれません。再起動では効きません）
docker compose up -d --force-recreate api
docker compose logs api --tail 20 | grep BOOT
#   [BOOT] API v1: 有効（読み取り専用）
#   [BOOT] MCP: 有効 https://finance.biglight.jp/mcp
```

> nginx の設定（`/mcp` と `/.well-known/oauth-*`）は `deploy.sh` が毎回読み直させます。
> 手で触る必要はありません。

**外から見て確かめる（4本とも通ること）**

```bash
curl -s https://finance.biglight.jp/api/v1/health                       # {"status":"ok"...}
curl -s https://finance.biglight.jp/mcp/health                          # {"status":"ok"...}
curl -s https://finance.biglight.jp/.well-known/oauth-protected-resource/mcp   # resource が MCP_PUBLIC_URL と一致
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://finance.biglight.jp/mcp \
  -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_yojitsu_summary"}}'
# → 401（トークン無しで tools/call は必ず断られる。ここが 200 なら止めて調べること）
```

**閉じ方**
- 全部止める: `.env` の2行を `false` にして `docker compose up -d --force-recreate api`。
  ルートが 404 に戻るだけで、データも鍵も記録も何も変わりません。
- 1人だけ止める: 画面で その人の鍵を **失効**。
- 全員のAIを今すぐ切る: `MCP_TOKEN_SECRET` を作り直す（発行済みトークンが全部無効になります）。

---

## 3. 鍵を配る（画面・管理者）

**設定 › API・AI連携 › ＋ 鍵を発行**

1. **名前** … 使う人の名前（例: `田中（ChatGPT）`）。1人1鍵。
2. **まとめて選ぶ** … 押すと下のチェックが一気に決まります。
   | 段 | 中身 |
   |---|---|
   | 基本 | 合計の数字＋毎日の経理で使う表（取引先・請求ルール・請求・入金・支払請求・支払・経費・予算・勘定科目） |
   | 全画面 | 個人情報の表を除く すべての表 |
   | 全画面＋個人情報 | ★ 特定技能者・在籍期間も読める。管理者の判断で |
3. 必要なら個別に足し引き（チェックは常に出ています）。
4. **発行する** → 鍵が1回だけ出ます。本人に直接渡してください。

> 「合計の数字」（`yojitsu.read`）は 予実・資金繰り・残高の**合計だけ**を返し、1行の明細は返しません。
> 経営の数字だけ見せたいときは、これ1つでも足ります。

---

## 4. ChatGPT につなぐ

1. ChatGPT のコネクタで **`https://finance.biglight.jp/mcp`** を登録、認証は **OAuth**。
2. 許可画面が出る → **APIキーを貼る** → 許可する。
   鍵は AI 側には渡りません（AI が受け取るのは1時間の別トークン。更新用は30日）。
3. 聞き方の例:
   - 「未回収はいくら？ 期日を過ぎているものは？」 → `list_unpaid_invoices`
   - 「どの会社が一番長く払っていない？」 → `get_receivables_aging`
   - 「今月払うお金は？ 期日を過ぎている支払は？」 → `list_unpaid_bills`
   - 「今年度の売上と経常利益、予算に対してどう？」 → `get_yojitsu_summary`
   - 「来月、現金は足りる？」 → `get_cash_forecast`
   - 「アルファ社の残高は？」 → `get_company_account`

**ツール一覧**

| ツール | 何を返す | 要る範囲 |
|---|---|---|
| `get_yojitsu_summary` | 年度の損益7行（実績・予算・前年・着地見込）＋各種率 | `yojitsu.read` |
| `get_cash_forecast` | 資金繰り（週／月）と残高見込み | `yojitsu.read` |
| `list_unpaid_invoices` | 未回収の請求（期日順・延滞だけにも絞れる） | `invoices.read` |
| `get_receivables_aging` | 債権年齢表（取引先×経過日数） | `invoices.read` |
| `list_unpaid_bills` | 未払の支払請求（期日順・売上原価の額つき） | `bills.read` |
| `get_invoice` / `get_bill` | 伝票1枚（明細・入金／支払の充当まで） | `invoices.read` / `bills.read` |
| `search_companies` / `get_company_account` | 取引先と、その会社の売掛・買掛の状況 | `companies.read` |
| `list_screens` → `search_records` → `get_record` | どの画面でも同じ形で読む（許可した画面だけ） | 画面ごと |

---

## 5. Power Automate などにつなぐ

- 仕様書: `https://finance.biglight.jp/api/v1/openapi.json`（鍵なしで読めます。中身に秘密はありません）
- 呼び方: すべて `GET`、ヘッダー `X-API-Key: bl_live_…`

| 口 | 内容 |
|---|---|
| `/api/v1/collections` | 読める表の一覧（鍵の範囲つき） |
| `/api/v1/records/{表}` | 表の中身。`limit` `cursor` `updated_since`（前回からの差分だけ取れます） |
| `/api/v1/records/{表}/{id}` | 1行 |
| `/api/v1/reports/receivables` | 未回収＋債権年齢表 |
| `/api/v1/reports/payables` | 未払（`due_within_days` 既定30） |
| `/api/v1/reports/pl` | 予実（`fy=2025` で年度指定） |
| `/api/v1/reports/cashflow` | 資金繰り（`mode=week|month`） |

制限: IPごと 600回/分、鍵ごと 300回/分（MCP は 120回/分）。

---

## 6. 見張り方

- **設定 › API・AI連携 › 連携ログ** … 誰の鍵が・いつ・何を読んだか。**断った分も残ります**（範囲外を要求した、鍵が違う、など）。
- 同じ記録は **操作履歴** にも入ります（`entity='api_v1'`）。コンテナを作り直しても消えません。

---

## 7. ファイルの置き場所

```
backend/src/apiv1/
  collections.ts   画面（表）の台帳 ← 表を増やすのはここに1行足すだけ
  keys.ts          鍵・範囲・段（基本／全画面／＋個人情報）
  finance.ts       お金の計算 ★ web/index.html の ⑦ と同じ式（直したら両方）
  reports.ts       まとめの数字（REST と MCP が同じ関数を使う）
  router.ts        /api/v1/* と /apimgmt/*
  openapi.ts       仕様書
backend/src/mcp/
  oauth.ts         OAuth 2.1（認可画面・トークン）
  server.ts        JSON-RPC の本体
  tools.ts         ツール（読み取りだけ）
backend/src/statecache.ts   app_state の読み取りキャッシュ
web/index.html              設定 › API・AI連携 の画面
test/apiv1.js               画面と連携が同じ数字を出すかのテスト
```

**テスト**

```bash
node test/smoke.js web/index.html    # 画面の計算（58件）
node test/apiv1.js                   # 連携・突き合わせ・外に出さないもの（156件）
```

---

## 8. 引き渡し前のチェック（公式 §17.9）

- [ ] 台帳の `hidden` は正しいか。個人情報の表に `danger` が付いているか → `node test/apiv1.js`
- [ ] 範囲を1つだけ付けた鍵で `tools/list` のツール数が減るか。他のツールを呼ぶと断られるか
- [ ] 鍵を失効したら、その場で 401 になるか（トークンの期限を待たないか）
- [ ] トークン無しで `tools/list` は通り、`tools/call` は 401 ＋ `WWW-Authenticate` が付くか
- [ ] 知らない `redirect_uri` は 400 で、**リダイレクトしない**か
- [ ] 応答・ログ・監査・画面に、鍵やトークンの文字列が残っていないか
- [ ] 個人番号・在留カード番号・口座情報が、**どのツール・どの口からも**出てこないか
- [ ] `MCP_ENABLED=false` に戻したら、すべて 404 になり、画面は今までどおり動くか

---

## 9. これから（決めていないこと）

**AI に書かせる**（請求を作る・入金を記録する）は**まだ開けていません**。公式 §17.7 のとおり、
開けるなら先に「確認待ち → 職員が反映」の道を作ってからです。金額を扱うシステムで、
いきなり直接書き込みを開けてはいけません。必要になったら、そのときに判断してください。

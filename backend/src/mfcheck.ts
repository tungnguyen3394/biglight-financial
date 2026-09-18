/* ============================================================================
   Money Forward 連携の「本番での確かめ」— 読むだけの自己診断
   ----------------------------------------------------------------------------
   使い方（VPS で・api コンテナの中で動かします）:
     docker compose exec api node dist/mfcheck.js                 … 確かめるだけ（DBに書かない）
     docker compose exec api node dist/mfcheck.js --days 90       … 期間を変える（既定 60日）
     docker compose exec api node dist/mfcheck.js --refresh       … リフレッシュトークンも試す
     docker compose exec api node dist/mfcheck.js --apply         … 実際に取り込み、もう一度流して重複0を確かめる
     docker compose exec api node dist/mfcheck.js --connect       … 認可URLを表示（画面のボタンが使えないとき）
   ★ 秘密（ClientSecret・アクセストークン・リフレッシュトークン）は1バイトも出しません。
     出すのは 長さと先頭4文字だけ（つながっているかの確認用）。
   ★ --apply 以外では データベースに1行も書きません。MF へは常に読み取りだけ。
   ========================================================================== */
import crypto from 'crypto'
import { pool, cfgGet, cfgSet } from './db'
import * as MF from './mfinvoice'
import * as MFS from './mfsync'

const arg = (name: string) => process.argv.includes('--' + name)
const argVal = (name: string, def: number) => {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : def
}
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const peek = (s: any) => { const t = String(s || ''); return t ? `${t.slice(0, 4)}…（${t.length}文字）` : '（なし）' }
const line = (k: string, v: any) => console.log(`  ${k.padEnd(28, '　')} ${v}`)
const yen = (n: any) => Number(n || 0).toLocaleString('ja-JP')

async function main() {
  const deps: MF.MfDeps = { fetch: (...a: Parameters<typeof fetch>) => fetch(...a), cfgGet, cfgSet }
  const c = MF.mfConfig()
  let ng = 0

  const k = await MF.mfCreds(deps)
  console.log('\n■ 1. 設定（鍵）')
  line('アプリの鍵', k.clientId && k.clientSecret ? 'あり' : '★ 無い（画面「鍵を入れる」か .env）')
  line('鍵の出どころ', k.source === 'env' ? '.env（サーバー）' : (k.source === 'db' ? '画面から入れた分' : '—'))
  line('ClientID（先頭だけ）', peek(k.clientId))
  line('ClientSecret', k.clientSecret ? `設定あり（${k.clientSecret.length}文字・内容は出しません）` : '★ 無い')
  line('クライアント認証方式', k.tokenAuth === 'basic' ? 'CLIENT_SECRET_BASIC' : 'CLIENT_SECRET_POST')
  line('戻り先（Redirect URI）', c.redirectUri)
  line('要求するスコープ', c.scope)
  line('請求書 API', c.apiBase)
  line('会計 API', c.accounting ? c.acctBase : '使わない（MF_ACCOUNTING_ENABLED=false）')
  if (!k.clientId || !k.clientSecret) { console.log('\n→ 鍵が無いので ここまで。画面（設定 › API・AI連携）の「鍵を入れる」か bash vps/enable-mf.sh で入れてください。\n'); process.exit(1) }
  if (c.scope.includes('write')) { console.log('\n★ 書き込みスコープが入っています。読むだけの約束に反します。'); ng++ }

  console.log('\n■ 2. 接続（OAuth）')
  const raw = await cfgGet('mf_token')
  const tok = raw ? JSON.parse(raw) : null

  if (arg('connect')) {
    /* 画面のボタンが使えないときの逃げ道。ここで state を作って保存し、URL を出すだけ。
       認可そのものは「人がブラウザで許可する」しかできません（MF のログインが要るため）。 */
    const state = crypto.randomBytes(24).toString('hex')
    await cfgSet('mf_oauth_state', JSON.stringify({ state, by: 'cli@vps', exp: Date.now() + 10 * 60_000 }))
    const url = MF.authorizeUrl(state, process.env, k.clientId)
    console.log('\n■ 2b. 下の URL をブラウザで開いて、MF で「許可」してください（10分だけ有効・1回だけ使えます）\n')
    console.log(url + '\n')
    console.log('  許可すると ' + c.redirectUri + ' に戻り、トークンが保存されます。')
    console.log('  そのあと もう一度:  docker compose exec api node dist/mfcheck.js --refresh\n')
    await pool.end()
    process.exit(0)
  }

  if (!tok || !tok.access_token) {
    line('接続', '★ まだ接続していません')
    const cl0 = JSON.parse((await cfgGet('mf_connect_last')) || 'null')
    if (cl0) line('最後の戻り', `${cl0.at} ${cl0.ok ? '成功' : '失敗'}：${cl0.why}`)
    else line('最後の戻り', '（一度も戻ってきていません＝ブラウザで「許可」がまだ、または URL を開いていません）')
    console.log('\n→ 画面（設定 › API・AI連携）で「接続する」を押す。')
    console.log('  画面のボタンが使えないときは:  docker compose exec api node dist/mfcheck.js --connect\n')
    process.exit(1)
  }
  line('接続', 'あり')
  const cl = JSON.parse((await cfgGet('mf_connect_last')) || 'null')
  if (cl) line('最後の戻り', `${cl.at} ${cl.ok ? '成功' : '失敗'}：${cl.why}`)
  line('接続した人', tok.connected_by || '（不明）')
  line('接続した日時', tok.connected_at || '（不明）')
  line('アクセストークン', peek(tok.access_token))
  line('リフレッシュトークン', tok.refresh_token ? peek(tok.refresh_token) : '★ 無い（期限が切れたら再接続が必要）')
  line('MF が返したスコープ', tok.scope || '（返ってきていません）')
  const left = Math.round((Number(tok.expires_at || 0) - Date.now()) / 1000)
  line('有効期限まで', isFinite(left) ? `${left} 秒（${Math.round(left / 60)} 分）` : '（不明）')

  if (arg('refresh')) {
    console.log('\n■ 2b. リフレッシュトークンを試す')
    const before = tok.access_token
    try {
      /* 期限を過去にして accessToken() に更新させる（保存は accessToken() の中） */
      await cfgSet('mf_token', JSON.stringify({ ...tok, expires_at: Date.now() - 1000 }))
      const t2 = await MF.accessToken(deps)
      const after = JSON.parse((await cfgGet('mf_token')) || '{}')
      line('更新', t2 && t2 !== before ? 'OK（新しいトークンに変わりました）' : 'OK（同じトークンが返りました）')
      line('新しい有効期限まで', `${Math.round((Number(after.expires_at || 0) - Date.now()) / 1000)} 秒`)
    } catch (e: any) { line('更新', '★ NG ' + MF.scrub(e?.message || e)); ng++ }
  }

  console.log('\n■ 3. 請求書を取る（GET /billings・読むだけ）')
  const days = argVal('days', 60)
  const to = ymd(new Date()), from = ymd(new Date(Date.now() - days * 86400_000))
  line('期間（請求日）', `${from} 〜 ${to}`)
  let items: any[] = []
  try {
    items = await MF.fetchBillings(from, to, deps)
    line('HTTP', '200 OK')
    line('取れた請求書', `${items.length} 件`)
  } catch (e: any) {
    line('HTTP', '★ NG ' + MF.scrub(e?.message || e)); ng++
  }
  if (items.length) {
    const draft = items.filter(MFS.isDraft).length
    line('うち下書き（取り込まない）', `${draft} 件`)
    line('金額の合計（税込）', `${yen(items.reduce((s, x) => s + Number(x.total || 0), 0))} 円`)
    console.log('\n  （MF が返した項目名・先頭1件）')
    console.log('   ' + ((items[0] as any).rawKeys || []).join(', '))
    console.log('\n  （先頭3件・MF から返ってきた項目）')
    for (const x of items.slice(0, 3)) {
      console.log(`   ・id=${x.mfId} 番号=${x.number || '（なし）'} 取引先=${x.partnerName}（id=${x.partnerId || '—'}）`)
      console.log(`     請求日=${x.billingDate} 計上日=${x.salesDate || '—'} 期日=${x.dueDate || '—'}`)
      console.log(`     税抜=${yen(x.subtotal)} 税=${yen(x.tax)} 税込=${yen(x.total)} 入金状況=${x.paymentStatus || '—'} 状態=${x.mfStatus || '—'} 更新=${x.updatedAt || '—'}`)
      console.log(`     PDF=${x.pdfUrl ? 'あり' : '★ 無し（pdf_url が返っていません）'}`)
    }
  }

  console.log('\n■ 4. 取り込みの計画（この時点ではまだ書きません）')
  const state = (await pool.query('SELECT data FROM app_state WHERE id=1')).rows[0]?.data || {}
  const plan = MFS.planBillings(state, items as any)
  line('新規', `${plan.create.length} 件`)
  line('更新', `${plan.update.length} 件`)
  line('変更なし', `${plan.same.length} 件`)
  line('確定済みとの差異（mfDiff）', `${plan.diff.length} 件`)
  line('下書きで除外', `${plan.drafts} 件`)
  line('締めた期で見送り', `${plan.closed.length} 件`)
  line('取引先が未対応', `${plan.unmapped.reduce((s, g) => s + g.n, 0)} 件（${plan.unmapped.length} 社）`)
  for (const g of plan.unmapped.slice(0, 10)) console.log(`   ・${g.partnerName}（${g.n}件 / ${yen(g.total)}円）→ 画面で取引先を選んでください`)

  if (arg('apply')) {
    console.log('\n■ 5. 実際に取り込む（1回目）')
    const w1 = await write(state, items)
    line('結果', JSON.stringify(w1.stats))
    console.log('\n■ 6. もう一度同じものを取り込む（重複しないかの確認）')
    const state2 = (await pool.query('SELECT data FROM app_state WHERE id=1')).rows[0]?.data || {}
    const before = (state2.invoices || []).length
    const w2 = await write(state2, items)
    const state3 = (await pool.query('SELECT data FROM app_state WHERE id=1')).rows[0]?.data || {}
    const after = (state3.invoices || []).length
    line('2回目の結果', JSON.stringify(w2.stats))
    line('請求の件数', `${before} → ${after}`)
    line('重複', after === before ? '0 件（OK）' : `★ ${after - before} 件 増えました（NG）`)
    if (after !== before) ng++
  } else {
    console.log('\n■ 5. 取り込みは行いません（--apply を付けると取り込みます）')
  }

  console.log(`\n■ まとめ: ${ng ? '★ NG ' + ng + ' 件' : 'すべて OK'}\n`)
  await pool.end()
  process.exit(ng ? 1 : 0)
}

/** 取り込み（画面と同じ道を通す: 1行ロック → 書く） */
async function write(_state: any, items: any[]) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const r = await client.query('SELECT data FROM app_state WHERE id=1 FOR UPDATE')
    const base = r.rows[0]?.data || {}
    const out = MFS.applyBillings(base, items as any, { actor: 'mfcheck', source: 'api' })
    await client.query('UPDATE app_state SET data=$1::jsonb, updated_at=now() WHERE id=1', [JSON.stringify(out.state)])
    await client.query('COMMIT')
    return out
  } catch (e) { try { await client.query('ROLLBACK') } catch { /* ignore */ } throw e } finally { client.release() }
}

main().catch(async (e) => {
  console.error('\n★ 確認が途中で止まりました: ' + MF.scrub(e?.message || e) + '\n')
  try { await pool.end() } catch { /* ignore */ }
  process.exit(1)
})

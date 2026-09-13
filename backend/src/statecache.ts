/* ============================================================================
   app_state の読み取りキャッシュ
   ----------------------------------------------------------------------------
   app_state は「予実システムのデータ全部」が入った1行の JSONB。API v1 と MCP は
   1リクエストで何度も参照するので、毎回まるごと取り直すと遅い。
   先に updated_at だけを見て、変わっていなければ前回の中身を返す。
   → 中身が変わった瞬間に必ず新しくなるので、古い数字を返すことはない。

   ★ 返り値は共有オブジェクト。呼び出し側で書き換えないこと（読み取り専用）。
     書き込みは従来どおり index.ts の /state-delta のトランザクションだけ。

   ※ 「変わったか」の判定は CRM の同名ファイルと同じ作り。pg は timestamptz を
     Date で返し、String(Date) は秒までしか無いため、Date なら getTime()（ミリ秒）で見る。
   ========================================================================== */
import type { Pool } from 'pg'

let _at = ''
let _data: any = null
let _hits = 0
let _miss = 0

const stampOf = (v: any): string =>
  v instanceof Date ? String(v.getTime()) : String(v == null ? '' : v)

export async function loadStateCached(pool: Pool): Promise<any> {
  const r = await pool.query('SELECT updated_at FROM app_state WHERE id=1')
  const at = stampOf(r.rows[0] && r.rows[0].updated_at)
  if (_data && at && _at === at) { _hits++; return _data }
  const q = await pool.query('SELECT data, updated_at FROM app_state WHERE id=1')
  _data = (q.rows[0] && q.rows[0].data) || {}
  _at = stampOf(q.rows[0] && q.rows[0].updated_at) || at
  _miss++
  return _data
}

/** 書き込み直後に明示的に捨てたいとき用（保険。通常は updated_at で足りる） */
export function invalidateStateCache() { _at = ''; _data = null }

/** 動作確認用 */
export function stateCacheStats() { return { hits: _hits, misses: _miss, at: _at } }

/* ============================================================================
   API v1 — OpenAPI（外部の設定担当者がコネクタを作るための仕様書）
   ----------------------------------------------------------------------------
   ・鍵なしで読める（秘密は入っていない）。ここに載っているどの口も、呼ぶには鍵が要る。
   ・表の一覧は collections.ts から自動生成。表を足したら仕様書も増える。
   ============================================================================ */
import { COLLECTIONS } from './collections'
import { ATT_SCREEN_IDS, MISSING_SCREENS } from './attachments'

export function buildOpenApi(publicBase: string) {
  const base = String(publicBase || '').replace(/\/+$/, '')
  const collectionEnum = COLLECTIONS.map(c => c.id)
  const collectionTable = COLLECTIONS.map(c => `| \`${c.id}\` | ${c.label} | \`${c.readScope}\` |`).join('\n')
  return {
    openapi: '3.0.3',
    info: {
      title: 'BIGLIGHT 予実管理システム API',
      version: '1.0.0',
      description:
        '読み取り専用の業務API。ヘッダー `X-API-Key: bl_live_…` が必要です（鍵は 設定 › API・AI連携 で発行）。\n\n' +
        '| 表 | 画面 | 必要なスコープ |\n|---|---|---|\n' + collectionTable +
        '\n\n書き込みの口はありません（AI・外部システムから金額を動かせないようにするため）。' +
        '\n\n証憑（添付ファイル）は /attachments/… で読めます（付ける・消すことはできません）。',
    },
    servers: [{ url: base + '/api/v1' }],
    security: [{ ApiKeyAuth: [] }],
    components: {
      securitySchemes: { ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' } },
      schemas: {
        Error: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' }, request_id: { type: 'string' } } },
        RecordList: {
          type: 'object',
          properties: {
            collection: { type: 'string' }, label: { type: 'string' },
            items: { type: 'array', items: { type: 'object', additionalProperties: true } },
            count: { type: 'integer' }, total: { type: 'integer' }, has_more: { type: 'boolean' },
            next_cursor: { type: 'string', nullable: true },
          },
        },
      },
    },
    paths: {
      '/health': { get: { summary: '死活確認（鍵なし）', security: [], responses: { 200: { description: 'ok' } } } },
      '/integration/me': { get: { summary: 'この鍵の名前とスコープ', responses: { 200: { description: 'ok' } } } },
      '/collections': { get: { summary: '読める表の一覧', responses: { 200: { description: 'ok' } } } },
      '/records/{collection}': {
        get: {
          summary: '表の中身（新しい順・ページング）',
          parameters: [
            { name: 'collection', in: 'path', required: true, schema: { type: 'string', enum: collectionEnum } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
            { name: 'cursor', in: 'query', schema: { type: 'string' }, description: '前回の next_cursor' },
            { name: 'updated_since', in: 'query', schema: { type: 'string' }, description: '例 2026-09-01。前回から変わった行だけ取りたいとき' },
          ],
          responses: { 200: { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/RecordList' } } } }, 403: { description: 'スコープ不足' } },
        },
      },
      '/records/{collection}/{id}': {
        get: {
          summary: '表の1行',
          parameters: [
            { name: 'collection', in: 'path', required: true, schema: { type: 'string', enum: collectionEnum } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'ok' }, 404: { description: '見つかりません' } },
        },
      },
      '/reports/pl': {
        get: {
          summary: '予実（年度の損益・予算・見込・着地見込）  スコープ: yojitsu.read',
          parameters: [{ name: 'fy', in: 'query', schema: { type: 'integer' }, description: '会計年度（2025 = 2025/8〜2026/7）。省略すると今の年度' }],
          responses: { 200: { description: 'ok' } },
        },
      },
      '/reports/receivables': {
        get: {
          summary: '未回収の請求（債権年齢表つき）  スコープ: invoices.read',
          parameters: [
            { name: 'overdue_only', in: 'query', schema: { type: 'boolean' }, description: 'true なら入金期日を過ぎたものだけ' },
            { name: 'company_id', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
          ],
          responses: { 200: { description: 'ok' } },
        },
      },
      '/reports/payables': {
        get: {
          summary: '未払の支払請求（期日順）  スコープ: bills.read',
          parameters: [
            { name: 'due_within_days', in: 'query', schema: { type: 'integer' }, description: '何日以内に期日が来るものか（既定 30）' },
            { name: 'overdue_only', in: 'query', schema: { type: 'boolean' } },
            { name: 'company_id', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
          ],
          responses: { 200: { description: 'ok' } },
        },
      },
      '/reports/settlement': {
        get: {
          summary: '消込一覧（入金 × 請求書）— 経理が MF 会計で仕訳を入れるための材料',
          parameters: [{ name: 'month', in: 'query', required: true, schema: { type: 'string', example: '2026-09' } }],
          responses: { 200: { description: 'ok' } },
        },
      },
      '/reports/reconciliation': {
        get: {
          summary: '突合（この システムの売掛残高 ⇔ 試算表の売掛金）',
          parameters: [{ name: 'month', in: 'query', required: true, schema: { type: 'string', example: '2026-09' } }],
          responses: { 200: { description: 'ok' } },
        },
      },
      '/reports/cashflow': {
        get: {
          summary: '資金繰り（入金予定 − 支払予定）  スコープ: yojitsu.read',
          parameters: [
            { name: 'mode', in: 'query', schema: { type: 'string', enum: ['week', 'month'], default: 'week' } },
            { name: 'periods', in: 'query', schema: { type: 'integer', default: 12, maximum: 52 } },
          ],
          responses: { 200: { description: 'ok' } },
        },
      },
      /* ★ 2026-09-16: 証憑（添付ファイル）— 読むだけ。スコープは その伝票の表の read */
      '/attachments/{screen}/{id}': {
        get: {
          summary: '伝票1件に付いたファイルの一覧（書類の種類・会社・月・金額つき）  スコープ: その表の read',
          parameters: [
            { name: 'screen', in: 'path', required: true, schema: { type: 'string', enum: ATT_SCREEN_IDS } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'ok' }, 403: { description: 'スコープ不足' }, 404: { description: '見つかりません' } },
        },
      },
      '/attachments/file/{fileId}': {
        get: {
          summary: 'ファイルの中身（PDF・画像・Excel・Word）  スコープ: そのファイルが付いた表の read',
          parameters: [{ name: 'fileId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'ファイル本体', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } }, 404: { description: '見つかりません' } },
        },
      },
      '/attachments/missing': {
        get: {
          summary: '証憑（ファイル）が付いていない伝票  スコープ: 各表の read（読める表だけ返す）',
          parameters: [
            { name: 'screen', in: 'query', schema: { type: 'string', enum: MISSING_SCREENS }, description: '省略すると読める表すべて' },
            { name: 'month_from', in: 'query', schema: { type: 'string' }, description: 'YYYY-MM' },
            { name: 'month_to', in: 'query', schema: { type: 'string' }, description: 'YYYY-MM' },
            { name: 'company_id', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
          ],
          responses: { 200: { description: 'ok' } },
        },
      },
    },
  }
}

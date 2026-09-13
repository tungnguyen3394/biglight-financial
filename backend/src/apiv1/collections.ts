/* ============================================================================
   API v1 — 画面（表）の台帳
   ----------------------------------------------------------------------------
   公式 CONG-THUC-XAY-DUNG-APP.md §17.2 のとおり:
     1画面 = app_state の1配列 = 1スコープ（<id>.read）
     ここに無い表は API からも MCP からも一切見えない。増やすときはこの表に1行足す。

   決めごと:
     ・id は外に出る名前（snake_case）。crmKey は app_state の配列名
       （web/index.html の ENTITIES / commitRecord が使う名前と同じ）。
     ・添付・トークン・個人情報の生データは返さない（hidden ＋ 自動判定の二段構え）。
     ・個人が特定できる表（特定技能者・在籍期間）は danger。既定の段では鍵に付かない。
     ・page は web/index.html の権限表（ROLE_DEFAULT）と同じ画面ID。
   ★ この表を直したら test/apiv1.js が app_state の実配列名と突き合わせます。
   ============================================================================ */

export interface CollectionDef {
  /** 外部での名前（snake_case・URLに出る） */
  id: string
  /** app_state の配列名 */
  crmKey: string
  /** 画面名（日本語） */
  label: string
  /** 画面ID（権限表と同じ） */
  page: string
  /** 読むのに要るスコープ */
  readScope: string
  /** 返さないキー */
  hidden?: string[]
  /** 既定では鍵に付けない（個人情報） */
  danger?: boolean
  /** 何の表か、1行の説明 */
  note?: string
  /** 「基本」の段に入れる（毎日の経理で使う表） */
  basic?: boolean
}

/* システム項目はどの表でも返さない */
export const COMMON_HIDDEN = ['_dirty', 'uid', 'oldId']

export const COLLECTIONS: CollectionDef[] = [
  { id: 'companies', crmKey: 'companies', label: '取引先', page: 'companies', readScope: 'companies.read', basic: true,
    note: '得意先・仕入先。締日・支払サイト・支払日から入金期日が決まる' },

  { id: 'billing_rules', crmKey: 'billingRules', label: '請求ルール', page: 'companies', readScope: 'billing_rules.read', basic: true,
    note: '取引先ごとの請求の作り方（人数×単価／月額固定／都度）' },

  { id: 'invoices', crmKey: 'invoices', label: '請求書（売掛）', page: 'invoices', readScope: 'invoices.read', basic: true,
    note: '請求書。計上月が売上の月。明細（items）に勘定科目が入る' },

  { id: 'payments', crmKey: 'payments', label: '入金・消込', page: 'receipts', readScope: 'payments.read', basic: true,
    note: '入金の記録と、どの請求書に充てたか（allocations）' },

  { id: 'bills', crmKey: 'bills', label: '支払請求（買掛）', page: 'bills', readScope: 'bills.read', basic: true,
    note: '仕入先からの請求。計上月が費用（売上原価・販管費）の月' },

  { id: 'payouts', crmKey: 'payouts', label: '支払実行', page: 'payouts', readScope: 'payouts.read', basic: true,
    note: '支払の記録と、どの支払請求に充てたか（allocations）' },

  { id: 'expenses', crmKey: 'expenses', label: '経費', page: 'expenses', readScope: 'expenses.read', basic: true,
    note: '買掛を通さない即払いの費用。金額は税込で入る' },

  { id: 'budgets', crmKey: 'budgets', label: '予算', page: 'yojitsu', readScope: 'budgets.read', basic: true,
    note: '年度×月×勘定科目の予算額（税抜）' },

  { id: 'forecasts', crmKey: 'forecasts', label: '見込', page: 'yojitsu', readScope: 'forecasts.read',
    note: '年度×月×勘定科目の見込額（税抜）' },

  { id: 'actual_adjust', crmKey: 'actualAdjust', label: '実績調整', page: 'yojitsu', readScope: 'actual_adjust.read',
    note: '会計事務所の数字・期首の持ち込みなど、伝票に無い実績の手入力' },

  { id: 'accounts', crmKey: 'accounts', label: '勘定科目', page: 'settings', readScope: 'accounts.read', basic: true,
    note: 'コード・名称・区分（収益／売上原価／販管費／営業外）' },

  { id: 'departments', crmKey: 'departments', label: '部門', page: 'settings', readScope: 'departments.read',
    note: '経費の部門' },

  { id: 'objectives', crmKey: 'objectives', label: 'OKR 目標', page: 'okr', readScope: 'objectives.read',
    note: '四半期の目標（Objective）' },

  { id: 'key_results', crmKey: 'keyResults', label: 'OKR 主要成果', page: 'okr', readScope: 'key_results.read',
    note: '目標にぶら下がる測れる指標（KR）。予実から自動で取るものもある' },

  { id: 'checkins', crmKey: 'checkins', label: 'OKR チェックイン', page: 'okr', readScope: 'checkins.read',
    note: 'KR の進捗メモ' },

  { id: 'workers', crmKey: 'workers', label: '特定技能者', page: 'workers', readScope: 'workers.read', danger: true,
    hidden: ['individualNumber', 'residenceCard', 'passportNo'],
    note: '★ 個人情報。CRM から取り込んだ氏名・国籍・在留期限。必要が無ければ付けないこと' },

  { id: 'assignments', crmKey: 'assignments', label: '在籍期間', page: 'workers', readScope: 'assignments.read', danger: true,
    note: '★ 誰が・どの会社に・いつからいつまで。支援委託料（人数×単価）の根拠' },
]

export const COLLECTION_IDS = COLLECTIONS.map(c => c.id)
export const collectionById = (id: any) => COLLECTIONS.find(c => c.id === String(id || '')) || null
export const collectionByKey = (k: any) => COLLECTIONS.find(c => c.crmKey === String(k || '')) || null

/** 台帳から生まれる読み取りスコープ（名前を2か所で書かない） */
export const COLLECTION_SCOPES = COLLECTIONS.map(c => ({
  id: c.readScope, label: c.label + 'を読む', danger: !!c.danger, basic: !!c.basic,
}))

/* ───────── 中身の掃除 ─────────
   台帳の hidden に加えて、「見るからに実体（ファイル・画像）」は自動で落とす。
   表が増えても、うっかり base64 を外に出さないための二段目。 */
const looksLikeFile = (v: any): boolean => {
  if (!v) return false
  if (typeof v === 'string') return v.length > 512 && /^data:|^[A-Za-z0-9+/=]{512,}$/.test(v)
  if (typeof v === 'object') return typeof (v as any).data === 'string' && (v as any).data.length > 200
  return false
}

/** 1行を外に出せる形にする。返すのは新しいオブジェクト（元データは触らない） */
export function publicRow(def: CollectionDef, row: any): any {
  if (!row || typeof row !== 'object') return null
  const drop = new Set([...COMMON_HIDDEN, ...(def.hidden || [])])
  const out: any = {}
  for (const k of Object.keys(row)) {
    if (drop.has(k)) continue
    const v = (row as any)[k]
    if (looksLikeFile(v)) { out[k] = { attached: true } as any; continue }
    if (Array.isArray(v)) { out[k] = v.map(x => (looksLikeFile(x) ? { attached: true } : x)); continue }
    out[k] = v
  }
  return out
}

/** 並べ替えの基準にする日時（更新→作成→空） */
export const rowStamp = (row: any): string =>
  String((row && (row.updatedAt || row.createdAt)) || '')

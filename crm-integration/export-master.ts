/* ============================================================================
   CRM側に足す「読み取り専用」エンドポイント（予実管理システム連携用）
   ----------------------------------------------------------------------------
   置き場所: 1.CRM/backend/src/exportmaster.ts として保存し、index.ts の最後に
             次の2行を足すだけ。既存のコードは1行も変えません。

       import { mountExportMaster } from './exportmaster'
       mountExportMaster(app, pool)

   性質:
     ・GET のみ。CRMのデータは一切変更しません。
     ・専用キー（CRM_EXPORT_KEY）でのみ通ります。利用者のGoogleトークンは使いません。
     ・返すのは「予実に必要な項目だけ」。個人番号・パスポート番号・住所などの
       センシティブな項目は返しません（必要ないものは渡さない）。
     ・呼び出しは記録します（誰がいつ引いたか分かるように）。
   ========================================================================== */

export function mountExportMaster(app: any, pool: any) {
  const KEY = process.env.CRM_EXPORT_KEY || ''

  app.get('/export/master', async (req: any, res: any) => {
    // 鍵が未設定なら機能そのものを閉じる（空文字で誰でも通る、を防ぐ）
    if (!KEY) return res.status(503).json({ error: 'export-disabled' })
    const given = String(req.headers['x-export-key'] || req.query.key || '')
    if (given !== KEY) return res.status(401).json({ error: 'bad-key' })

    try {
      const r = await pool.query('SELECT data FROM app_state WHERE id=1')
      const s = r.rows[0]?.data || {}

      const companies = (s.companies || []).map((c: any) => ({
        crmId: c.id, code: c.code || '', name: c.name || '', kana: c.kana || '',
        corpNo: c.corpNo || '', zip: c.zip || '', address: c.address || '',
        phone: c.phone || '', fax: c.fax || '', email: c.email || '', website: c.website || '',
        field: c.field || '', bizType: c.bizType || '',
        repName: c.repName || '', staffName: c.staffName || '', staffEmail: c.staffEmail || '',
        contractStatus: c.contractStatus || '',
      }))

      const workers = (s.workers || []).map((w: any) => ({
        crmId: w.id, code: w.code || '', name: w.name || '', kana: w.kana || '',
        dob: w.dob || '', gender: w.gender || '', nationality: w.nationality || '',
        visaStatus: w.visaStatus || '', visaExp: w.visaExp || '',
        // ※ 個人番号・パスポート番号・住所・電話は意図的に含めません
      }))

      // 在籍期間（支援委託料の計算根拠）。雇用管理の1件 = 1つの在籍期間。
      const assignments = (s.employment || []).map((e: any) => ({
        crmId: e.id, workerCrmId: e.workerId || '', companyCrmId: e.companyId || '',
        joinDate: String(e.joinDate || '').slice(0, 10),
        exitDate: String(e.quitDate || '').slice(0, 10),
        status: e.workStatus || '',
      })).filter((a: any) => a.workerCrmId && a.companyCrmId)

      pool.query(
        `INSERT INTO audit_log(actor_email,action,entity,entity_id,detail) VALUES($1,$2,$3,$4,$5::jsonb)`,
        ['system:yojitsu-export', 'read', 'export_master', '-',
          JSON.stringify({ companies: companies.length, workers: workers.length, assignments: assignments.length,
            ip: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '') })]
      ).catch(() => {})

      res.set('Cache-Control', 'no-store')
      res.json({ at: new Date().toISOString(), companies, workers, assignments })
    } catch (e: any) {
      console.error('[export/master]', e?.message)
      res.status(500).json({ error: 'db-error' })
    }
  })
}

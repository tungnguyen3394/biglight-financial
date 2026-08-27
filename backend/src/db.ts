/* ============================================================================
   DB — kết nối PostgreSQL + tạo bảng.
   ----------------------------------------------------------------------------
   Cấu trúc giống CRM (đã chạy thật, chịu được sự cố mất dữ liệu 31/07/2026):
     app_state          1 dòng duy nhất, cột data JSONB = toàn bộ dữ liệu nghiệp vụ
     app_state_history  ảnh chụp mỗi lần ghi  → lùi lại trong vài giây
     audit_log          ai · lúc nào · sửa ô nào · cũ→mới
     sync_log           MỌI lần ghi kể cả BỊ CHẶN (log container mất khi rebuild)
     profiles           tài khoản + vai trò + trạng thái duyệt
     crm_sync_log       lịch sử đồng bộ từ CRM
   ========================================================================== */
import { Pool } from 'pg'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
})

const DDL = `
CREATE TABLE IF NOT EXISTS app_state (
  id         INT PRIMARY KEY,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ảnh chụp mỗi lần ghi. counts = số bản ghi từng collection, để nhìn phát hiện ngay
-- bản nào hỏng (455 → 6) mà không phải mở JSON hàng chục MB.
CREATE TABLE IF NOT EXISTS app_state_history (
  id          BIGSERIAL PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_email TEXT,
  reason      TEXT,
  counts      JSONB,
  data        JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ash_at ON app_state_history(at);

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_email TEXT, actor_name TEXT,
  action      TEXT,            -- create | update | delete | cancel
  entity      TEXT, entity_id TEXT,
  detail      JSONB            -- update: {field:{old,new}} · delete/cancel: dòng cũ
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_at     ON audit_log(at);
CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_log(actor_email);

CREATE TABLE IF NOT EXISTS sync_log (
  id          BIGSERIAL PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_email TEXT,
  result      TEXT,   -- accepted | blocked
  reason      TEXT,   -- shrink-guard / since-required / epoch-mismatch / client-too-old / authz-*
  ip          TEXT, user_agent TEXT, contract INT,
  detail      JSONB
);
CREATE INDEX IF NOT EXISTS idx_sync_log_at     ON sync_log(at);
CREATE INDEX IF NOT EXISTS idx_sync_log_result ON sync_log(result);

-- Tài khoản. status: pending | active | disabled — pending KHÔNG ghi được gì.
CREATE TABLE IF NOT EXISTS profiles (
  email       TEXT PRIMARY KEY,
  name        TEXT,
  picture     TEXT,
  role        TEXT NOT NULL DEFAULT 'Viewer',   -- Admin | Manager | Staff | Viewer
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login  TIMESTAMPTZ,
  last_seen   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS login_log (
  id     BIGSERIAL PRIMARY KEY,
  at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  email  TEXT, ip TEXT, user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_login_log_at ON login_log(at);

-- Đồng bộ từ CRM: lấy được bao nhiêu, thêm/sửa mấy, lỗi gì. Không lấy được thì
-- PHẢI thấy lý do — im lặng là kiểu hỏng nguy hiểm nhất của tính năng đồng bộ.
CREATE TABLE IF NOT EXISTS crm_sync_log (
  id        BIGSERIAL PRIMARY KEY,
  at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  source    TEXT,      -- api | csv | manual
  actor     TEXT,
  ok        BOOLEAN,
  stats     JSONB,     -- {companies:'92→94 (+2 ~5)', workers:'…'}
  message   TEXT
);
CREATE INDEX IF NOT EXISTS idx_crm_sync_at ON crm_sync_log(at);

CREATE TABLE IF NOT EXISTS server_config (key TEXT PRIMARY KEY, value TEXT);
`

export async function ensureTables() {
  await pool.query(DDL)
  await pool.query(`INSERT INTO app_state (id, data) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`)
}

/** Đọc/ghi cấu hình sống trong DB (epoch…) — sống qua mọi lần rebuild container. */
export async function cfgGet(key: string): Promise<string | null> {
  const r = await pool.query('SELECT value FROM server_config WHERE key=$1', [key])
  return r.rows[0]?.value ?? null
}
export async function cfgSet(key: string, value: string) {
  await pool.query(
    `INSERT INTO server_config(key,value) VALUES($1,$2)
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [key, value])
}

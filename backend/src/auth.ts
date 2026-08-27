/* ============================================================================
   AUTH — Google Identity Services (giống CRM, KHÔNG dùng NextAuth).
   ----------------------------------------------------------------------------
   Client lấy ID token bằng nút Google → gửi lên qua header Authorization.
   Backend xác thực với Google, kiểm tra domain, rồi tra bảng profiles.
   Không tự tin vai trò do client gửi lên — vai trò LUÔN đọc từ database.
   ========================================================================== */
import { pool } from './db'

const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN || 'biglight.jp').toLowerCase()
const ADMIN_EMAILS = (process.env.ADMIN_EMAIL || 'n-tung@biglight.jp')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

type TokenInfo = { email: string; name?: string; picture?: string }

// Bộ nhớ đệm token đã xác thực — Google giới hạn tần suất, mà mỗi thao tác lại gọi 1 lần.
const tokenCache = new Map<string, { info: TokenInfo; exp: number }>()

async function verifyGoogleToken(token: string): Promise<TokenInfo | null> {
  const hit = tokenCache.get(token)
  if (hit && hit.exp > Date.now()) return hit.info
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token))
    if (!r.ok) return null
    const d: any = await r.json()
    const email = String(d.email || '').toLowerCase()
    if (!email || d.email_verified === 'false') return null
    // Chỉ tài khoản trong domain công ty. Đây là hàng rào ngoài cùng.
    if (ALLOWED_DOMAIN && !email.endsWith('@' + ALLOWED_DOMAIN)) return null
    if (process.env.GOOGLE_CLIENT_ID && d.aud !== process.env.GOOGLE_CLIENT_ID) return null
    const info: TokenInfo = { email, name: d.name, picture: d.picture }
    const expMs = (Number(d.exp) * 1000) || (Date.now() + 300_000)
    tokenCache.set(token, { info, exp: Math.min(expMs, Date.now() + 300_000) })
    if (tokenCache.size > 500) tokenCache.clear()
    return info
  } catch { return null }
}

/** Lấy email từ header. null = chưa đăng nhập / token hỏng. */
export async function verifyBearer(req: any): Promise<string | null> {
  const m = /^Bearer (.+)$/.exec(String(req.headers['authorization'] || ''))
  if (!m) return null
  const info = await verifyGoogleToken(m[1])
  return info ? info.email : null
}

/** Xác thực + tạo/nâng cấp hồ sơ. Dùng ở /auth/google lúc đăng nhập. */
export async function loginWithToken(token: string, ip: string, ua: string) {
  const info = await verifyGoogleToken(token)
  if (!info) return null
  const isAdmin = ADMIN_EMAILS.includes(info.email)
  // Người trong domain được duyệt sẵn (active). Ngoài domain đã bị chặn ở trên.
  await pool.query(
    `INSERT INTO profiles (email, name, picture, role, status, last_login)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (email) DO UPDATE
       SET name=EXCLUDED.name, picture=EXCLUDED.picture, last_login=now()`,
    [info.email, info.name || '', info.picture || '', isAdmin ? 'Admin' : 'Staff', 'active'])
  // Admin cấu hình trong env LUÔN được nâng lên Admin/active (khoá nhầm thì vẫn vào lại được)
  if (isAdmin) await pool.query(`UPDATE profiles SET role='Admin', status='active' WHERE email=$1`, [info.email])
  await pool.query('INSERT INTO login_log(email, ip, user_agent) VALUES($1,$2,$3)', [info.email, ip, ua])
  const p = await profileOf(info.email)
  return { email: info.email, name: info.name || '', picture: info.picture || '', ...p }
}

export async function profileOf(email: string): Promise<{ role: string; status: string }> {
  const r = await pool.query('SELECT role, status FROM profiles WHERE email=$1', [email])
  if (!r.rows[0]) return { role: 'Viewer', status: 'pending' }
  return { role: r.rows[0].role || 'Viewer', status: r.rows[0].status || 'pending' }
}

/** Lớp 1 — tài khoản có được ghi gì không. LUÔN chặn thật, không phụ thuộc PERM_MODE. */
export function canWriteAtAll(role: string, status: string) {
  if (status !== 'active') return { ok: false, reason: 'account-' + (status || 'unknown') }
  if (role === 'Viewer') return { ok: false, reason: 'role-viewer' }
  return { ok: true, reason: '' }
}

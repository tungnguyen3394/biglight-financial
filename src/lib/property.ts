// 物件マスタ (PropertyMaster) — từng căn nhà/vật件 nằm DƯỚI 管理費>オフィス>地代家賃.
//
// Nguyên tắc "1 bảng 1 nhiệm vụ":
//   - Category Master (lib/expenses.ts): 大>中>小 (管理費>オフィス>地代家賃)
//   - Property Master (file này): từng căn nhà (A寮, B寮…) gắn với 地代家賃
//   - Expense Transaction (lib/expenses.ts): tiền CHI (thuê nhà trả cho chủ) — gắn propertyId
//   - Collection Transaction (file này): tiền THU lại từ 入居者 (家賃回収)
//
// Báo cáo mỗi căn: 実質負担 = 支出(chi) − 回収(thu).

export const RENT_PATH = ["admin", "office", "rent"]; // 管理費 > オフィス > 地代家賃 (key trong cây danh mục)
export const isRentPath = (path: string[]): boolean =>
  path[0] === RENT_PATH[0] && path[1] === RENT_PATH[1] && path[2] === RENT_PATH[2];

export type PayMethod = "自動引き落とし" | "振込" | "現金";
export const PAY_METHODS: PayMethod[] = ["自動引き落とし", "振込", "現金"];

export type PropStatus = "契約中" | "準備中" | "解約";
export const PROP_STATUS: PropStatus[] = ["契約中", "準備中", "解約"];
export const STATUS_TONE: Record<PropStatus, string> = {
  契約中: "bg-emerald-50 text-emerald-600", 準備中: "bg-amber-50 text-amber-600", 解約: "bg-slate-100 text-slate-500",
};

export type Property = {
  id: string;
  name: string;            // 物件名 / 寮名
  order: number;           // display_order (số thứ tự hiển thị)
  address: string;
  ownerName: string;       // 大家 / オーナー
  monthlyRent: number;     // 月額家賃 (会社が支払う)
  paymentDay: number;      // 支払日 (1-31)
  paymentMethod: PayMethod;
  contractStart: string;
  contractEnd: string;
  status: PropStatus;
  memo: string;
};

// 家賃回収 (thu lại từ 入居者) — bảng riêng.
export type RentCollection = {
  id: string;
  propertyId: string;
  tenant: string;          // 入居者
  ym: string;              // 対象月 "2026-07"
  amount: number;
  date: string;            // 回収日
  method: PayMethod;
  memo: string;
};

export type PropertyStore = { properties: Property[]; collections: RentCollection[] };

export const STORAGE_KEY = "bl_property_v1";
export const yen = (n: number): string => "¥" + Math.round(n).toLocaleString("ja-JP");
export const uid = (): string => "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36);

// ---- Báo cáo mỗi căn: 支出 vs 回収 vs 実質負担 ----
export type PropRow = { p: Property; paid: number; collected: number; net: number; collectors: RentCollection[] };
export function propertyReport(
  props: Property[],
  expenses: { propertyId?: string; date: string; amount: number }[],
  collections: RentCollection[],
  ym: string,
): PropRow[] {
  return [...props].sort((a, b) => a.order - b.order).map((p) => {
    const paid = expenses.filter((e) => e.propertyId === p.id && e.date.slice(0, 7) === ym).reduce((t, e) => t + e.amount, 0);
    const cs = collections.filter((c) => c.propertyId === p.id && c.ym === ym);
    const collected = cs.reduce((t, c) => t + c.amount, 0);
    return { p, paid, collected, net: paid - collected, collectors: cs };
  });
}

// ---- Dữ liệu mẫu ----
export function sampleProperties(): PropertyStore {
  const properties: Property[] = [
    { id: "prop_a", name: "A寮", order: 1, address: "愛知県名古屋市中村区…", ownerName: "田中不動産(株)", monthlyRent: 80000, paymentDay: 27, paymentMethod: "自動引き落とし", contractStart: "2025-04-01", contractEnd: "2027-03-31", status: "契約中", memo: "4名入居可" },
    { id: "prop_b", name: "B寮", order: 2, address: "愛知県小牧市…", ownerName: "山田地所", monthlyRent: 75000, paymentDay: 27, paymentMethod: "自動引き落とし", contractStart: "2025-06-01", contractEnd: "2027-05-31", status: "契約中", memo: "" },
    { id: "prop_c", name: "C寮", order: 3, address: "岐阜県大垣市…", ownerName: "佐藤ハウジング", monthlyRent: 90000, paymentDay: 25, paymentMethod: "振込", contractStart: "2025-08-01", contractEnd: "2027-07-31", status: "契約中", memo: "空室あり" },
    { id: "prop_d", name: "Dマンション", order: 4, address: "愛知県春日井市…", ownerName: "鈴木不動産", monthlyRent: 120000, paymentDay: 5, paymentMethod: "自動引き落とし", contractStart: "2026-01-01", contractEnd: "2028-12-31", status: "契約中", memo: "" },
  ];
  const collections: RentCollection[] = [
    { id: "rc1", propertyId: "prop_a", tenant: "Nguyễn Văn A", ym: "2026-07", amount: 60000, date: "2026-07-05", method: "振込", memo: "1名分" },
    { id: "rc2", propertyId: "prop_b", tenant: "Trần Văn B", ym: "2026-07", amount: 40000, date: "2026-07-05", method: "振込", memo: "" },
    { id: "rc3", propertyId: "prop_b", tenant: "Lê Văn C", ym: "2026-07", amount: 35000, date: "2026-07-06", method: "現金", memo: "" },
    { id: "rc4", propertyId: "prop_d", tenant: "Phạm Văn D", ym: "2026-07", amount: 100000, date: "2026-07-03", method: "振込", memo: "" },
    // C寮: chưa thu (0) → 実質負担 lớn
  ];
  return { properties, collections };
}

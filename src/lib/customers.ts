// 顧客・契約管理 — khách hàng CHỨA hợp đồng (gộp 契約管理 vào 顧客管理).
//   顧客 (1) ──▶ (n) 契約

export type Contract = {
  id: string;
  title: string;      // 契約名
  type: string;       // 月額 / スポット / 成果報酬
  amount: number;     // 契約金額 (円)
  startDate: string;
  endDate: string;    // "" = không kỳ hạn
  status: "有効" | "終了" | "下書き";
};

export type Customer = {
  id: string;
  code: string;
  name: string;
  group: string;      // phân loại
  contact: string;    // người phụ trách phía khách
  phone: string;
  email: string;
  note: string;
  active: boolean;
  contracts: Contract[];
};

export const STORAGE_KEY = "bl_customers_v1";
export const CONTRACT_TYPES = ["月額", "スポット", "成果報酬"];
export const CUSTOMER_GROUPS = ["製造", "食品", "建設", "農業", "サービス", "その他"];

export const CONTRACT_TONE: Record<Contract["status"], string> = {
  有効: "bg-emerald-50 text-emerald-600",
  終了: "bg-slate-100 text-slate-500",
  下書き: "bg-amber-50 text-amber-600",
};

export function sampleCustomers(): Customer[] {
  return [
    {
      id: "c1", code: "C001", name: "株式会社アオイ工業", group: "製造", contact: "山田 太郎", phone: "0568-11-2233", email: "yamada@aoi-kogyo.jp", note: "", active: true,
      contracts: [
        { id: "k1", title: "登録支援委託契約", type: "月額", amount: 300000, startDate: "2025-10-01", endDate: "", status: "有効" },
        { id: "k2", title: "人材紹介基本契約", type: "成果報酬", amount: 900000, startDate: "2025-10-01", endDate: "", status: "有効" },
      ],
    },
    {
      id: "c2", code: "C002", name: "ミライフーズ株式会社", group: "食品", contact: "佐藤 花子", phone: "058-22-3344", email: "sato@miraifoods.jp", note: "支払サイト60日", active: true,
      contracts: [
        { id: "k3", title: "登録支援委託契約", type: "月額", amount: 250000, startDate: "2026-01-01", endDate: "", status: "有効" },
      ],
    },
    {
      id: "c3", code: "C003", name: "サクラ建設", group: "建設", contact: "鈴木 一郎", phone: "052-33-4455", email: "suzuki@sakura-k.jp", note: "", active: true,
      contracts: [
        { id: "k4", title: "人材紹介基本契約", type: "成果報酬", amount: 730000, startDate: "2026-03-01", endDate: "", status: "有効" },
        { id: "k5", title: "登録支援委託契約", type: "月額", amount: 350000, startDate: "2026-04-01", endDate: "2026-05-31", status: "終了" },
      ],
    },
    {
      id: "c4", code: "C004", name: "有限会社ハルタ", group: "サービス", contact: "春田 誠", phone: "0586-44-5566", email: "info@haruta.co.jp", note: "延滞注意", active: true,
      contracts: [
        { id: "k6", title: "登録支援委託契約", type: "月額", amount: 200000, startDate: "2026-02-01", endDate: "", status: "有効" },
      ],
    },
    {
      id: "c5", code: "C005", name: "ヤマト食品株式会社", group: "食品", contact: "大和 治", phone: "0565-55-6677", email: "yamato@yamato-foods.jp", note: "", active: true,
      contracts: [
        { id: "k7", title: "人材紹介基本契約", type: "成果報酬", amount: 800000, startDate: "2026-05-01", endDate: "", status: "有効" },
        { id: "k8", title: "登録支援委託契約", type: "月額", amount: 200000, startDate: "2026-07-01", endDate: "", status: "有効" },
      ],
    },
    {
      id: "c6", code: "C006", name: "グリーン農園株式会社", group: "農業", contact: "緑川 豊", phone: "0574-66-7788", email: "midori@green-farm.jp", note: "新規 2026/6〜", active: true,
      contracts: [
        { id: "k9", title: "人材紹介基本契約", type: "成果報酬", amount: 800000, startDate: "2026-06-01", endDate: "", status: "有効" },
      ],
    },
    { id: "c7", code: "C007", name: "毎味水産(株)", group: "食品", contact: "フン", phone: "059-0000-0007", email: "info@maimi.jp", note: "", active: true, contracts: [{ id: "k10", title: "登録支援委託契約", type: "月額", amount: 316774, startDate: "2025-08-01", endDate: "", status: "有効" }] },
    { id: "c8", code: "C008", name: "南海食品株式会社", group: "食品", contact: "フン", phone: "059-0000-0008", email: "info@nankai.jp", note: "", active: true, contracts: [{ id: "k11", title: "登録支援委託契約", type: "月額", amount: 234000, startDate: "2025-08-01", endDate: "", status: "有効" }] },
    { id: "c9", code: "C009", name: "株式会社高山", group: "製造", contact: "フン", phone: "059-0000-0009", email: "info@takayama.jp", note: "", active: true, contracts: [{ id: "k12", title: "登録支援委託契約", type: "月額", amount: 401775, startDate: "2025-08-01", endDate: "", status: "有効" }] },
    { id: "c10", code: "C010", name: "株式会社古屋鉄筋", group: "建設", contact: "フン", phone: "059-0000-0010", email: "info@furuya.jp", note: "", active: true, contracts: [{ id: "k13", title: "登録支援委託契約", type: "月額", amount: 150000, startDate: "2025-08-01", endDate: "", status: "有効" }] },
    { id: "c11", code: "C011", name: "アース建設(株)", group: "建設", contact: "フン", phone: "059-0000-0011", email: "info@earth.jp", note: "", active: true, contracts: [{ id: "k14", title: "登録支援委託契約", type: "月額", amount: 66935, startDate: "2025-08-01", endDate: "", status: "有効" }] },
    { id: "c12", code: "C012", name: "ヤスダ工業株式会社", group: "製造", contact: "トゥン", phone: "059-0000-0012", email: "info@yasuda.jp", note: "", active: true, contracts: [{ id: "k15", title: "登録支援委託契約", type: "月額", amount: 139516, startDate: "2025-08-01", endDate: "", status: "有効" }] },
    { id: "c13", code: "C013", name: "小島工業株式会社", group: "製造", contact: "トゥン", phone: "059-0000-0013", email: "info@kojima.jp", note: "", active: true, contracts: [{ id: "k16", title: "登録支援委託契約", type: "月額", amount: 390323, startDate: "2025-08-01", endDate: "", status: "有効" }] },
    { id: "c14", code: "C014", name: "株式会社タケシタ", group: "製造", contact: "トゥン", phone: "059-0000-0014", email: "info@takeshita.jp", note: "", active: true, contracts: [{ id: "k17", title: "登録支援委託契約", type: "月額", amount: 252569, startDate: "2025-08-01", endDate: "", status: "有効" }] },
    { id: "c15", code: "C015", name: "株式会社TSAディラ", group: "サービス", contact: "トゥン", phone: "059-0000-0015", email: "info@tsa.jp", note: "", active: true, contracts: [{ id: "k18", title: "登録支援委託契約", type: "月額", amount: 300000, startDate: "2025-08-01", endDate: "", status: "有効" }] },
    { id: "c16", code: "C016", name: "ワタナベバー(株)", group: "製造", contact: "トゥン", phone: "059-0000-0016", email: "info@watanabe.jp", note: "", active: true, contracts: [{ id: "k19", title: "登録支援委託契約", type: "月額", amount: 175000, startDate: "2025-08-01", endDate: "", status: "有効" }] },
  ];
}

export const yen = (n: number): string => "¥" + Math.round(n).toLocaleString("ja-JP");

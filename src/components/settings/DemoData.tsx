"use client";

import { useState } from "react";
import { STORAGE_KEY as K_YOJITSU, defaultStore } from "@/lib/yojitsu";
import { STORAGE_KEY as K_REVENUE, sampleStore } from "@/lib/revenue";
import { STORAGE_KEY as K_EXPENSE, sampleExpenses } from "@/lib/expenses";
import { STORAGE_KEY as K_CUSTOMER, sampleCustomers } from "@/lib/customers";
import { STORAGE_KEY as K_OKR, sampleOkrs } from "@/lib/okr";
import { STORAGE_KEY as K_USER, sampleUsers } from "@/lib/users";

// Danh sách module + hàm sinh dữ liệu mẫu + key localStorage.
const SEEDS: { key: string; label: string; make: () => unknown }[] = [
  { key: K_YOJITSU, label: "予実管理", make: defaultStore },
  { key: K_REVENUE, label: "売上・回収", make: sampleStore },
  { key: K_EXPENSE, label: "支出管理", make: sampleExpenses },
  { key: K_CUSTOMER, label: "顧客・契約", make: sampleCustomers },
  { key: K_OKR, label: "OKR / KPI", make: sampleOkrs },
  { key: K_USER, label: "User管理", make: sampleUsers },
];

export default function DemoData() {
  const [done, setDone] = useState("");

  function loadAll() {
    if (!confirm("全モジュールにデモデータを投入します。\n（既存の入力データは上書きされます）よろしいですか？")) return;
    try {
      SEEDS.forEach((s) => window.localStorage.setItem(s.key, JSON.stringify(s.make())));
      setDone("投入しました。ページを再読み込みします…");
      setTimeout(() => window.location.reload(), 700);
    } catch { setDone("エラーが発生しました。"); }
  }
  function clearAll() {
    if (!confirm("全モジュールのデータを削除します。よろしいですか？")) return;
    try {
      SEEDS.forEach((s) => window.localStorage.removeItem(s.key));
      setDone("削除しました。ページを再読み込みします…");
      setTimeout(() => window.location.reload(), 700);
    } catch { setDone("エラーが発生しました。"); }
  }

  return (
    <div className="rounded-3xl border border-brand-200 bg-brand-50/40 p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-black text-ink">🎬 デモデータ（動作確認用）</h3>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
            1クリックで全モジュール（予実・売上回収・支出・顧客契約・OKR・User）にサンプルデータを一括投入。すぐに全画面をチェックできます。
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SEEDS.map((s) => <span key={s.key} className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-brand-700">{s.label}</span>)}
          </div>
        </div>
        <div className="flex flex-none flex-col gap-2">
          <button onClick={loadAll} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-brand-700">🎬 デモデータを一括投入</button>
          <button onClick={clearAll} className="rounded-xl border border-line bg-white px-5 py-2.5 text-sm font-bold text-muted hover:border-rose-400 hover:text-rose-500">🗑 全データを削除</button>
        </div>
      </div>
      {done && <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-600">{done}</p>}
    </div>
  );
}

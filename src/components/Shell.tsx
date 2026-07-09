"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function Shell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface">
      {/* Sidebar cố định (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden lg:block">
        <Sidebar />
      </aside>

      {/* Drawer (mobile) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 animate-[slidein_.2s_ease]">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Nội dung */}
      <div className="lg:pl-64">
        <Header onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto max-w-[1480px] px-5 py-8 sm:px-8 sm:py-10 lg:px-12">{children}</main>
      </div>
    </div>
  );
}

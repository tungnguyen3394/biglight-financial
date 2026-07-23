// 内部アイコン（SVG）— 外部ライブラリ非依存。絵文字は使わず全てラインアイコンで統一。
import type { IconName } from "@/lib/nav";

// ナビ以外でも使う汎用アイコン名（絵文字置換用）
export type UiIconName =
  | IconName
  | "folder" | "calendar" | "banknote" | "building" | "user"
  | "telescope" | "search" | "bulb" | "warning" | "film" | "trash"
  | "close" | "pencil" | "chevronDown" | "chevronRight" | "check" | "history";

const PATHS: Record<UiIconName, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.5" /></>,
  trending: <><path d="M3 17l6-6 4 4 8-8" /><path d="M21 7v5h-5" /></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="2.5" /><path d="M3 10h18" /><circle cx="17" cy="14" r="1.2" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 6.2a3 3 0 0 1 0 5.6M20.5 20a4.8 4.8 0 0 0-3.2-4.5" /></>,
  doc: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M10 13h6M10 17h6" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h11l-1.5 3L16 10H5" /></>,
  id: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="9" cy="11" r="2" /><path d="M6 16a3 3 0 0 1 6 0" /><path d="M15 10h4M15 13h4" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><rect x="7" y="12" width="3" height="5" /><rect x="12" y="8" width="3" height="9" /><rect x="17" y="5" width="3" height="12" /></>,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" /></>,
  folder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  banknote: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 12h.01M18 12h.01" /></>,
  building: <><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /><path d="M10.5 21v-3h3v3" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20.5a6.5 6.5 0 0 1 13 0" /></>,
  telescope: <><path d="M17 4l3 5-13 7-2-3.5z" /><path d="M9.5 13.5L7 20M12 12.5l3 7.5" /><circle cx="20" cy="9" r="0.5" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /></>,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 1 3.5 10.8c-.8.6-1.5 1.3-1.5 2.2h-4c0-.9-.7-1.6-1.5-2.2A6 6 0 0 1 12 3z" /></>,
  warning: <><path d="M12 3.5L22 20H2z" /><path d="M12 9.5v4.5" /><path d="M12 17.2h.01" /></>,
  film: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v5M14 11v5" /></>,
  close: <><path d="M6 6l12 12M18 6L6 18" /></>,
  pencil: <><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" /><path d="M14.5 6.5l3 3" /></>,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 1 2.5 6" /><path d="M3.5 12H7M3.5 12l-1.5-2.5" /><path d="M12 8v4l3 2" /></>,
};

export default function Icon({ name, className = "", size = 20 }: { name: UiIconName; className?: string; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

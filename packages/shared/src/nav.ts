/** The 8 primary screens (Master Plan §9), in sidebar order, with verbatim Macedonian labels. */
export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: string; // Lucide icon name (replaces prototype unicode placeholders)
}

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { key: "clients", label: "Клиенти", href: "/clients", icon: "Users" },
  { key: "charges", label: "Задолжувања", href: "/charges", icon: "FileText" },
  { key: "import", label: "Import центар", href: "/import", icon: "Download" },
  { key: "resolve", label: "Решавање", href: "/resolve", icon: "ListChecks" },
  { key: "meta", label: "META Реклами", href: "/meta", icon: "Megaphone" },
  { key: "cash", label: "Благајна", href: "/cash", icon: "Wallet" },
  { key: "recurring", label: "Тековни трошоци", href: "/recurring", icon: "CalendarClock" },
  { key: "expenses", label: "Трошоци", href: "/expenses", icon: "Receipt" },
  { key: "contractors", label: "Хонорарци", href: "/contractors", icon: "Clapperboard" },
  { key: "reports", label: "Извештаи", href: "/reports", icon: "BarChart3" },
  { key: "alerts", label: "Аларми", href: "/alerts", icon: "Bell" },
  { key: "settings", label: "Подесувања", href: "/settings", icon: "Settings" },
];

import {
  LayoutDashboard,
  Users,
  Truck,
  Cable,
  Layers,
  Boxes,
  ClipboardList,
  Receipt,
  BarChart3,
  Archive,
  History,
  Settings,
  type LucideIcon
} from 'lucide-react'

export type Route =
  | 'dashboard'
  | 'buyers'
  | 'sellers'
  | 'tarSellers'
  | 'carpets'
  | 'material'
  | 'orders'
  | 'expenses'
  | 'reports'
  | 'archive'
  | 'changes'
  | 'settings'

export interface NavItem {
  key: Route
  /** i18n key */
  i18nKey: string
  /** English fallback label (used until locale files are filled) */
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', i18nKey: 'nav.dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'buyers', i18nKey: 'nav.buyers', label: 'Buyers', icon: Users },
  { key: 'sellers', i18nKey: 'nav.sellers', label: 'Sellers', icon: Truck },
  { key: 'tarSellers', i18nKey: 'nav.tarSellers', label: 'Tar sellers', icon: Cable },
  { key: 'carpets', i18nKey: 'nav.carpets', label: 'Carpets', icon: Layers },
  { key: 'material', i18nKey: 'nav.material', label: 'Material', icon: Boxes },
  { key: 'orders', i18nKey: 'nav.orders', label: 'Orders', icon: ClipboardList },
  { key: 'expenses', i18nKey: 'nav.expenses', label: 'Expenses', icon: Receipt },
  { key: 'reports', i18nKey: 'nav.reports', label: 'Reports', icon: BarChart3 },
  { key: 'archive', i18nKey: 'nav.archive', label: 'Archive', icon: Archive },
  { key: 'changes', i18nKey: 'nav.changes', label: 'System changes', icon: History },
  { key: 'settings', i18nKey: 'nav.settings', label: 'Settings', icon: Settings }
]

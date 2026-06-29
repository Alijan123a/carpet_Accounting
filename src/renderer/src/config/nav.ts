import {
  LayoutDashboard,
  Users,
  Layers,
  Boxes,
  ArrowLeftRight,
  BarChart3,
  Archive,
  Settings,
  FlaskConical,
  type LucideIcon
} from 'lucide-react'

export type Route =
  | 'dashboard'
  | 'clients'
  | 'carpets'
  | 'material'
  | 'transactions'
  | 'reports'
  | 'archive'
  | 'settings'
  | 'dev'

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
  { key: 'clients', i18nKey: 'nav.clients', label: 'Clients', icon: Users },
  { key: 'carpets', i18nKey: 'nav.carpets', label: 'Carpets', icon: Layers },
  { key: 'material', i18nKey: 'nav.material', label: 'Material', icon: Boxes },
  { key: 'transactions', i18nKey: 'nav.transactions', label: 'Transactions', icon: ArrowLeftRight },
  { key: 'reports', i18nKey: 'nav.reports', label: 'Reports', icon: BarChart3 },
  { key: 'archive', i18nKey: 'nav.archive', label: 'Archive', icon: Archive },
  { key: 'settings', i18nKey: 'nav.settings', label: 'Settings', icon: Settings },
  // TEMPORARY (Phase 1) — accounting-core verification page; remove afterwards.
  { key: 'dev', i18nKey: 'nav.dev', label: 'Dev (Phase 1)', icon: FlaskConical }
]

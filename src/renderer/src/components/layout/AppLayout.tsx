import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import type { Route } from '@renderer/config/nav'

interface AppLayoutProps {
  current: Route
  onNavigate: (route: Route) => void
  children: ReactNode
}

export function AppLayout({ current, onNavigate, children }: AppLayoutProps): JSX.Element {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar current={current} onNavigate={onNavigate} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar current={current} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { AppSettingsProvider } from '@renderer/providers/AppSettingsProvider'
import { AppLayout } from '@renderer/components/layout/AppLayout'
import { Placeholder } from '@renderer/pages/Placeholder'
import { Settings } from '@renderer/pages/Settings'
import { ClientsModule } from '@renderer/features/clients/ClientsModule'
import { CarpetsModule } from '@renderer/features/carpets/CarpetsModule'
import { MaterialsModule } from '@renderer/features/materials/MaterialsModule'
import { ExpensesModule } from '@renderer/features/expenses/ExpensesModule'
import { Dashboard } from '@renderer/features/dashboard/Dashboard'
import { ReportsModule } from '@renderer/features/reports/ReportsModule'
import { ArchivePage } from '@renderer/features/archive/ArchivePage'
import { LockScreen } from '@renderer/features/auth/LockScreen'
import type { Route } from '@renderer/config/nav'

function MainApp(): JSX.Element {
  const [route, setRoute] = useState<Route>('dashboard')
  return (
    <AppLayout current={route} onNavigate={setRoute}>
      {route === 'dashboard' ? (
        <Dashboard />
      ) : route === 'clients' ? (
        <ClientsModule />
      ) : route === 'carpets' ? (
        <CarpetsModule />
      ) : route === 'material' ? (
        <MaterialsModule />
      ) : route === 'expenses' ? (
        <ExpensesModule />
      ) : route === 'reports' ? (
        <ReportsModule />
      ) : route === 'archive' ? (
        <ArchivePage />
      ) : route === 'settings' ? (
        <Settings />
      ) : (
        <Placeholder route={route} />
      )}
    </AppLayout>
  )
}

function App(): JSX.Element {
  const [ready, setReady] = useState(false)
  const [isSet, setIsSet] = useState(false)
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    window.api.auth
      .status()
      .then((s) => {
        setIsSet(s.isSet)
        setUnlocked(s.unlocked)
      })
      .finally(() => setReady(true))
  }, [])

  return (
    <AppSettingsProvider>
      {!ready ? (
        <div className="flex h-screen w-screen items-center justify-center bg-background text-muted-foreground">…</div>
      ) : unlocked ? (
        <MainApp />
      ) : (
        <LockScreen mode={isSet ? 'unlock' : 'setup'} onUnlocked={() => setUnlocked(true)} />
      )}
    </AppSettingsProvider>
  )
}

export default App

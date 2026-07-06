import { useEffect, useState } from 'react'
import { AppSettingsProvider } from '@renderer/providers/AppSettingsProvider'
import { AppLayout } from '@renderer/components/layout/AppLayout'
import { Placeholder } from '@renderer/pages/Placeholder'
import { Settings } from '@renderer/pages/Settings'
import { ClientsModule } from '@renderer/features/clients/ClientsModule'
import { CarpetsModule } from '@renderer/features/carpets/CarpetsModule'
import { MaterialsModule } from '@renderer/features/materials/MaterialsModule'
import { ExpensesModule } from '@renderer/features/expenses/ExpensesModule'
import { OrdersModule } from '@renderer/features/orders/OrdersModule'
import { Dashboard } from '@renderer/features/dashboard/Dashboard'
import { ReportsModule } from '@renderer/features/reports/ReportsModule'
import { ArchivePage } from '@renderer/features/archive/ArchivePage'
import { SystemChangesPage } from '@renderer/features/system/SystemChangesPage'
import { LockScreen } from '@renderer/features/auth/LockScreen'
import { ActivationScreen } from '@renderer/features/license/ActivationScreen'
import type { LicenseStatus } from '@shared/contracts'
import type { Route } from '@renderer/config/nav'

function MainApp(): JSX.Element {
  const [route, setRoute] = useState<Route>('dashboard')
  return (
    <AppLayout current={route} onNavigate={setRoute}>
      {route === 'dashboard' ? (
        <Dashboard />
      ) : route === 'buyers' ? (
        <ClientsModule kind="buyer" />
      ) : route === 'sellers' ? (
        <ClientsModule kind="seller" />
      ) : route === 'carpets' ? (
        <CarpetsModule />
      ) : route === 'material' ? (
        <MaterialsModule />
      ) : route === 'orders' ? (
        <OrdersModule />
      ) : route === 'expenses' ? (
        <ExpensesModule />
      ) : route === 'reports' ? (
        <ReportsModule />
      ) : route === 'archive' ? (
        <ArchivePage />
      ) : route === 'changes' ? (
        <SystemChangesPage />
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
  const [licensed, setLicensed] = useState(false)
  const [licenseReason, setLicenseReason] = useState<LicenseStatus['reason']>(undefined)
  const [isSet, setIsSet] = useState(false)
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    // Device-lock gate runs first: without an activated license bound to THIS
    // machine, the password flow (and the app) is never reached.
    Promise.all([window.api.license.status(), window.api.auth.status()])
      .then(([lic, auth]) => {
        setLicensed(lic.activated)
        setLicenseReason(lic.reason)
        setIsSet(auth.isSet)
        setUnlocked(auth.unlocked)
      })
      .finally(() => setReady(true))
  }, [])

  return (
    <AppSettingsProvider>
      {!ready ? (
        <div className="flex h-screen w-screen items-center justify-center bg-background text-muted-foreground">…</div>
      ) : !licensed ? (
        <ActivationScreen
          reason={licenseReason}
          onActivated={() => {
            setLicensed(true)
            setLicenseReason(undefined)
          }}
        />
      ) : unlocked ? (
        <MainApp />
      ) : (
        <LockScreen mode={isSet ? 'unlock' : 'setup'} onUnlocked={() => setUnlocked(true)} />
      )}
    </AppSettingsProvider>
  )
}

export default App

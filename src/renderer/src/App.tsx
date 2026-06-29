import { useState } from 'react'
import { AppSettingsProvider } from '@renderer/providers/AppSettingsProvider'
import { AppLayout } from '@renderer/components/layout/AppLayout'
import { Placeholder } from '@renderer/pages/Placeholder'
import { Settings } from '@renderer/pages/Settings'
import { DevTest } from '@renderer/pages/DevTest'
import { ClientsModule } from '@renderer/features/clients/ClientsModule'
import { CarpetsModule } from '@renderer/features/carpets/CarpetsModule'
import { MaterialsModule } from '@renderer/features/materials/MaterialsModule'
import { ExpensesModule } from '@renderer/features/expenses/ExpensesModule'
import { Dashboard } from '@renderer/features/dashboard/Dashboard'
import { ReportsModule } from '@renderer/features/reports/ReportsModule'
import type { Route } from '@renderer/config/nav'

function App(): JSX.Element {
  const [route, setRoute] = useState<Route>('dashboard')

  return (
    <AppSettingsProvider>
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
        ) : route === 'settings' ? (
          <Settings />
        ) : route === 'dev' ? (
          <DevTest />
        ) : (
          <Placeholder route={route} />
        )}
      </AppLayout>
    </AppSettingsProvider>
  )
}

export default App

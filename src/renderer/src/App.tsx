import { useState } from 'react'
import { AppSettingsProvider } from '@renderer/providers/AppSettingsProvider'
import { AppLayout } from '@renderer/components/layout/AppLayout'
import { Placeholder } from '@renderer/pages/Placeholder'
import { Settings } from '@renderer/pages/Settings'
import { DevTest } from '@renderer/pages/DevTest'
import { ClientsModule } from '@renderer/features/clients/ClientsModule'
import { CarpetsModule } from '@renderer/features/carpets/CarpetsModule'
import type { Route } from '@renderer/config/nav'

function App(): JSX.Element {
  const [route, setRoute] = useState<Route>('dashboard')

  return (
    <AppSettingsProvider>
      <AppLayout current={route} onNavigate={setRoute}>
        {route === 'clients' ? (
          <ClientsModule />
        ) : route === 'carpets' ? (
          <CarpetsModule />
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

import { useState } from 'react'
import { AppSettingsProvider } from '@renderer/providers/AppSettingsProvider'
import { AppLayout } from '@renderer/components/layout/AppLayout'
import { Placeholder } from '@renderer/pages/Placeholder'
import { Settings } from '@renderer/pages/Settings'
import type { Route } from '@renderer/config/nav'

function App(): JSX.Element {
  const [route, setRoute] = useState<Route>('dashboard')

  return (
    <AppSettingsProvider>
      <AppLayout current={route} onNavigate={setRoute}>
        {route === 'settings' ? <Settings /> : <Placeholder route={route} />}
      </AppLayout>
    </AppSettingsProvider>
  )
}

export default App

import { useState } from 'react'
import { ClientsList } from './ClientsList'
import { ClientDetail } from './ClientDetail'

/**
 * Clients module: shows the list, or a single client's statement when one is
 * selected. (Top-level routing is sidebar-based; client detail is an in-module
 * sub-view.)
 */
export function ClientsModule(): JSX.Element {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  // Bump to force the list to remount/refresh when returning from detail.
  const [listKey, setListKey] = useState(0)

  if (selectedId !== null) {
    return (
      <ClientDetail
        clientId={selectedId}
        onBack={() => {
          setSelectedId(null)
          setListKey((k) => k + 1)
        }}
        onChanged={() => setListKey((k) => k + 1)}
      />
    )
  }
  return <ClientsList key={listKey} onSelect={setSelectedId} />
}

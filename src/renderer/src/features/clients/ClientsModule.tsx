import { useState } from 'react'
import { ClientsList } from './ClientsList'
import { ClientDetail } from './ClientDetail'

/**
 * Clients module: shows the list, or a single client's statement when one is
 * selected. (Top-level routing is sidebar-based; client detail is an in-module
 * sub-view.)
 *
 * `kind` scopes the list to buyers (we sell to) or sellers (we buy from). The
 * underlying account is unified — kind only filters the list and pre-selects the
 * role for newly created clients.
 */
export function ClientsModule({ kind }: { kind: 'buyer' | 'seller' }): JSX.Element {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  // Bump to force the list to remount/refresh when returning from detail.
  const [listKey, setListKey] = useState(0)

  if (selectedId !== null) {
    return (
      <ClientDetail
        clientId={selectedId}
        kind={kind}
        onBack={() => {
          setSelectedId(null)
          setListKey((k) => k + 1)
        }}
        onChanged={() => setListKey((k) => k + 1)}
      />
    )
  }
  // Remount when kind changes so filters/state reset between Buyers and Sellers.
  return <ClientsList key={`${kind}-${listKey}`} kind={kind} onSelect={setSelectedId} />
}

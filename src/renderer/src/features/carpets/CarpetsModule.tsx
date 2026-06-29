import { useState } from 'react'
import { CarpetsList } from './CarpetsList'
import { CarpetDetail } from './CarpetDetail'

/** Carpets module: warehouse list, or a single carpet's detail when selected. */
export function CarpetsModule(): JSX.Element {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [listKey, setListKey] = useState(0)

  if (selectedId !== null) {
    return (
      <CarpetDetail
        carpetId={selectedId}
        onBack={() => {
          setSelectedId(null)
          setListKey((k) => k + 1)
        }}
        onChanged={() => setListKey((k) => k + 1)}
      />
    )
  }
  return <CarpetsList key={listKey} onSelect={setSelectedId} />
}

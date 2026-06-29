import { useState } from 'react'
import { MaterialsList } from './MaterialsList'
import { MaterialDetail } from './MaterialDetail'

/** Material (tar) module: lot list, or a single lot's lines when selected. */
export function MaterialsModule(): JSX.Element {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [listKey, setListKey] = useState(0)

  if (selectedId !== null) {
    return (
      <MaterialDetail
        materialId={selectedId}
        onBack={() => {
          setSelectedId(null)
          setListKey((k) => k + 1)
        }}
        onChanged={() => setListKey((k) => k + 1)}
      />
    )
  }
  return <MaterialsList key={listKey} onSelect={setSelectedId} />
}

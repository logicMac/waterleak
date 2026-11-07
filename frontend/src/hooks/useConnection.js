import { useEffect, useState } from 'react'
import { onConnectionChange } from '../api/client'

export function useConnection() {
  const [lost, setLost] = useState(false)
  useEffect(() => onConnectionChange(setLost), [])
  return lost
}

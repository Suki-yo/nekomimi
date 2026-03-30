import type { CatalogId } from '@/data/catalog'

export type Selection =
  | { type: 'home' }
  | { type: 'game'; gameId: string }
  | { type: 'mods'; gameId: string }
  | { type: 'config'; gameId: string }
  | { type: 'catalog'; catalogId: CatalogId }
  | { type: 'settings' }
  | { type: 'add-game' }

export interface ActivityEvent {
  id: number
  message: string
  timestamp: string
  selection?: Selection
}

export interface SectionState {
  library: boolean
  catalog: boolean
  system: boolean
}

export const INITIAL_SELECTION: Selection = { type: 'home' }
export const INITIAL_SECTIONS: SectionState = { library: true, catalog: true, system: true }

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { GRAPH_PERSIST_KEY } from '../persistedKeys';
import { createGraphActions } from './graph.actions';
import { GRAPH_NODE_CLASSES, graphInitialState, type GraphNodeClass, GraphStore } from './graph.types';

// Store creation
export const useGraphStore = create<GraphStore>()(
  devtools(
    persist(
      (set) => ({
        ...graphInitialState,
        ...createGraphActions(set),
      }),
      {
        name: GRAPH_PERSIST_KEY,
        // v1 adds tagHubsOn/edgeChipsOn; migration is purely additive (the
        // merge below lets missing keys fall back to initial state), the bump
        // documents the shape change and guards future renames
        version: 1,
        migrate: (persisted) => persisted as GraphStore,
        // Explicit toggles survive reloads; declutter deliberately does not,
        // because the dense-graph heuristic flips it automatically and an
        // automatic writer must not overwrite a stored user preference.
        // Transient state (time cap, selection) stays in the hooks.
        partialize: (state) => ({
          hiddenClasses: state.hiddenClasses,
          communitiesOn: state.communitiesOn,
          tagHubsOn: state.tagHubsOn,
          edgeChipsOn: state.edgeChipsOn,
        }),
        // Drop class names that no longer exist after a rename/removal so
        // nothing stays hidden with no legend row to unhide it
        merge: (persisted, current) => {
          const stored = (persisted ?? {}) as Partial<GraphStore>;
          return {
            ...current,
            ...stored,
            hiddenClasses: (stored.hiddenClasses ?? []).filter((cls): cls is GraphNodeClass =>
              (GRAPH_NODE_CLASSES as readonly string[]).includes(cls),
            ),
          };
        },
      },
    ),
    {
      name: 'graph-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);

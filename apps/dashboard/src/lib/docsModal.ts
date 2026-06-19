import { create } from "zustand";

/**
 * Global state for the in-app documentation modal.
 *
 * Docs live in a modal (not a route) to keep them a click away from anywhere
 * in the dashboard. `openDocs()` with no argument shows the index; with a slug
 * it jumps straight to that document. This keeps `InfoTooltip`'s "Learn more"
 * free of router coupling.
 */
interface DocsModalState {
  /** Whether the modal is visible. */
  open: boolean;
  /** Document slug to display; `null` shows the index/hub. */
  slug: string | null;
  openDocs: (slug?: string | null) => void;
  closeDocs: () => void;
}

export const useDocsModal = create<DocsModalState>((set) => ({
  open: false,
  slug: null,
  openDocs: (slug = null) => set({ open: true, slug }),
  closeDocs: () => set({ open: false })
}));

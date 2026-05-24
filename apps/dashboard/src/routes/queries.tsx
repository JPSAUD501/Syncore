import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/queries")({
  validateSearch: (search): { queryId?: string } => {
    const next: { queryId?: string } = {};
    if (typeof search.queryId === "string") {
      next.queryId = search.queryId;
    }
    return next;
  }
});

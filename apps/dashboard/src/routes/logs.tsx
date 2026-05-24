import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/logs")({
  validateSearch: (search): { executionId?: string } => {
    const next: { executionId?: string } = {};
    if (typeof search.executionId === "string") {
      next.executionId = search.executionId;
    }
    return next;
  }
});

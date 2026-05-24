import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/functions")({
  validateSearch: (search): { fn?: string; args?: string } => {
    const next: { fn?: string; args?: string } = {};
    if (typeof search.fn === "string") {
      next.fn = search.fn;
    }
    if (typeof search.args === "string") {
      next.args = search.args;
    }
    return next;
  }
});

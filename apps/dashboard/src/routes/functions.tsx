import { createFileRoute } from "@tanstack/react-router";
import { readDashboardAuthSearch } from "@/lib/routeSearch";

export const Route = createFileRoute("/functions")({
  validateSearch: (search): {
    fn?: string;
    args?: string;
    token?: string;
    hubToken?: string;
  } => {
    const next: {
      fn?: string;
      args?: string;
      token?: string;
      hubToken?: string;
    } = {};
    if (typeof search.fn === "string") {
      next.fn = search.fn;
    }
    if (typeof search.args === "string") {
      next.args = search.args;
    }
    return { ...readDashboardAuthSearch(search), ...next };
  }
});

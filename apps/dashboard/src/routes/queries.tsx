import { createFileRoute } from "@tanstack/react-router";
import { readDashboardAuthSearch } from "@/lib/routeSearch";

export const Route = createFileRoute("/queries")({
  validateSearch: (search): {
    queryId?: string;
    token?: string;
    hubToken?: string;
  } => {
    const next: {
      queryId?: string;
      token?: string;
      hubToken?: string;
    } = {};
    if (typeof search.queryId === "string") {
      next.queryId = search.queryId;
    }
    return { ...readDashboardAuthSearch(search), ...next };
  }
});

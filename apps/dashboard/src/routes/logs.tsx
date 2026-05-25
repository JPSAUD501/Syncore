import { createFileRoute } from "@tanstack/react-router";
import { readDashboardAuthSearch } from "@/lib/routeSearch";

export const Route = createFileRoute("/logs")({
  validateSearch: (search): {
    executionId?: string;
    token?: string;
    hubToken?: string;
  } => {
    const next: {
      executionId?: string;
      token?: string;
      hubToken?: string;
    } = {};
    if (typeof search.executionId === "string") {
      next.executionId = search.executionId;
    }
    return { ...readDashboardAuthSearch(search), ...next };
  }
});

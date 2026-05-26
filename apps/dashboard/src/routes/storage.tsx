import { createFileRoute } from "@tanstack/react-router";
import { readDashboardAuthSearch } from "@/lib/routeSearch";

export const Route = createFileRoute("/storage")({
  validateSearch: readDashboardAuthSearch
});

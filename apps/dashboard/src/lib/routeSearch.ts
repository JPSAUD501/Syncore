export interface DashboardAuthSearch {
  token?: string;
  hubToken?: string;
}

export function readDashboardAuthSearch(
  search: Record<string, unknown>
): DashboardAuthSearch {
  const next: DashboardAuthSearch = {};
  if (typeof search.token === "string") {
    next.token = search.token;
  }
  if (typeof search.hubToken === "string") {
    next.hubToken = search.hubToken;
  }
  return next;
}

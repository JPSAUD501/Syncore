import sqlWasmAsset from "sql.js/dist/sql-wasm.wasm";

export function resolveDefaultExpoWebSqlJsWasmUrl(): string | undefined {
  return normalizeAssetUrl(sqlWasmAsset);
}

function normalizeAssetUrl(asset: unknown): string | undefined {
  if (typeof asset === "string") {
    return asset;
  }

  if (!asset || typeof asset !== "object") {
    return undefined;
  }

  const record = asset as {
    default?: unknown;
    uri?: unknown;
  };

  if (typeof record.uri === "string") {
    return record.uri;
  }

  return normalizeAssetUrl(record.default);
}

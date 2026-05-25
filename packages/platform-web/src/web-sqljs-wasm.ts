export function resolveDefaultWebSqlJsWasmUrl(): string {
  return new URL("sql.js/dist/sql-wasm.wasm", import.meta.url).toString();
}

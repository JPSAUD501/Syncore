# SQL Console

The SQL Console lets you run read-only SQL statements directly against the
connected runtime's database. It only appears in the sidebar when the selected
target announces `sqlAvailable` (and the active runtime supports read SQL).

## Rows affected

**Rows affected** is the number of rows changed by the last executed statement.
For read statements (`SELECT`) this is typically the number of rows returned;
for write statements it reflects the rows touched — though the console is
read-only by default, so writes are generally rejected.

## Execution time

**Execution time** is how long the statement took to execute on the runtime.
It's a good first signal for query performance: a statement that's fast in the
console but slow through your app layer usually points to how the query is being
issued (e.g. inside a loop or without an index) rather than the query itself.

## Capabilities

Not every runtime exposes SQL. The **SQL** badge on a runtime indicates it
supports read SQL commands; without it, the console is unavailable. If you don't
see the SQL Console route, switch to a target/runtime that advertises the SQL
capability.

## Tips

- Prefer `EXPLAIN` to understand a slow query plan before optimizing.
- Read-only access means you can explore data safely without risk of mutation.
- Combine with the Data browser to cross-check document-level results.

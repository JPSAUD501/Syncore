# Functions

Syncore apps are built from typed functions. The dashboard lists every function
known to a runtime and lets you inspect its type, dependencies and live usage.

## Function types

| Type | What it does | Reactive? | Transactional? |
| --- | --- | --- | --- |
| **Query** | Reads data and returns it. | Yes — re-runs when inputs change. | Read-only. |
| **Mutation** | Writes data inside a transaction. | No (returns a result). | Yes — atomic. |
| **Action** | Performs side effects (network, filesystem). | No. | No — runs outside a transaction. |
| **Cron** | A function scheduled to run on a recurring cadence. | No. | Depends on the function. |

- **Query** functions are the backbone of reactivity: subscribe once and the
  dashboard/runtime keeps the result fresh as data changes.
- **Mutation** functions are the only way to change documents transactionally.
- **Action** functions escape the transactional boundary — useful for calling
  external APIs, but they can't directly read/write documents the way queries
  and mutations do.
- **Cron** functions are surfaced here and also drive the Scheduler page.

## Registration state

A function can be in one of two states:

- **`registered`** — discovered from the schema/registration as a known,
  first-class function. This is the normal case for functions you authored.
- **`observed only`** — the runtime saw the function being invoked at runtime,
  but it isn't formally registered in the schema. This usually hints at a
  function reference built dynamically or a registration that's missing.

## Function detail panel

Selecting a function opens an inspector showing:

- **Function reference** — the typed, serializable handle used to invoke the
  function. It's what your app code holds when it calls a query/mutation.
- **Consumers** — functions and components that call this function.
- **Dependencies** — other functions this function calls.
- **Active queries** — live query subscriptions currently referencing this
  function. Useful to see who is keeping a query alive right now.

## Function reference

A **function reference** is how Syncore points at a function without invoking
it. It carries the function's identity and type, so the runtime knows how to
schedule and validate calls. References are what get passed around as arguments
and stored in scheduler/cron definitions.

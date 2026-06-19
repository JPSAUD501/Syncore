# Traces

The trace detail panel renders a **trace** — a tree of timed work units emitted
during a function execution. Traces are how the dashboard shows you *where* time
is going inside a query, mutation or action.

## Span

A **span** is a single unit of work within a trace. A span might represent a
database read, a function call, a storage operation, or any other timed step.
Spans are nested: a parent span contains the spans of the work it triggered.

## Duration

A span's **Duration** is its wall-clock time **including its children**. When a
top-level span is slow, drill into its children to find the contributing span —
the sum of child durations explains most of the parent's time.

## Children

**Children** are the nested spans spawned within a span. Expanding a span
reveals its children, letting you walk the call tree from the high-level
operation down to the individual reads/writes that make it up.

## Origin

The **Origin** is the runtime or document origin a trace span originated from.
In multi-runtime setups, origin helps you attribute a span to the specific
runtime (browser worker, node, project target, …) that produced it.

## How to read a trace

1. Start at the root span — that's the overall operation.
2. If its duration is high, expand it and look for the child that dominates.
3. Repeat until you reach a leaf span you can act on (an un-indexed read, a
   slow external call, a redundant re-execution).
4. Use **Origin** to confirm *which* runtime incurred the cost.

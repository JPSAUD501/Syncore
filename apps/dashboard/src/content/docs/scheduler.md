# Scheduler

The Scheduler page lists **cron jobs** — functions that run on a recurring
cadence without a client triggering them.

## Cron & schedules

- **Cron** / **Cron job** — a scheduled function. It is the same `cron`
  function type you see on the Functions page.
- **Schedule** — the cadence a job runs on. A schedule is either a fixed
  **interval** (e.g. every 5 minutes) or a **cron expression**.

### Cron expressions

A **cron expression** is a 5-field string describing when a job runs:

```
#  minute  hour  day-of-month  month  day-of-week
   */5     *     *             *      *
```

The example above (`*/5 * * * *`) means "every 5 minutes". Common patterns:

| Expression | Meaning |
| --- | --- |
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | At the top of every hour |
| `0 0 * * *` | At midnight every day |
| `0 9 * * 1` | At 09:00 every Monday |

## Status

Each job has a **status**:

- **`active`** — the job is scheduled and will run at its next due time.
- **`paused`** — the job is temporarily suspended and won't run.
- **`due`** — the job is past its next run time and should execute imminently.
- **`error`** — the job's last execution failed.

## Next run & Last run

- **Next run** — when the job is scheduled to run next, derived from its
  schedule.
- **Last run** — when the job last executed.

Watching these two columns is the quickest way to confirm a cron job is actually
firing at the cadence you expect.

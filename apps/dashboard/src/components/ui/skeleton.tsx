import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Skeleton placeholder with a subtle accent-tinted shimmer.
 *
 * Use for loading states instead of reusing {@link EmptyState} so that
 * "loading" and "empty" remain visually distinct. Driven by the
 * `.skeleton-shimmer` utility in `app.css`, which honors
 * `prefers-reduced-motion`.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "skeleton-shimmer rounded-md bg-bg-elevated/70",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };

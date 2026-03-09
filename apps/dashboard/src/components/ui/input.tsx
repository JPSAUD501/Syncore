import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-border bg-bg-surface/50 px-3 py-1 text-sm text-text-primary shadow-none transition-colors outline-none placeholder:text-text-tertiary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-border-active focus-visible:ring-2 focus-visible:ring-accent/20",
        "hover:border-border-hover",
        className
      )}
      {...props}
    />
  );
}

export { Input };

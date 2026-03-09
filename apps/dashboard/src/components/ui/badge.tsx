import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-accent/15 text-accent border-accent/20",
        secondary: "bg-bg-surface text-text-secondary border-border",
        destructive: "bg-error/15 text-error border-error/20",
        outline:
          "border-border text-text-secondary [a&]:hover:bg-bg-surface [a&]:hover:text-text-primary",
        ghost:
          "text-text-secondary [a&]:hover:bg-bg-surface [a&]:hover:text-text-primary",
        success: "bg-success/15 text-success border-success/20",
        info: "bg-info/15 text-info border-info/20",
        warning: "bg-warning/15 text-warning border-warning/20"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };

import * as React from "react"
import { HoverCard as HoverCardPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function HoverCard({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return (
    <HoverCardPrimitive.Root
      data-slot="hover-card"
      openDelay={200}
      closeDelay={150}
      {...props}
    />
  )
}

function HoverCardTrigger({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return (
    <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
  )
}

function HoverCardContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal data-slot="hover-card-portal">
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-72 origin-(--radix-hover-card-content-transform-origin) rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-soft outline-hidden",
          "data-[side=bottom]:animate-in data-[side=bottom]:slide-in-from-top-2 data-[side=bottom]:fade-in-0 data-[side=bottom]:zoom-in-95",
          "data-[side=top]:animate-in data-[side=top]:slide-in-from-bottom-2 data-[side=top]:fade-in-0 data-[side=top]:zoom-in-95",
          "data-[side=left]:animate-in data-[side=left]:slide-in-from-right-2 data-[side=left]:fade-in-0 data-[side=left]:zoom-in-95",
          "data-[side=right]:animate-in data-[side=right]:slide-in-from-left-2 data-[side=right]:fade-in-0 data-[side=right]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }

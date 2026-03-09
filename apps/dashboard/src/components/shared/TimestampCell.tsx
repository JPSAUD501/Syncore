import { cn, formatTime, formatRelativeTime } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";

interface TimestampCellProps {
  timestamp: number;
  format?: "time" | "relative" | "both";
  className?: string;
}

export function TimestampCell({
  timestamp,
  format = "both",
  className
}: TimestampCellProps) {
  const absolute = formatTime(timestamp);
  const relative = formatRelativeTime(timestamp);
  const full = new Date(timestamp).toLocaleString();

  if (format === "time") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "text-[11px] tabular-nums font-mono text-text-tertiary cursor-default",
              className
            )}
          >
            {absolute}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[11px]">
          {full}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (format === "relative") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "text-[11px] tabular-nums text-text-tertiary cursor-default",
              className
            )}
          >
            {relative}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[11px]">
          {full}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "text-[11px] tabular-nums font-mono text-text-tertiary cursor-default",
            className
          )}
        >
          {absolute}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px]">
        <div>{full}</div>
        <div className="text-text-tertiary">{relative}</div>
      </TooltipContent>
    </Tooltip>
  );
}

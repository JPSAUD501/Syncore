import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Search, Database, Zap, Clock } from "lucide-react";

export type FunctionType = "query" | "mutation" | "action" | "cron";

const FUNCTION_CONFIG: Record<
  FunctionType,
  {
    label: string;
    colorClass: string;
    bgClass: string;
    borderClass: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }
> = {
  query: {
    label: "Query",
    colorClass: "text-fn-query",
    bgClass: "bg-fn-query/15",
    borderClass: "border-fn-query/20",
    icon: Search
  },
  mutation: {
    label: "Mutation",
    colorClass: "text-fn-mutation",
    bgClass: "bg-fn-mutation/15",
    borderClass: "border-fn-mutation/20",
    icon: Database
  },
  action: {
    label: "Action",
    colorClass: "text-fn-action",
    bgClass: "bg-fn-action/15",
    borderClass: "border-fn-action/20",
    icon: Zap
  },
  cron: {
    label: "Cron",
    colorClass: "text-fn-cron",
    bgClass: "bg-fn-cron/15",
    borderClass: "border-fn-cron/20",
    icon: Clock
  }
};

interface FunctionBadgeProps {
  type: FunctionType;
  showIcon?: boolean;
  className?: string;
}

export function FunctionBadge({
  type,
  showIcon = true,
  className
}: FunctionBadgeProps) {
  const config = FUNCTION_CONFIG[type];
  const Icon = config.icon;

  return (
    <Badge
      className={cn(
        config.bgClass,
        config.colorClass,
        config.borderClass,
        "border text-[10px] font-semibold uppercase tracking-wide",
        className
      )}
    >
      {showIcon && <Icon size={10} />}
      {config.label}
    </Badge>
  );
}

/**
 * Infer function type from an event type string.
 */
export function inferFunctionType(eventType: string): FunctionType | null {
  if (eventType.startsWith("query.")) return "query";
  if (eventType.startsWith("mutation.")) return "mutation";
  if (eventType.startsWith("action.")) return "action";
  if (eventType.startsWith("scheduler.")) return "cron";
  return null;
}

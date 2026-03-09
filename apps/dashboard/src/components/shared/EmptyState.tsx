import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-6 text-center",
        className
      )}
    >
      <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-bg-surface border border-border mb-4">
        <Icon size={20} className="text-text-tertiary" />
      </div>
      <h3 className="text-[13px] font-bold text-text-primary mb-1">{title}</h3>
      {description && (
        <p className="text-[12px] text-text-tertiary max-w-xs leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

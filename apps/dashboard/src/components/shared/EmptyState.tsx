import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { fadeUp, staggerContainer } from "@/lib/motion";
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
    <motion.div
      variants={staggerContainer(0.05)}
      initial="hidden"
      animate="visible"
      className={cn(
        "flex flex-col items-center justify-center py-16 px-6 text-center",
        className
      )}
    >
      <motion.div
        variants={fadeUp}
        className="flex items-center justify-center w-12 h-12 rounded-xl bg-bg-surface border border-border mb-4"
      >
        <Icon size={20} className="text-text-tertiary" />
      </motion.div>
      <motion.h3
        variants={fadeUp}
        className="text-[13px] font-bold text-text-primary mb-1"
      >
        {title}
      </motion.h3>
      {description && (
        <motion.p
          variants={fadeUp}
          className="text-[12px] text-text-tertiary max-w-xs leading-relaxed"
        >
          {description}
        </motion.p>
      )}
      {action && (
        <motion.div variants={fadeUp} className="mt-4">
          {action}
        </motion.div>
      )}
    </motion.div>
  );
}

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, AlertCircle, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { easings, durations } from "@/lib/motion";

type ToastTone = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  pushToast: (toast: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 2800;

const TONE_STYLES: Record<ToastTone, { border: string; iconClass: string }> = {
  success: { border: "border-success/25", iconClass: "text-success" },
  error: { border: "border-error/25", iconClass: "text-error" },
  info: { border: "border-accent/25", iconClass: "text-accent" },
  warning: { border: "border-warning/25", iconClass: "text-warning" }
};

function ToastIcon({ tone }: { tone: ToastTone }) {
  if (tone === "error") {
    return <AlertCircle size={16} className={TONE_STYLES[tone].iconClass} />;
  }
  if (tone === "warning") {
    return <AlertTriangle size={16} className={TONE_STYLES[tone].iconClass} />;
  }
  return (
    <CheckCircle2
      size={16}
      className={TONE_STYLES[tone].iconClass}
    />
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { ...toast, id }]);
      const timer = window.setTimeout(
        () => removeToast(id),
        AUTO_DISMISS_MS
      );
      timersRef.current.set(id, timer);
    },
    [removeToast]
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const tone = TONE_STYLES[toast.tone];
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, x: 24, scale: 0.98 }}
                animate={{
                  opacity: 1,
                  x: 0,
                  scale: 1,
                  transition: {
                    duration: durations.base,
                    ease: easings.outSoft
                  }
                }}
                exit={{
                  opacity: 0,
                  x: 16,
                  scale: 0.98,
                  transition: {
                    duration: durations.fast,
                    ease: easings.outSoft
                  }
                }}
                className={cn(
                  "pointer-events-auto relative overflow-hidden rounded-lg border bg-bg-surface/95 px-3 py-3 shadow-lg shadow-black/20 backdrop-blur",
                  tone.border
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">
                    <ToastIcon tone={toast.tone} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-text-primary">
                      {toast.title}
                    </p>
                    {toast.description && (
                      <p className="mt-0.5 text-[11px] text-text-secondary">
                        {toast.description}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => removeToast(toast.id)}
                  >
                    <X size={11} />
                  </Button>
                </div>
                {/* Auto-dismiss progress bar */}
                <motion.div
                  aria-hidden
                  className={cn(
                    "absolute bottom-0 left-0 h-[2px]",
                    toast.tone === "success" && "bg-success/60",
                    toast.tone === "error" && "bg-error/60",
                    toast.tone === "info" && "bg-accent/60",
                    toast.tone === "warning" && "bg-warning/60"
                  )}
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{
                    duration: AUTO_DISMISS_MS / 1000,
                    ease: "linear"
                  }}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState
} from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ToastTone = "success" | "error" | "info";

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
      const timer = window.setTimeout(() => removeToast(id), 2800);
      timersRef.current.set(id, timer);
    },
    [removeToast]
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto animate-fade-in rounded-lg border bg-bg-surface/95 px-3 py-3 shadow-lg shadow-black/20 backdrop-blur",
              toast.tone === "success" && "border-success/25",
              toast.tone === "error" && "border-error/25",
              toast.tone === "info" && "border-accent/25"
            )}
          >
            <div className="flex items-start gap-3">
              <div className="pt-0.5">
                {toast.tone === "error" ? (
                  <AlertCircle size={16} className="text-error" />
                ) : (
                  <CheckCircle2
                    size={16}
                    className={
                      toast.tone === "success" ? "text-success" : "text-accent"
                    }
                  />
                )}
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
          </div>
        ))}
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

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDevtoolsStore } from "@/lib/store";

export function DashboardTokenDialog() {
  const authRequired = useDevtoolsStore((state) => state.authRequired);
  const authError = useDevtoolsStore((state) => state.authError);
  const setHubToken = useDevtoolsStore((state) => state.setHubToken);
  const [token, setToken] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (authRequired) {
      setToken("");
      setLocalError(null);
    }
  }, [authRequired]);

  return (
    <Dialog open={authRequired}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <KeyRound size={16} />
            Connect Dashboard
          </DialogTitle>
          <DialogDescription>
            Enter the token printed by <code className="font-mono">syncorejs dev</code>{" "}
            to connect this dashboard to the local devtools hub.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const sanitized = token.trim();
            if (!sanitized) {
              setLocalError("Enter the devtools token.");
              return;
            }
            setLocalError(null);
            setHubToken(sanitized);
          }}
        >
          <div className="space-y-2">
            <label
              htmlFor="dashboard-token"
              className="text-xs font-medium text-text-secondary"
            >
              Devtools token
            </label>
            <Input
              id="dashboard-token"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste token"
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                if (localError) {
                  setLocalError(null);
                }
              }}
              className="font-mono"
            />
            {(localError || authError) && (
              <p className="text-xs text-error">{localError ?? authError}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="submit">Connect</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

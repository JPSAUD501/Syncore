import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initDevtoolsConnection, destroyDevtoolsConnection } from "@/lib/store";

function RootLayout() {
  useEffect(() => {
    initDevtoolsConnection();
    return () => destroyDevtoolsConnection();
  }, []);

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

export const Route = createRootRoute({
  component: RootLayout
});

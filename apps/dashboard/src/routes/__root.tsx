import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initDevtoolsConnection, destroyDevtoolsConnection } from "@/lib/store";

function RootLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    initDevtoolsConnection();
    return () => destroyDevtoolsConnection();
  }, []);

  // Track viewport size
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
      if (e.matches) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden">
        {/* Mobile overlay backdrop */}
        {isMobile && sidebarOpen && (
          <div className="sidebar-overlay" onClick={closeSidebar} />
        )}

        {/* Sidebar — fixed on desktop, overlay on mobile */}
        <div
          className={
            isMobile
              ? `fixed inset-y-0 left-0 z-50 transition-transform duration-200 ${
                  sidebarOpen ? "translate-x-0" : "-translate-x-full"
                }`
              : ""
          }
        >
          <Sidebar
            collapsed={!sidebarOpen && !isMobile}
            onClose={isMobile ? closeSidebar : undefined}
            onNavClick={closeSidebar}
          />
        </div>

        <div className="flex flex-col flex-1 min-w-0">
          <Header onToggleSidebar={isMobile ? toggleSidebar : undefined} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
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

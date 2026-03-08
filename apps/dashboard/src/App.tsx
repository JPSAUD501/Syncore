import { useEffect, useMemo, useState } from "react";
import type {
  SyncoreDevtoolsEvent,
  SyncoreDevtoolsMessage
} from "@syncore/devtools-protocol";
import { Panel, StatusCard } from "./components/StatusCard.js";
import { PlaceholderPanel } from "./routes/PlaceholderPanel.js";

const SECTIONS = [
  "Queries",
  "Transactions",
  "Scheduler",
  "Storage",
  "Actions",
  "Logs"
] as const;

type Section = (typeof SECTIONS)[number];

export function App() {
  const [section, setSection] = useState<Section>("Queries");
  const [events, setEvents] = useState<SyncoreDevtoolsEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [runtimeId, setRuntimeId] = useState<string>("waiting");

  useEffect(() => {
    const websocket = new WebSocket("ws://127.0.0.1:4311");

    websocket.onopen = () => setConnected(true);
    websocket.onclose = () => setConnected(false);
    websocket.onerror = () => setConnected(false);
    websocket.onmessage = (message) => {
      if (typeof message.data !== "string") {
        return;
      }
      const payload = JSON.parse(message.data) as SyncoreDevtoolsMessage;
      if (payload.type === "hello") {
        setRuntimeId(payload.runtimeId);
      }
      if (payload.type === "event") {
        setEvents((current) => [payload.event, ...current].slice(0, 24));
      }
      if (payload.type === "snapshot") {
        setRuntimeId(payload.snapshot.runtimeId);
      }
    };

    return () => websocket.close();
  }, []);

  const liveFeed = useMemo(
    () =>
      events.map((event, index) => (
        <li key={`${event.type}-${event.timestamp}-${index}`} className="feed__item">
          <span className="feed__type">{event.type}</span>
          <span className="feed__time">
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
        </li>
      )),
    [events]
  );

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-shell__rail">
        <div className="brand">
          <div className="brand__mark">S</div>
          <div>
            <div className="brand__name">Syncore</div>
            <div className="brand__tag">Local Dev Dashboard</div>
          </div>
        </div>
        <nav className="nav">
          {SECTIONS.map((item) => (
            <button
              key={item}
              className={item === section ? "nav__item nav__item--active" : "nav__item"}
              onClick={() => setSection(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>
      <main className="dashboard-shell__main">
        <header className="hero">
          <div>
            <div className="hero__eyebrow">Hello World</div>
            <h1>Runtime telemetry is wired and ready for richer tooling.</h1>
            <p>
              This shell is intentionally small. The protocol, hub connection and live
              feed are in place so the next iteration can focus on actual UX.
            </p>
          </div>
          <div className="hero__stats">
            <StatusCard
              title="Hub"
              value={connected ? "Connected" : "Offline"}
              detail="ws://127.0.0.1:4311"
              tone={connected ? "good" : "warn"}
            />
            <StatusCard
              title="Runtime"
              value={runtimeId}
              detail="Active runtime identifier"
            />
            <StatusCard
              title="Events"
              value={String(events.length)}
              detail="Recent events in memory"
            />
          </div>
        </header>

        <section className="content-grid">
          <Panel title="Live Feed">
            <ul className="feed">
              {liveFeed.length > 0 ? liveFeed : <li className="feed__empty">Waiting for events.</li>}
            </ul>
          </Panel>
          <Panel title={section}>
            <PlaceholderPanel
              title={`${section} workspace`}
              description={`The ${section.toLowerCase()} view is intentionally a placeholder for the next design pass. The protocol and routing surface are already prepared.`}
            />
          </Panel>
        </section>
      </main>
    </div>
  );
}

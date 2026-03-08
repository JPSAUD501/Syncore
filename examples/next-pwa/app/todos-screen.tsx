"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@syncore/react";
import { api } from "../syncore/_generated/api";

export function TodosScreen() {
  const [draft, setDraft] = useState("");
  const todos = (useQuery(api.todos.list) ?? []).slice();
  const createTodo = useMutation(api.todos.create);
  const toggleTodo = useMutation(api.todos.toggle);

  const handleCreate = async () => {
    if (!draft.trim()) {
      return;
    }
    await createTodo({ title: draft.trim() });
    setDraft("");
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 32,
        background:
          "radial-gradient(circle at top left, rgba(31, 155, 123, 0.18), transparent 30%), #0c1117",
        color: "#f6f3eb",
        fontFamily: "ui-sans-serif, sans-serif"
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <p style={{ textTransform: "uppercase", letterSpacing: "0.14em", opacity: 0.7 }}>
          Next static + worker runtime
        </p>
        <h1 style={{ fontSize: "3rem", lineHeight: 1, margin: "12px 0 10px" }}>
          Syncore runs fully local in the browser.
        </h1>
        <p style={{ maxWidth: 520, opacity: 0.78 }}>
          Queries stay reactive because the runtime lives in a dedicated worker and pushes
          invalidations back to React hooks.
        </p>

        <section
          style={{
            marginTop: 28,
            padding: 24,
            borderRadius: 24,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)"
          }}
        >
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write a local task"
              style={{
                flex: "1 1 280px",
                padding: "14px 16px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(12,17,23,0.65)",
                color: "inherit"
              }}
            />
            <button
              onClick={() => void handleCreate()}
              type="button"
              style={{
                padding: "14px 18px",
                borderRadius: 14,
                border: 0,
                background: "#e7b85c",
                color: "#101418",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Add offline
            </button>
          </div>

          <ul style={{ listStyle: "none", padding: 0, marginTop: 24, display: "grid", gap: 12 }}>
            {todos.map((todo) => (
              <li
                key={todo._id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "14px 16px",
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.04)"
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{todo.title}</div>
                  <div style={{ opacity: 0.64, fontSize: 14 }}>
                    {todo.complete ? "completed locally" : "pending locally"}
                  </div>
                </div>
                <button
                  onClick={() =>
                    void toggleTodo({ id: todo._id, complete: !todo.complete })
                  }
                  type="button"
                  style={{
                    padding: "10px 14px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "transparent",
                    color: "inherit",
                    cursor: "pointer"
                  }}
                >
                  {todo.complete ? "Reopen" : "Complete"}
                </button>
              </li>
            ))}
            {todos.length === 0 ? (
              <li
                style={{
                  padding: "18px 16px",
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.04)",
                  opacity: 0.72
                }}
              >
                No local todos yet.
              </li>
            ) : null}
          </ul>
        </section>
      </div>
    </main>
  );
}

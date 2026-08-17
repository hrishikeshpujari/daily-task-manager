import { signal } from "@preact/signals";

// Phase-1 scaffold smoke test: a signal-backed counter proves Preact + signals + TS + the
// '/daily-task-manager/' base + PWA registration all build and render. Replaced in Phase 3.
const count = signal(0);

export function App() {
  return (
    <main style="font:15px/1.5 Inter,system-ui,sans-serif;max-width:640px;margin:0 auto;padding:40px 20px;color:#231f1a">
      <h1 style="letter-spacing:-.02em">Daily Task Manager</h1>
      <p style="color:#847a71">Preact + Signals + TypeScript + Vite scaffold — base <code>{import.meta.env.BASE_URL}</code></p>
      <button
        onClick={() => (count.value += 1)}
        style="background:#b82e4e;color:#fff;border:0;border-radius:8px;padding:10px 16px;font:inherit;font-weight:600"
      >
        signal count: {count}
      </button>
    </main>
  );
}

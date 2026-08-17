import { render } from "preact";
import { App } from "./app";
import "./styles.css";

// Register the PWA service worker (vite-plugin-pwa, autoUpdate). Guarded so `vite dev` (where
// the virtual module still resolves) and non-SW browsers both no-op cleanly.
import { registerSW } from "virtual:pwa-register";
registerSW({ immediate: true });

render(<App />, document.getElementById("app")!);

/**
 * React entry point — mounts the app into #root.
 * Clerk authenticates users; Convex stores their conversation history.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { AuthProvider } from "./components/AuthProvider";

const elem = document.getElementById("root")!;

const app = (
  <StrictMode>
    <AuthProvider><App /></AuthProvider>
  </StrictMode>
);

if (import.meta.hot) {
  const root = (import.meta.hot.data.root ??= createRoot(elem));
  root.render(app);
} else {
  createRoot(elem).render(app);
}

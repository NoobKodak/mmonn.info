import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.jsx";
import { ContentProvider } from "./lib/content-store.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ContentProvider>
      <App />
    </ContentProvider>
  </StrictMode>,
);

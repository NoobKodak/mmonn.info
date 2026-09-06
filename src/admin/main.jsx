import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import AdminApp from "./AdminApp.jsx";

function syncTelegramTheme() {
  const webApp = window.Telegram?.WebApp;
  if (!webApp) return () => {};

  const apply = () => {
    document.documentElement.dataset.telegramTheme = webApp.colorScheme === "dark" ? "dark" : "light";
  };
  apply();
  webApp.onEvent?.("themeChanged", apply);
  return () => webApp.offEvent?.("themeChanged", apply);
}

syncTelegramTheme();

createRoot(document.getElementById("admin-root")).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);

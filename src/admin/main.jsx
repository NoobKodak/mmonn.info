import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./tailwind.css";
import AdminApp from "./AdminApp.jsx";

function setupTelegramMiniApp() {
  const webApp = window.Telegram?.WebApp;
  if (!webApp) return () => {};

  const apply = () => {
    document.documentElement.dataset.telegramTheme = webApp.colorScheme === "dark" ? "dark" : "light";
    webApp.setHeaderColor?.("secondary_bg_color");
    webApp.setBackgroundColor?.("bg_color");
  };
  webApp.ready?.();
  webApp.expand?.();
  apply();
  webApp.onEvent?.("themeChanged", apply);
  return () => webApp.offEvent?.("themeChanged", apply);
}

setupTelegramMiniApp();

createRoot(document.getElementById("admin-root")).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);

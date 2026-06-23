import React from "react";
import { createRoot } from "react-dom/client";
import { PlannerPage } from "./pages/PlannerPage.js";
import "./styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PlannerPage />
  </React.StrictMode>,
);

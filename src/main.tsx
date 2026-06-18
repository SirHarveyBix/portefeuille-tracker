import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css"; // We will create index.css to import assets/styles.css

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

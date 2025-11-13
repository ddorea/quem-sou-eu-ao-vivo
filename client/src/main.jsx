import React from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import App from "./pages/App.jsx";
import Host from "./pages/Host.jsx";
import Join from "./pages/Join.jsx";
import Projector from "./pages/Projector.jsx";
import Play from "./pages/Play.jsx";

const router = createHashRouter([
  { path: "/", element: <App /> },
  { path: "/host", element: <Host /> },
  { path: "/join", element: <Join /> },
  { path: "/projector/:roomCode", element: <Projector /> },
  { path: "/play/:roomCode", element: <Play /> }
]);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);

import { createBrowserRouter } from "react-router";
import { LoginPage } from "./pages/LoginPage";
import { CapturePage } from "./pages/CapturePage";
import { AdminPage } from "./pages/AdminPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: LoginPage,
  },
  {
    path: "/capture",
    Component: CapturePage,
  },
  {
    path: "/admin",
    Component: AdminPage,
  },
  {
    path: "*",
    Component: LoginPage,
  },
]);

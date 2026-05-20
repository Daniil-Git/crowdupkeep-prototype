import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Login } from "./components/Login";
import { Register } from "./components/Register";
import { Dashboard } from "./components/Dashboard";
import { ReportDetail } from "./components/ReportDetail";
import { Leaderboard } from "./components/Leaderboard";
import { Rewards } from "./components/Rewards";
import { Profile } from "./components/Profile";
import { AdminDashboard } from "./components/AdminDashboard";
import { AdminDatabaseView } from "./components/AdminDatabaseView";
import { AdminValidate } from "./components/AdminValidate";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Login },
      { path: "register", Component: Register },
      { path: "dashboard", Component: Dashboard },
      { path: "report/:id", Component: ReportDetail },
      { path: "leaderboard", Component: Leaderboard },
      { path: "rewards", Component: Rewards },
      { path: "profile", Component: Profile },
      { path: "admin", Component: AdminDashboard },
      { path: "admin/database", Component: AdminDatabaseView },
      { path: "admin/validate/:id", Component: AdminValidate },
    ],
  },
]);

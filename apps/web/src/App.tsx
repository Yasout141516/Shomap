import { Route, Routes } from "react-router-dom";
import { Shell } from "./features/shell/Shell";
import { MapPage } from "./features/map/MapPage";
import { IncidentPanel } from "./features/incident/IncidentPanel";
import { FeedPage } from "./features/feed/FeedPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { AlertsPage } from "./features/alerts/AlertsPage";
import { MePage } from "./features/me/MePage";
import { WatchZonesPage } from "./features/watch-zones/WatchZonesPage";
import { AuthorityPage } from "./features/authority/AuthorityPage";
import { AdminPage } from "./features/admin/AdminPage";
import { DemoPage } from "./features/demo/DemoPage";
import { LoginPage } from "./features/auth/LoginPage";

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<MapPage />}>
          <Route path="incident/:id" element={<IncidentPanel />} />
        </Route>
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/me" element={<MePage />} />
        <Route path="/me/zones" element={<WatchZonesPage />} />
        <Route path="/authority" element={<AuthorityPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<MapPage />} />
      </Route>
    </Routes>
  );
}

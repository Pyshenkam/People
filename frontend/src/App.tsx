import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const VisitorPage = lazy(() =>
  import("./pages/VisitorPage").then((module) => ({ default: module.VisitorPage })),
);
const AdminLoginPage = lazy(() =>
  import("./pages/AdminLoginPage").then((module) => ({ default: module.AdminLoginPage })),
);
const AdminDashboardPage = lazy(() =>
  import("./pages/AdminDashboardPage").then((module) => ({ default: module.AdminDashboardPage })),
);

export default function App() {
  return (
    <Suspense fallback={<div className="route-loading">页面加载中...</div>}>
      <Routes>
        <Route path="/" element={<VisitorPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

import { Outlet } from "react-router";

export function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* iPhone 14 frame */}
      <div className="mx-auto max-w-[390px] min-h-screen bg-white shadow-2xl">
        <Outlet />
      </div>
    </div>
  );
}

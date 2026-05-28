import { useEffect, useState } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "./components/ui/sonner";
import { useAppStore } from "./store/appStore";

export default function App() {
  // The persist middleware rehydrates asynchronously on mount. Until that
  // settles, screens like Profile/Dashboard could mount with the seed data
  // and then snap to the persisted values mid-render, visible flicker on
  // refresh. We block the route tree on a single hydration tick instead.
  const [hydrated, setHydrated] = useState(() =>
    useAppStore.persist.hasHydrated(),
  );

  useEffect(() => {
    if (hydrated) return;
    const unsub = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    // Guard for the rare case where hydration already completed between
    // the initial getState() above and this effect attaching.
    if (useAppStore.persist.hasHydrated()) setHydrated(true);
    return () => unsub();
  }, [hydrated]);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-500 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}

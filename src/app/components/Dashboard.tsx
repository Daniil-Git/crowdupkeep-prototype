import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Plus, Trophy, User, Flame, Clock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Badge } from "./ui/badge";
import { NewReportModal } from "./NewReportModal";
import { NotificationOverlay } from "./NotificationOverlay";
import { DashboardMap } from "./DashboardMap";
import { LocationDropdown } from "./LocationDropdown";
import { useAppStore } from "../store/appStore";
import { matchesFilter } from "@/lib/districts";
import { hasNearbyReport } from "@/lib/nearby";

export function Dashboard() {
  const navigate = useNavigate();
  const reports = useAppStore((s) => s.reports);
  const me = useAppStore((s) => s.getCurrentUser());
  const selectedDistrict = useAppStore((s) => s.selectedDistrict);
  const [showNewReport, setShowNewReport] = useState(false);
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    // Read latest store state at trigger time (not at mount) so a district
    // switch in the 3-second window is respected. If there's nothing
    // eligible for the active filter, we never open the popup at all —
    // the overlay's render gate is a backstop, not the only line of
    // defence.
    const timer = setTimeout(() => {
      const s = useAppStore.getState();
      const me = s.getCurrentUser();
      const visible = s.reports.filter(
        (r) => !s.bannedUsernames.includes(r.createdByName),
      );
      if (hasNearbyReport(visible, me.location, s.selectedDistrict)) {
        setShowNotification(true);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // The district filter intentionally only narrows "My Reports" too — when
  // the user picks "Molos" they expect to see only their Molos issues
  // alongside the filtered map. "All Locations" is the no-op default.
  const myReports = useMemo(
    () =>
      reports
        .filter((r) => r.createdById === me.id)
        .filter((r) => matchesFilter(r.address, selectedDistrict)),
    [reports, me.id, selectedDistrict],
  );

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="bg-[#1976D2] text-white px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div
              className="cursor-pointer bg-white/20 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-2"
              onClick={() => navigate("/rewards")}
            >
              <Trophy className="w-4 h-4" />
              <span>{me.xp} XP</span>
            </div>
            <div className="flex items-center gap-1">
              <Flame className="w-4 h-4 text-orange-400" />
              <span className="text-sm">{me.streak} day streak</span>
            </div>
          </div>
          <User
            className="w-6 h-6 cursor-pointer flex-shrink-0"
            onClick={() => navigate("/profile")}
          />
        </div>
        <div className="mt-2">
          <LocationDropdown variant="header" className="w-full" />
        </div>
      </div>

      <Tabs defaultValue="map" className="flex flex-col">
        <TabsList className="w-full rounded-none border-b">
          <TabsTrigger value="map" className="flex-1">
            Map
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="flex-1" onClick={() => navigate("/leaderboard")}>
            Leaderboard
          </TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="m-0 flex flex-col">
          <div className="relative isolate z-0 h-[55vh] overflow-hidden">
            <DashboardMap />
            <button
              onClick={() => setShowNewReport(true)}
              aria-label="Create report"
              className="absolute bottom-6 right-4 w-14 h-14 rounded-full bg-[#FF9800] hover:bg-[#F57C00] text-white shadow-lg flex items-center justify-center z-[1000]"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>

          <div className="border-t bg-white p-4">
            <h3 className="mb-3">My Reports</h3>
            {myReports.length === 0 ? (
              <p className="text-sm text-gray-500">
                No reports yet for this area — tap + to add one.
              </p>
            ) : (
              <div className="space-y-2">
                {myReports.map((report) => (
                  <div
                    key={report.id}
                    onClick={() => navigate(`/report/${report.id}`)}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer border"
                  >
                    <img
                      src={report.photos[0]}
                      alt={report.title}
                      className="w-12 h-12 rounded object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{report.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge
                          variant={report.status === "in-progress" ? "secondary" : "destructive"}
                          className="text-xs"
                        >
                          {report.status}
                        </Badge>
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(report.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <NewReportModal open={showNewReport} onOpenChange={setShowNewReport} />
      <NotificationOverlay open={showNotification} onOpenChange={setShowNotification} />
    </div>
  );
}

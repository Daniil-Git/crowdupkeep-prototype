import { MapPin, Clock } from "lucide-react";
import { useNavigate } from "react-router";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { useAppStore } from "../store/appStore";
import { haversineKm } from "@/lib/geo";

interface NotificationOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Picks the closest pending report to the user's last known location, so the
// "Nearby Issue" toast actually corresponds to a real, navigable issue.
export function pickNearbyReport(
  reports: ReturnType<typeof useAppStore.getState>["reports"],
  origin: { lat: number; lng: number } | undefined,
) {
  const candidates = reports.filter((r) => r.status === "pending");
  if (candidates.length === 0) return null;
  if (!origin) return candidates[0];
  let best = candidates[0];
  let bestDist = haversineKm(origin, best.geometry);
  for (const r of candidates.slice(1)) {
    const d = haversineKm(origin, r.geometry);
    if (d < bestDist) {
      best = r;
      bestDist = d;
    }
  }
  return { report: best, distanceKm: bestDist };
}

export function NotificationOverlay({ open, onOpenChange }: NotificationOverlayProps) {
  const navigate = useNavigate();
  const reports = useAppStore((s) => s.reports);
  const me = useAppStore((s) => s.getCurrentUser());
  const picked = pickNearbyReport(reports, me.location);
  const report = picked && "report" in picked ? picked.report : picked;
  const distanceKm = picked && "distanceKm" in picked ? picked.distanceKm : null;

  const distanceLabel = (() => {
    if (distanceKm == null) return "Just nearby";
    if (distanceKm < 1) return `Just ${Math.round(distanceKm * 1000)}m away`;
    return `~${distanceKm.toFixed(1)}km away`;
  })();

  const handleView = () => {
    onOpenChange(false);
    if (report) navigate(`/report/${report.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px] bg-gradient-to-br from-[#FF5722] to-[#F4511E] text-white border-none [&>button]:text-white/90 [&>button]:hover:text-white">
        <DialogTitle className="sr-only">Nearby civic issue</DialogTitle>
        <div className="pt-1 pb-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <MapPin className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg">🚨 Nearby Issue!</h3>
              <p className="text-white/90 text-sm">{distanceLabel}</p>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 mb-4">
            <p className="mb-2">{report?.title ?? "A pending issue near you"}</p>
            <p className="text-sm text-white/80">
              Help resolve this and earn{" "}
              <span className="text-yellow-300">+100 XP bonus</span> for proximity!
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="flex-1 bg-white/20 backdrop-blur-sm border-white/30 text-white hover:bg-white/30"
            >
              <Clock className="w-4 h-4 mr-1" />
              Snooze
            </Button>
            <Button
              onClick={handleView}
              disabled={!report}
              className="flex-1 bg-white text-[#FF5722] hover:bg-white/90"
            >
              View Issue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

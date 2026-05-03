// src/app/components/NotificationOverlay.tsx
import { MapPin, Clock, Package } from "lucide-react";
import { useNavigate } from "react-router";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { useAppStore } from "../store/appStore";
import { haversineKm } from "@/lib/geo";
import { pickNearbyReport } from "@/lib/nearby";
import { matchesFilter, type LocationFilter } from "@/lib/districts";

function getProximityRewardLabel(
  xp: number,
  rewardStatus: ReturnType<typeof useAppStore["getRewardStatusForReport"]> | null,
) {
  if (!rewardStatus || !rewardStatus.available) {
    return `+${xp} XP challenge`;
  }
  if (rewardStatus.xpCost !== xp) {
    return `+${rewardStatus.xpCost} XP + reward`;
  }
  return `+${xp} XP + reward`;
}

interface NotificationOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationOverlay({ open, onOpenChange }: NotificationOverlayProps) {
  const navigate = useNavigate();
  const reports = useAppStore((s) => s.reports);
  const me = useAppStore((s) => s.getCurrentUser());
  const selectedDistrict = useAppStore((s) => s.selectedDistrict);
  const bannedUsernames = useAppStore((s) => s.bannedUsernames);

  const [nearbyReport, setNearbyReport] = useState(null);
  const [rewardStatus, setRewardStatus] = useState(null);

  useEffect(() => {
    const pendingReports = reports.filter((r) =>
      r.status === "open" &&
      !bannedUsernames.includes(r.createdBy?.email ?? "") &&
      matchesFilter(r.address ?? "", selectedDistrict)
    );

    const picked = pickNearbyReport(pendingReports, me.location, selectedDistrict);
    const report = picked?.report ?? null;

    setNearbyReport(report);

    const xpFor = useAppStore.getState().xpFor;
    const getRewardStatusForReport = useAppStore.getState().getRewardStatusForReport;

    if (report) {
      const xp = xpFor(report.difficulty);
      const status = getRewardStatusForReport(report.id);
      setRewardStatus(status);
    } else {
      setRewardStatus(null);
    }
  }, [reports, me.location, selectedDistrict, bannedUsernames]);

  const distanceKm = nearbyReport
    ? haversineKm(me.location ?? { lat: 0, lng: 0 }, nearbyReport.geometry)
    : null;

  const distanceLabel = (() => {
    if (distanceKm == null) return "Nearby";
    if (distanceKm < 1)
      return `Just ${Math.round(distanceKm * 1000)}m away`;
    return `~${distanceKm.toFixed(1)}km away`;
  })();

  const xpFor = useAppStore.getState().xpFor;
  const xp = nearbyReport ? xpFor(nearbyReport.difficulty) : 0;
  const rewardLabel = xp > 0 ? getProximityRewardLabel(xp, rewardStatus) : "";

  const isAvailable = rewardStatus?.available ?? true;
  const disabled = !nearbyReport || !isAvailable;

  const handleView = () => {
    onOpenChange(false);
    if (nearbyReport) navigate(`/report/${nearbyReport.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[340px] bg-gradient-to-br from-[#FF5722] to-[#F4511E] text-white border-none [&>button]:text-white/90 [&>button]:hover:text-white"
      >
        <DialogTitle className="sr-only">Nearby civic issue</DialogTitle>
        <div className="pt-1 pb-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <MapPin className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg">
                {nearbyReport
                  ? `🚨 Nearby Issue: ${nearbyReport.title}`
                  : "🚨 Nearby civic issue"}
              </h3>
              <p className="text-white/90 text-sm">{distanceLabel}</p>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 mb-4">
            <p className="text-sm text-white/80">
              {nearbyReport
                ? <>
                    Help resolve this {nearbyReport.difficulty}-difficulty issue and earn{" "}
                    <span className="text-yellow-300 font-bold">{rewardLabel}</span> when you solve it.
                  </>
                : "Help communities clean up nearby issues and earn XP by solving issues."}
            </p>
            {rewardStatus && !rewardStatus.available && (
              <p className="text-white/70 text-xs mt-1 flex items-center gap-1">
                <Package className="w-3 h-3" />
                No reward available
              </p>
            )}
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
              disabled={disabled}
              className="flex-1 bg-white text-[#FF5722] hover:bg-white/90 disabled:opacity-60"
            >
              View Issue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


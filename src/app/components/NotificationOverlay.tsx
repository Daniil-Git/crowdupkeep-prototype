import { useEffect, useMemo } from "react";
import { MapPin, Clock, Package } from "lucide-react";
import { useNavigate } from "react-router";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { useAppStore } from "../store/appStore";
import { pickNearbyReport } from "@/lib/nearby";
import { xpFor } from "@/lib/xp";

interface NotificationOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RewardStatus {
  xpCost: number;
  available: boolean;
  stock: number;
}

// Renders the yellow highlight phrase under the title. Folded into a pure
// helper so the variants stay readable and so it can be unit-tested without
// mounting a Dialog.
export function proximityRewardLabel(xp: number, status: RewardStatus | null): string {
  if (!status || !status.available) return `+${xp} XP challenge`;
  // The store may compute xpCost from the report's difficulty too. Showing
  // both numbers when they differ is misleading, so collapse on equality.
  if (status.xpCost !== xp) return `+${status.xpCost} XP + reward`;
  return `+${xp} XP + reward`;
}

export function NotificationOverlay({ open, onOpenChange }: NotificationOverlayProps) {
  const navigate = useNavigate();
  const reports = useAppStore((s) => s.reports);
  const me = useAppStore((s) => s.getCurrentUser());
  const selectedDistrict = useAppStore((s) => s.selectedDistrict);
  const bannedUsernames = useAppStore((s) => s.bannedUsernames);
  const getRewardStatusForReport = useAppStore((s) => s.getRewardStatusForReport);

  // Memoised so a re-render that doesn't change inputs (e.g. dialog
  // open/close) doesn't keep recomputing the haversine sort.
  const picked = useMemo(() => {
    // Drop authors who've been banned from the moderation surface — they
    // shouldn't get free promotion via the Nearby prompt either.
    const visible = reports.filter(
      (r) => !bannedUsernames.includes(r.createdByName),
    );
    return pickNearbyReport(visible, me.location, selectedDistrict);
  }, [reports, bannedUsernames, me.location, selectedDistrict]);

  const nearby = picked && "report" in picked ? picked.report : picked;
  const distanceKm = picked && "distanceKm" in picked ? picked.distanceKm : null;

  // If the candidate set is empty for the active district, the popup must
  // not render its default copy — the user explicitly asked us not to lie
  // about "nearby civic issues" when none exist. We also push the parent's
  // `open` state back to false so its trigger state stays in sync (e.g.
  // after a district change drains the visible set mid-display).
  useEffect(() => {
    if (open && !nearby) onOpenChange(false);
  }, [open, nearby, onOpenChange]);

  if (!nearby) return null;

  const xp = xpFor(nearby.difficulty);
  const rewardStatus = getRewardStatusForReport(nearby.id);
  const rewardLabel = proximityRewardLabel(xp, rewardStatus);

  const distanceLabel = (() => {
    if (distanceKm == null) return "Nearby";
    if (distanceKm < 1) return `Just ${Math.round(distanceKm * 1000)}m away`;
    return `~${distanceKm.toFixed(1)}km away`;
  })();

  const isAvailable = rewardStatus?.available ?? true;
  const disabled = !isAvailable;

  const handleView = () => {
    onOpenChange(false);
    navigate(`/report/${nearby.id}`);
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
            <div className="flex-1 min-w-0">
              <h3 className="text-lg truncate">🚨 {nearby.title}</h3>
              <p className="text-white/90 text-sm">{distanceLabel}</p>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 mb-4">
            <p className="text-sm text-white/90">
              Help resolve this {nearby.difficulty}-difficulty issue and earn{" "}
              <span className="text-yellow-300 font-bold">{rewardLabel}</span> when you solve it.
            </p>
            {rewardStatus && !rewardStatus.available && (
              <p className="text-white/70 text-xs mt-1 flex items-center gap-1">
                <Package className="w-3 h-3" />
                No reward inventory available right now
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

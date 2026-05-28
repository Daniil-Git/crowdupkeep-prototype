import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Upload, Trophy, CheckCircle, Gift, TrendingUp, MapPin, LogOut } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { useAppStore } from "../store/appStore";
import { LocationDropdown } from "./LocationDropdown";
import { IdentityInput } from "./IdentityInput";
import { matchesFilter } from "@/lib/districts";
import { CypriotIdFormatError } from "@/lib/cypriotId";

// Synthetic XP curve trailing the user's current balance — keeps the chart
// meaningful as the live XP changes from accepted solutions.
function buildXpHistory(currentXp: number) {
  const days = 8;
  const start = Math.max(0, currentXp - 450);
  const step = (currentXp - start) / (days - 1);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return {
      date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      xp: Math.round(start + step * i),
    };
  });
}

export function Profile() {
  const navigate = useNavigate();
  const me = useAppStore((s) => s.getCurrentUser());
  const reports = useAppStore((s) => s.reports);
  const redeemedVouchers = useAppStore((s) => s.redeemedVouchers);
  const selectedDistrict = useAppStore((s) => s.selectedDistrict);
  const logout = useAppStore((s) => s.logout);
  const reuploadIdentity = useAppStore((s) => s.reuploadIdentity);
  // The Re-upload modal is controlled so the success handler can close it
  // explicitly. The previous uncontrolled DialogTrigger pattern left the
  // modal open after a successful submit, contradicting the toast.
  const [reuploadOpen, setReuploadOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  // The IdentityInput hands back the canonical 10-digit string once
  // validated. Only that value ever leaves the input component — see
  // IdentityInput.tsx for the no-image-bytes-ever invariant.
  const [reuploadCanonical, setReuploadCanonical] = useState<string | null>(null);
  // Mount the IdentityInput under a fresh key each time the modal
  // opens so closing-and-reopening starts from a clean text/photo
  // state. Without this, the previous typed value or photo preview
  // lingers across opens — surprising for a "re-upload" action that
  // should feel like a discrete event each time.
  const [reuploadKey, setReuploadKey] = useState(0);

  const myReports = useMemo(
    () =>
      reports
        .filter((r) => r.createdById === me.id)
        .filter((r) => matchesFilter(r.address, selectedDistrict)),
    [reports, me.id, selectedDistrict],
  );
  const xpHistory = useMemo(() => buildXpHistory(me.xp), [me.xp]);

  const handleReuploadID = async () => {
    if (!reuploadCanonical || verifying) return;
    setVerifying(true);
    try {
      const result = await reuploadIdentity({ rawCitizenId: reuploadCanonical });
      if (result.changed) {
        toast.success("Identity re-uploaded. Previous binding archived.");
      } else {
        toast.info("Same ID as currently bound — no change made.");
      }
      setReuploadOpen(false);
      setReuploadCanonical(null);
      // Force the IdentityInput to unmount so the next open is clean.
      setReuploadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof CypriotIdFormatError) toast.error(err.message);
      else if (err instanceof Error) toast.error(err.message);
      else toast.error("Re-upload failed");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-[#1976D2] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/dashboard")} aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg">Profile</h1>
      </div>

      <div className="bg-gradient-to-br from-[#1976D2] to-[#1565C0] px-4 py-8 text-white text-center">
        <img
          src={me.avatar}
          alt={me.username}
          className="w-24 h-24 rounded-full mx-auto mb-3 border-4 border-white/50"
        />
        <h2 className="text-2xl mb-1">{me.username}</h2>
        <p className="text-white/90 text-sm">{me.streak} day streak</p>
        <div className="flex justify-center gap-6 mt-4">
          <div>
            <p className="text-2xl">{me.xp}</p>
            <p className="text-xs text-white/80">Total XP</p>
          </div>
          <div>
            <p className="text-2xl">{myReports.length}</p>
            <p className="text-xs text-white/80">Reports</p>
          </div>
          <div>
            <p className="text-2xl">{redeemedVouchers.length}</p>
            <p className="text-xs text-white/80">Rewards</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-5 h-5 text-[#1976D2]" />
            <h3>Current Area</h3>
          </div>
          <LocationDropdown />
          <p className="text-xs text-gray-500 mt-2">
            Filters the dashboard map and nearby-issue alerts.
          </p>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-[#4CAF50]" />
            <h3>XP History</h3>
          </div>
          <div className="border rounded-lg p-4 bg-gray-50">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={xpHistory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="xp" stroke="#1976D2" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-5 h-5 text-[#FF9800]" />
            <h3>My Reports ({myReports.length})</h3>
          </div>
          <div className="space-y-2">
            {myReports.map((report) => (
              <div
                key={report.id}
                onClick={() => navigate(`/report/${report.id}`)}
                className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer flex items-center gap-3"
              >
                <img
                  src={report.photos[0]}
                  alt={report.title}
                  className="w-16 h-16 rounded object-cover"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate mb-1">{report.title}</p>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        report.status === "solved"
                          ? "default"
                          : report.status === "in-progress"
                            ? "secondary"
                            : "destructive"
                      }
                      className="text-xs"
                    >
                      {report.status}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Gift className="w-5 h-5 text-[#4CAF50]" />
            <h3>Redeemed Vouchers</h3>
          </div>
          <div className="space-y-2">
            {redeemedVouchers.map((voucher) => (
              <div
                key={voucher.id}
                className="border rounded-lg p-3 bg-green-50 border-green-200"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm mb-0.5">{voucher.title}</p>
                    <p className="text-xs text-gray-600">
                      Redeemed: {new Date(voucher.redeemedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <CheckCircle className="w-5 h-5 text-[#4CAF50]" />
                </div>
                <div className="bg-white rounded px-2 py-1 text-xs font-mono border border-dashed border-green-300">
                  {voucher.code}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Button
            variant="outline"
            className="w-full border-[#1976D2] text-[#1976D2]"
            onClick={() => setReuploadOpen(true)}
          >
            <Upload className="w-4 h-4 mr-2" />
            Re-upload ID
          </Button>
          <Dialog
            open={reuploadOpen}
            onOpenChange={(next) => {
              if (verifying) return; // don't allow closing mid-verification
              setReuploadOpen(next);
              if (!next) {
                setReuploadCanonical(null);
                setReuploadKey((k) => k + 1);
              }
            }}
          >
            <DialogContent className="max-w-[340px]">
              <DialogHeader>
                <DialogTitle>Re-upload Identity Document</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <p className="text-sm text-gray-600">
                  Submitting a new Cypriot ID updates your account identity.
                  Your login password and access are not changed.
                </p>
                {/*
                  The same component the Register flow uses — tabbed
                  text-only vs photo-plus-text modes, both producing the
                  same canonical 10-digit string. Wiring re-upload
                  through it keeps both paths on a single cryptographic
                  pipeline (canonicalise → PBKDF2 identity nullifier).
                */}
                <IdentityInput
                  key={reuploadKey}
                  onCanonicalReady={setReuploadCanonical}
                  onCanonicalCleared={() => setReuploadCanonical(null)}
                  disabled={verifying}
                  label="New Cypriot National ID"
                />
                <Button
                  className="w-full bg-[#1976D2] hover:bg-[#1565C0]"
                  onClick={handleReuploadID}
                  disabled={!reuploadCanonical || verifying}
                >
                  {verifying ? "Re-binding identity…" : "Submit re-upload"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="pt-4 border-t space-y-3">
          <Button
            onClick={() => navigate("/admin")}
            variant="outline"
            className="w-full text-purple-700 border-purple-300"
          >
            Admin Dashboard (Demo)
          </Button>

          {/*
            Logout button. Wired to the store's session-only logout
            action: clears isAuthenticated / role / adminVerified, sweeps
            sessionStorage, then a hard window.location.replace('/') so
            the entire component tree re-mounts (releasing blob URLs
            and any ephemeral component-local state along the way). The
            credential triple (username, loginNullifier, ownershipPublicKey)
            and derived identity material (identityNullifier, totpSecret)
            are deliberately PRESERVED so the same device can log back
            in with username + password without re-running the citizen-ID
            registration flow — the demo-ergonomics contract documented
            on the logout action.
            The toast is fired on the same tick — the location.replace
            is async at the browser level so the toast still renders
            before the navigation tears the tree down.
          */}
          <Button
            onClick={() => {
              toast.success("Logged out — log back in with your password.");
              logout();
            }}
            variant="outline"
            className="w-full text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Log out
          </Button>
        </div>
      </div>
    </div>
  );
}

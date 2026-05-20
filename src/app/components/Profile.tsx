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
import { matchesFilter } from "@/lib/districts";

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
  const [idPhoto, setIdPhoto] = useState<File | null>(null);
  // The Re-upload modal is controlled so the success handler can close it
  // explicitly. The previous uncontrolled DialogTrigger pattern left the
  // modal open after a successful submit, contradicting the toast.
  const [reuploadOpen, setReuploadOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const myReports = useMemo(
    () =>
      reports
        .filter((r) => r.createdById === me.id)
        .filter((r) => matchesFilter(r.address, selectedDistrict)),
    [reports, me.id, selectedDistrict],
  );
  const xpHistory = useMemo(() => buildXpHistory(me.xp), [me.xp]);

  const handleReuploadID = async () => {
    if (!idPhoto || verifying) return;
    setVerifying(true);
    // Simulated verification — short delay so the user perceives the
    // submit as a deliberate action rather than an instant flash.
    await new Promise((r) => setTimeout(r, 600));
    setVerifying(false);
    setReuploadOpen(false);
    setIdPhoto(null);
    toast.success("ID re-uploaded and verified!");
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
              if (!next) setIdPhoto(null);
            }}
          >
            <DialogContent className="max-w-[340px]">
              <DialogHeader>
                <DialogTitle>Re-upload Identity Document</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <p className="text-sm text-gray-600">
                  Update your identity document if needed.
                </p>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <Upload className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setIdPhoto(e.target.files?.[0] || null)}
                    className="hidden"
                    id="profile-id-upload"
                  />
                  <label htmlFor="profile-id-upload" className="cursor-pointer">
                    <span className="text-sm text-[#1976D2]">
                      {idPhoto ? idPhoto.name : "Choose file or take photo"}
                    </span>
                  </label>
                </div>
                <Button
                  className="w-full bg-[#1976D2] hover:bg-[#1565C0]"
                  onClick={handleReuploadID}
                  disabled={!idPhoto || verifying}
                >
                  {verifying ? "Verifying…" : "Submit for Verification"}
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
            Logout button. Wired to the store's secure logout action:
            clearStorage() on the persist middleware, identity slice
            reset to nulls, sessionStorage swept, then a hard
            window.location.replace('/') so the entire component tree
            re-mounts (releasing blob URLs and any ephemeral
            component-local state along the way). The toast is fired
            on the same tick — the location.replace is async at the
            browser level so the toast still has time to render before
            the navigation tears the tree down. We don't call
            navigate('/') here: that would race with the store's hard
            navigation and produce a brief flash of an empty layout.
          */}
          <Button
            onClick={() => {
              toast.success("Logged out — local credentials cleared.");
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

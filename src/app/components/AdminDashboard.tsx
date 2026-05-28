import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, MapPin, MessageCircle, Ban, TrendingUp, Clock, CheckCircle, Search } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { LocationDropdown } from "./LocationDropdown";
import { useAppStore } from "../store/appStore";
import { matchesFilter } from "@/lib/districts";
import { toast } from "sonner";
import { AdminTotpVerify } from "./AdminTotpVerify";

// Admin dashboard reads from the same store as the citizen dashboard so
// district filtering, stats, and search stay consistent across the two
// surfaces. The previous implementation kept its own `locationFilter`
// useState with a hardcoded list ("Limassol", "Old Port", "Molos") that
// drifted from the citizen dropdown, toggling on one side did nothing on
// the other.

export function AdminDashboard() {
  const navigate = useNavigate();
  const reports = useAppStore((s) => s.reports);
  const banUser = useAppStore((s) => s.banUser);
  const selectedDistrict = useAppStore((s) => s.selectedDistrict);
  // Admin MFA gate. All hooks below this run unconditionally so the
  // Rules-of-Hooks order is invariant when `adminVerified` flips;
  // only the rendered output is gated.
  const adminVerified = useAppStore((s) => s.adminVerified);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  // Single derivation pipeline: district filter ▷ status filter ▷ free-text
  // search. Stats and the table both read from `filteredReports` so the
  // headline numbers reflect what the operator is actually looking at.
  const filteredReports = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (!matchesFilter(r.address, selectedDistrict)) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (term) {
        const haystack = `${r.title} ${r.description} ${r.address} ${r.createdByName}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [reports, selectedDistrict, statusFilter, search]);

  const stats = useMemo(
    () => ({
      total: filteredReports.length,
      pending: filteredReports.filter((r) => r.status === "pending").length,
      inProgress: filteredReports.filter((r) => r.status === "in-progress").length,
      solved: filteredReports.filter((r) => r.status === "solved").length,
      avgResolutionHours: 2.3,
    }),
    [filteredReports],
  );

  const handleBanUser = (username: string) => {
    banUser(username);
    toast.error(`User ${username} has been banned`);
  };

  if (!adminVerified) {
    return (
      <AdminTotpVerify
        onVerified={() => {
          /* store flips adminVerified=true; this component re-renders. */
        }}
        onCancel={() => navigate("/dashboard")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-purple-700 text-white px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/profile")} aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg">Admin Dashboard</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="bg-white/10 text-white border-white/40 hover:bg-white/20"
          onClick={() => navigate("/admin/database")}
        >
          User Registry
        </Button>
      </div>

      <div className="bg-gradient-to-br from-purple-700 to-purple-900 px-4 py-6 text-white">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
            <p className="text-2xl mb-1">{stats.total}</p>
            <p className="text-xs text-white/80">
              Reports{selectedDistrict !== "All Locations" ? ` · ${selectedDistrict}` : ""}
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
            <p className="text-2xl mb-1">{stats.avgResolutionHours}h</p>
            <p className="text-xs text-white/80">Avg Resolution</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-red-500/30 backdrop-blur-sm rounded-lg p-2 text-center">
            <p className="text-lg">{stats.pending}</p>
            <p className="text-xs text-white/90">Pending</p>
          </div>
          <div className="bg-orange-500/30 backdrop-blur-sm rounded-lg p-2 text-center">
            <p className="text-lg">{stats.inProgress}</p>
            <p className="text-xs text-white/90">In Progress</p>
          </div>
          <div className="bg-green-500/30 backdrop-blur-sm rounded-lg p-2 text-center">
            <p className="text-lg">{stats.solved}</p>
            <p className="text-xs text-white/90">Solved</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 border-b bg-gray-50 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="solved">Solved</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Location</label>
            <LocationDropdown />
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, description, author…"
            className="pl-9 h-9 text-sm"
            aria-label="Search reports"
          />
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-5 h-5 text-purple-700" />
          <h3>Reports ({filteredReports.length})</h3>
        </div>

        {filteredReports.length === 0 ? (
          <p className="text-sm text-gray-500">
            No reports match the current filters.
          </p>
        ) : (
          <div className="space-y-3">
            {filteredReports.map((report) => (
              <div key={report.id} className="border rounded-lg p-3 hover:bg-gray-50">
                <div className="flex gap-3 mb-3">
                  <img
                    src={report.photos[0]}
                    alt={report.title}
                    className="w-20 h-20 rounded object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="text-sm line-clamp-2">{report.title}</h4>
                      <Badge
                        variant={
                          report.status === "solved"
                            ? "default"
                            : report.status === "in-progress"
                              ? "secondary"
                              : "destructive"
                        }
                        className="text-xs flex-shrink-0"
                      >
                        {report.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">{report.address}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>by {report.createdByName}</span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" />
                        {report.comments.length}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(report.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/admin/validate/${report.id}`)}
                    className="flex-1 text-purple-700 border-purple-300"
                  >
                    {report.solutions.length > 0 ? (
                      <>
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Validate ({report.solutions.length})
                      </>
                    ) : (
                      "View Details"
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleBanUser(report.createdByName)}
                    className="px-3"
                  >
                    <Ban className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

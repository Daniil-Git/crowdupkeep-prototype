import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, MapPin, MessageCircle, Ban, TrendingUp, Clock, CheckCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { mockReports } from "../data/mockData";
import { toast } from "sonner";

export function AdminDashboard() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");

  const filteredReports = mockReports.filter((report) => {
    if (statusFilter !== "all" && report.status !== statusFilter) return false;
    if (locationFilter !== "all" && !report.address.includes(locationFilter)) return false;
    return true;
  });

  const stats = {
    total: mockReports.length,
    pending: mockReports.filter((r) => r.status === "pending").length,
    inProgress: mockReports.filter((r) => r.status === "in-progress").length,
    solved: mockReports.filter((r) => r.status === "solved").length,
    avgResolutionHours: 2.3,
  };

  const handleBanUser = (username: string) => {
    toast.error(`User ${username} has been banned`);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-purple-700 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/profile")}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg">Admin Dashboard</h1>
      </div>

      {/* Analytics Cards */}
      <div className="bg-gradient-to-br from-purple-700 to-purple-900 px-4 py-6 text-white">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
            <p className="text-2xl mb-1">{stats.total}</p>
            <p className="text-xs text-white/80">Total Reports</p>
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

      {/* Filters */}
      <div className="px-4 py-4 border-b bg-gray-50">
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
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                <SelectItem value="Nicosia">Nicosia</SelectItem>
                <SelectItem value="Limassol">Limassol</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Reports Table */}
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-5 h-5 text-purple-700" />
          <h3>Reports ({filteredReports.length})</h3>
        </div>

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
                    <span>by {report.createdBy}</span>
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
                  onClick={() => handleBanUser(report.createdBy)}
                  className="px-3"
                >
                  <Ban className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

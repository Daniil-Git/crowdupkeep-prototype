import { useParams, useNavigate } from "react-router";
import { ArrowLeft, CheckCircle, X, Ban } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { useAppStore } from "../store/appStore";
import { toast } from "sonner";

export function AdminValidate() {
  const { id } = useParams();
  const navigate = useNavigate();
  const reportId = Number(id);
  const report = useAppStore((s) => s.reports.find((r) => r.id === reportId));
  const users = useAppStore((s) => s.users);
  const acceptSolution = useAppStore((s) => s.acceptSolution);
  const banUser = useAppStore((s) => s.banUser);

  if (!report) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p>Report not found</p>
      </div>
    );
  }

  const handleToggleSolution = (solutionId: number, currentlyAccepted: boolean) => {
    if (currentlyAccepted) {
      toast.info("Solution acceptance cannot be reversed once XP is awarded.");
      return;
    }
    const result = acceptSolution(report.id, solutionId);
    if (result) {
      toast.success(
        `Solution accepted! ${result.solverName} earned ${result.xpAwarded} XP 🎉`,
      );
    }
  };

  const handleBanUser = (username: string) => {
    banUser(username);
    toast.error(`User ${username} has been banned from the platform`);
  };

  const reportUser = users.find((u) => u.id === report.createdById);

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-purple-700 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/admin")} aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg">Validate Report</h1>
      </div>

      <div className="px-4 py-4 border-b bg-gray-50">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h2 className="mb-2">{report.title}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant={
                  report.status === "solved"
                    ? "default"
                    : report.status === "in-progress"
                      ? "secondary"
                      : "destructive"
                }
              >
                {report.status}
              </Badge>
              <span className="text-sm text-gray-600">
                Difficulty: {report.difficulty} • {report.difficulty * 50} XP
              </span>
            </div>
          </div>
        </div>
        <p className="text-sm text-gray-700 mb-3">{report.description}</p>
        <div className="flex items-center gap-3">
          <img
            src={reportUser?.avatar || "https://i.pravatar.cc/150?img=1"}
            alt={report.createdByName}
            className="w-10 h-10 rounded-full"
          />
          <div className="flex-1">
            <p className="text-sm">{report.createdByName}</p>
            <p className="text-xs text-gray-500">
              Reported {new Date(report.createdAt).toLocaleString()}
            </p>
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleBanUser(report.createdByName)}
          >
            <Ban className="w-4 h-4 mr-1" />
            Ban User
          </Button>
        </div>
      </div>

      <div className="px-4 py-4 border-b">
        <h3 className="mb-3 text-sm">Report Photos</h3>
        <div className="flex gap-2 overflow-x-auto">
          {report.photos.map((photo, index) => (
            <img
              key={index}
              src={photo}
              alt={`Report ${index + 1}`}
              className="w-32 h-32 rounded object-cover flex-shrink-0"
            />
          ))}
        </div>
      </div>

      <div className="px-4 py-4">
        <h3 className="mb-3 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-[#4CAF50]" />
          Solutions ({report.solutions.length})
        </h3>

        {report.solutions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <X className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No solutions submitted yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {report.solutions.map((solution) => {
              const solutionUser = users.find((u) => u.id === solution.submittedById);
              const isAccepted = solution.status === "accepted";

              return (
                <div
                  key={solution.id}
                  className={`border rounded-lg p-4 ${
                    isAccepted ? "border-green-500 bg-green-50" : "border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3 pb-3 border-b">
                    <img
                      src={solutionUser?.avatar || "https://i.pravatar.cc/150?img=5"}
                      alt={solution.submittedByName}
                      className="w-10 h-10 rounded-full"
                    />
                    <div className="flex-1">
                      <p className="text-sm">{solution.submittedByName}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(solution.submittedAt).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBanUser(solution.submittedByName)}
                    >
                      <Ban className="w-4 h-4" />
                    </Button>
                  </div>

                  <p className="text-sm text-gray-700 mb-3">{solution.description}</p>

                  <div className="mb-3">
                    <p className="text-xs text-gray-600 mb-2">Proof Photos:</p>
                    <div className="flex gap-2 overflow-x-auto">
                      {solution.proofPhotos.map((photo, index) => (
                        <img
                          key={index}
                          src={photo}
                          alt={`Proof ${index + 1}`}
                          className="w-24 h-24 rounded object-cover flex-shrink-0"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t">
                    <div className="flex items-center gap-2">
                      <CheckCircle
                        className={`w-5 h-5 ${isAccepted ? "text-[#4CAF50]" : "text-gray-400"}`}
                      />
                      <span className="text-sm">
                        {isAccepted ? "Solution Accepted ✓" : "Accept Solution"}
                      </span>
                    </div>
                    <Switch
                      checked={isAccepted}
                      onCheckedChange={() => handleToggleSolution(solution.id, isAccepted)}
                    />
                  </div>

                  {isAccepted && (
                    <div className="mt-3 bg-green-100 border border-green-300 rounded p-2 text-sm text-green-800">
                      ✓ {solution.submittedByName} received {report.difficulty * 50} XP
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-4 py-4 border-t sticky bottom-0 bg-white">
        <Button
          onClick={() => navigate("/admin")}
          className="w-full bg-purple-700 hover:bg-purple-800"
        >
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}

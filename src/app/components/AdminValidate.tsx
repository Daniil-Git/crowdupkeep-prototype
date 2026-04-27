import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, CheckCircle, X, Ban } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { mockReports, mockUsers } from "../data/mockData";
import { toast } from "sonner";

export function AdminValidate() {
  const { id } = useParams();
  const navigate = useNavigate();
  const report = mockReports.find((r) => r.id === Number(id));
  const [acceptedSolutions, setAcceptedSolutions] = useState<Set<number>>(new Set());

  if (!report) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p>Report not found</p>
      </div>
    );
  }

  const handleToggleSolution = (solutionId: number) => {
    const newAccepted = new Set(acceptedSolutions);
    if (newAccepted.has(solutionId)) {
      newAccepted.delete(solutionId);
      toast.info("Solution unmarked");
    } else {
      newAccepted.add(solutionId);
      const solution = report.solutions.find((s) => s.id === solutionId);
      if (solution) {
        toast.success(`Solution accepted! ${solution.submittedBy} earned ${report.difficulty * 50} XP 🎉`);
      }
    }
    setAcceptedSolutions(newAccepted);
  };

  const handleBanUser = (username: string) => {
    toast.error(`User ${username} has been banned from the platform`);
  };

  const reportUser = mockUsers.find((u) => u.username === report.createdBy);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-purple-700 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/admin")}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg">Validate Report</h1>
      </div>

      {/* Report Summary */}
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
            alt={report.createdBy}
            className="w-10 h-10 rounded-full"
          />
          <div className="flex-1">
            <p className="text-sm">{report.createdBy}</p>
            <p className="text-xs text-gray-500">
              Reported {new Date(report.createdAt).toLocaleString()}
            </p>
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleBanUser(report.createdBy)}
          >
            <Ban className="w-4 h-4 mr-1" />
            Ban User
          </Button>
        </div>
      </div>

      {/* Report Photos */}
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

      {/* Solutions */}
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
              const solutionUser = mockUsers.find((u) => u.username === solution.submittedBy);
              const isAccepted = acceptedSolutions.has(solution.id);

              return (
                <div
                  key={solution.id}
                  className={`border rounded-lg p-4 ${
                    isAccepted ? "border-green-500 bg-green-50" : "border-gray-300"
                  }`}
                >
                  {/* User Info */}
                  <div className="flex items-center gap-3 mb-3 pb-3 border-b">
                    <img
                      src={solutionUser?.avatar || "https://i.pravatar.cc/150?img=5"}
                      alt={solution.submittedBy}
                      className="w-10 h-10 rounded-full"
                    />
                    <div className="flex-1">
                      <p className="text-sm">{solution.submittedBy}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(solution.submittedAt).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBanUser(solution.submittedBy)}
                    >
                      <Ban className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Solution Description */}
                  <p className="text-sm text-gray-700 mb-3">{solution.description}</p>

                  {/* Proof Photos */}
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

                  {/* Accept Toggle */}
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
                      onCheckedChange={() => handleToggleSolution(solution.id)}
                    />
                  </div>

                  {isAccepted && (
                    <div className="mt-3 bg-green-100 border border-green-300 rounded p-2 text-sm text-green-800">
                      ✓ User will receive {report.difficulty * 50} XP
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
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

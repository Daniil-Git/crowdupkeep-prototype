import { useState } from "react";
import { Camera, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";

interface PostSolutionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: number;
}

export function PostSolutionModal({ open, onOpenChange, reportId }: PostSolutionModalProps) {
  const { reports, updateReport } = useApp();
  const [description, setDescription] = useState("");
  const [proofPhoto, setProofPhoto] = useState<File | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (description && proofPhoto) {
      const report = reports.find((r) => r.id === reportId);
      if (!report) return;

      // Create a new solution
      const newSolution = {
        id: report.solutions.length + 1,
        reportId,
        description,
        proofPhotos: ["https://images.unsplash.com/photo-1581092918484-8313827e481c?w=800"], // Mock photo URL
        submittedBy: "you",
        submittedAt: new Date().toISOString(),
        status: "pending" as const,
      };

      // Update the report with the new solution
      updateReport(reportId, {
        solutions: [...report.solutions, newSolution],
        status: "in-progress",
      });

      toast.success("Solution submitted! Waiting for admin approval.");
      onOpenChange(false);
      setDescription("");
      setProofPhoto(null);
    } else {
      toast.error("Please provide description and proof photo");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Solve Report #{reportId}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <Label htmlFor="solution-desc">Solution Description</Label>
            <Textarea
              id="solution-desc"
              placeholder="Describe how you solved the issue..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1.5"
              rows={4}
            />
          </div>

          <div>
            <Label>Proof Photo</Label>
            <div className="mt-1.5 border-2 border-dashed border-gray-300 rounded-lg p-4">
              {proofPhoto ? (
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto rounded-lg bg-[#4CAF50] flex items-center justify-center text-white mb-2">
                    ✓
                  </div>
                  <p className="text-sm text-gray-600">{proofPhoto.name}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setProofPhoto(null)}
                    className="mt-2"
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="text-center">
                  <Upload className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                  <div className="flex gap-2 justify-center">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => setProofPhoto(e.target.files?.[0] || null)}
                      className="hidden"
                      id="solution-camera"
                    />
                    <label htmlFor="solution-camera">
                      <Button type="button" size="sm" variant="outline" asChild>
                        <span className="cursor-pointer">
                          <Camera className="w-4 h-4 mr-1" />
                          Camera
                        </span>
                      </Button>
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setProofPhoto(e.target.files?.[0] || null)}
                      className="hidden"
                      id="solution-gallery"
                    />
                    <label htmlFor="solution-gallery">
                      <Button type="button" size="sm" variant="outline" asChild>
                        <span className="cursor-pointer">
                          <Upload className="w-4 h-4 mr-1" />
                          Gallery
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-900">
              Your solution will be reviewed by an admin. Once accepted, you'll receive the XP
              reward!
            </p>
          </div>

          <Button type="submit" className="w-full bg-[#4CAF50] hover:bg-[#388E3C]">
            Submit Solution
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
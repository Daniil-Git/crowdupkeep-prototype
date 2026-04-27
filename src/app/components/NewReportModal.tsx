import { useState } from "react";
import { useNavigate } from "react-router";
import { MapPin, Camera, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Slider } from "./ui/slider";
import { toast } from "sonner";

interface NewReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewReportModal({ open, onOpenChange }: NewReportModalProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState([3]);
  const [photo, setPhoto] = useState<File | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title && description && photo) {
      const xp = difficulty[0] * 50;
      toast.success(`Report submitted! You'll earn ${xp} XP when resolved.`);
      onOpenChange(false);
      // Reset form
      setTitle("");
      setDescription("");
      setDifficulty([3]);
      setPhoto(null);
      setTimeout(() => navigate("/dashboard"), 500);
    } else {
      toast.error("Please fill all fields and add a photo");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[360px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Report</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* GPS Location */}
          <div className="bg-[#E3F2FD] border border-[#1976D2] rounded-lg p-3 flex items-start gap-3">
            <MapPin className="w-5 h-5 text-[#1976D2] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm">Auto-GPS Location</p>
              <p className="text-xs text-gray-600 mt-0.5">
                35.1676°N, 33.3736°E
              </p>
              <p className="text-xs text-green-600 mt-1">✓ 500m radius OK</p>
            </div>
          </div>

          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Brief description of the issue"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Provide more details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1.5"
              rows={3}
            />
          </div>

          <div>
            <Label>Photo</Label>
            <div className="mt-1.5 border-2 border-dashed border-gray-300 rounded-lg p-4">
              {photo ? (
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto rounded-lg bg-[#4CAF50] flex items-center justify-center text-white mb-2">
                    ✓
                  </div>
                  <p className="text-sm text-gray-600">{photo.name}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPhoto(null)}
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
                      onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                      className="hidden"
                      id="report-camera"
                    />
                    <label htmlFor="report-camera">
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
                      onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                      className="hidden"
                      id="report-gallery"
                    />
                    <label htmlFor="report-gallery">
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

          <div>
            <div className="flex justify-between items-center mb-2">
              <Label>Difficulty</Label>
              <span className="text-sm">
                Earn <span className="text-[#4CAF50]">{difficulty[0] * 50} XP</span>
              </span>
            </div>
            <Slider
              value={difficulty}
              onValueChange={setDifficulty}
              min={1}
              max={5}
              step={1}
              className="mt-2"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>4</span>
              <span>5</span>
            </div>
          </div>

          <Button type="submit" className="w-full bg-[#1976D2] hover:bg-[#1565C0]">
            Submit Report
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

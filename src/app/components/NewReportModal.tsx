import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { MapPin, Camera, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Slider } from "./ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from "sonner";
import { LIMASSOL_CENTER, useAppStore } from "../store/appStore";
import { xpFor } from "@/lib/xp";
import {
  ALL_LOCATIONS,
  DISTRICTS,
  DISTRICT_CENTERS,
  type District,
  type LocationFilter,
} from "@/lib/districts";

interface NewReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Resolves the District the report should be auto-linked to. The store's
// global selectedDistrict is the source of truth, but it can be the
// "All Locations" sentinel, in that case we let the user pick a district
// inside the modal so the new pin still lands somewhere matchable.
function defaultDraftDistrict(filter: LocationFilter): District {
  return filter === ALL_LOCATIONS ? "Centre" : filter;
}

export function NewReportModal({ open, onOpenChange }: NewReportModalProps) {
  const navigate = useNavigate();
  const addReport = useAppStore((s) => s.addReport);
  const selectedDistrict = useAppStore((s) => s.selectedDistrict);
  const setSelectedDistrict = useAppStore((s) => s.setSelectedDistrict);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState([3]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [draftDistrict, setDraftDistrict] = useState<District>(() =>
    defaultDraftDistrict(selectedDistrict),
  );

  // Anchor preview: the coordinates and address the new pin will land on.
  // Surfacing this in the modal so the user can tell *before* they submit
  // which neighbourhood the report will be filed under.
  const anchor = useMemo(() => DISTRICT_CENTERS[draftDistrict], [draftDistrict]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setDifficulty([3]);
    setPhoto(null);
    setDraftDistrict(defaultDraftDistrict(selectedDistrict));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !photo) {
      toast.error("Please fill all fields and add a photo");
      return;
    }
    const newReport = addReport({
      title,
      description,
      difficulty: difficulty[0],
      district: draftDistrict,
      photo: null,
    });
    // Snap the global filter to the just-filed district so the citizen
    // sees their own pin without manually re-selecting "All Locations".
    if (selectedDistrict !== ALL_LOCATIONS && selectedDistrict !== draftDistrict) {
      setSelectedDistrict(draftDistrict);
    }
    toast.success(
      `Report filed in ${draftDistrict}. You'll earn ${xpFor(difficulty[0])} XP when resolved.`,
    );
    onOpenChange(false);
    reset();
    setTimeout(() => navigate(`/report/${newReport.id}`), 400);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[360px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Report</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="bg-[#E3F2FD] border border-[#1976D2] rounded-lg p-3 flex items-start gap-3">
            <MapPin className="w-5 h-5 text-[#1976D2] flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm">Filing under {draftDistrict}</p>
              <p className="text-xs text-gray-600 mt-0.5 truncate">{anchor.address}</p>
              <p className="text-xs text-gray-600 mt-0.5">
                {anchor.geometry.lat.toFixed(4)}°N, {anchor.geometry.lng.toFixed(4)}°E
              </p>
              <p className="text-xs text-green-600 mt-1">✓ Within Limassol coverage area</p>
            </div>
          </div>

          <div>
            <Label htmlFor="report-district">District</Label>
            <Select
              value={draftDistrict}
              onValueChange={(v) => setDraftDistrict(v as District)}
            >
              <SelectTrigger id="report-district" className="mt-1.5 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISTRICTS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                Earn <span className="text-[#4CAF50]">{xpFor(difficulty[0])} XP</span>
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

// Re-exported for tests so the same predicate can be exercised as a unit
// without standing up a render tree.
export { defaultDraftDistrict };

// `LIMASSOL_CENTER` is unused in this file now that addReport derives the
// pin from the district anchor. Keep the import of the store re-export so
// `useAppStore` remains the only store binding without a bare import.
void LIMASSOL_CENTER;

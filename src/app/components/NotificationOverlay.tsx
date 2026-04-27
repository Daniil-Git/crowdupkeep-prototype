import { MapPin, X, Clock } from "lucide-react";
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";

interface NotificationOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationOverlay({ open, onOpenChange }: NotificationOverlayProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px] bg-gradient-to-br from-[#FF5722] to-[#F4511E] text-white border-none">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 text-white/90 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="pt-6 pb-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <MapPin className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg">🚨 Nearby Issue!</h3>
              <p className="text-white/90 text-sm">Just 200m away</p>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 mb-4">
            <p className="mb-2">Broken sidewalk needs attention</p>
            <p className="text-sm text-white/80">
              Help resolve this and earn <span className="text-yellow-300">+100 XP bonus</span> for
              proximity!
            </p>
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
              onClick={() => onOpenChange(false)}
              className="flex-1 bg-white text-[#FF5722] hover:bg-white/90"
            >
              View Issue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

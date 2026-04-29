import { MapPin } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useAppStore } from "../store/appStore";
import { LOCATION_OPTIONS, type LocationFilter } from "@/lib/districts";

interface LocationDropdownProps {
  // Visual variant — "header" sits in the dark Dashboard bar,
  // "panel" sits inline in a light card (e.g. Profile).
  variant?: "header" | "panel";
  className?: string;
}

// Reusable dropdown for the "Current Area" filter. Reads / writes the same
// store key so any change propagates instantly to the map markers and the
// Nearby Issue picker — no prop drilling, no page reload.
export function LocationDropdown({ variant = "panel", className = "" }: LocationDropdownProps) {
  const value = useAppStore((s) => s.selectedDistrict);
  const setSelectedDistrict = useAppStore((s) => s.setSelectedDistrict);

  const triggerClass =
    variant === "header"
      ? "h-8 bg-white/10 border-white/30 text-white hover:bg-white/20 backdrop-blur-sm text-sm gap-2"
      : "h-9 text-sm";

  return (
    <Select
      value={value}
      onValueChange={(next) => setSelectedDistrict(next as LocationFilter)}
    >
      <SelectTrigger
        aria-label="Current area"
        className={`${triggerClass} ${className}`.trim()}
      >
        <MapPin className="w-4 h-4 opacity-80" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LOCATION_OPTIONS.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

import { useMemo } from "react";
import { useNavigate } from "react-router";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { Badge } from "./ui/badge";
import { useAppStore, LIMASSOL_CENTER } from "../store/appStore";
import { matchesFilter } from "@/lib/districts";
import { icon as leafletIcon } from "leaflet";

const buildIcon = (color: "red" | "green" | "orange" | "blue") =>
  leafletIcon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

const ICONS = {
  pending: buildIcon("red"),
  "in-progress": buildIcon("orange"),
  solved: buildIcon("green"),
} as const;

export function DashboardMap() {
  const navigate = useNavigate();
  const reports = useAppStore((s) => s.reports);
  const selectedDistrict = useAppStore((s) => s.selectedDistrict);

  const visible = useMemo(
    () => reports.filter((r) => matchesFilter(r.address, selectedDistrict)),
    [reports, selectedDistrict],
  );

  return (
    <MapContainer
      center={[LIMASSOL_CENTER.lat, LIMASSOL_CENTER.lng]}
      zoom={13}
      style={{ height: "100%", width: "100%", zIndex: 0 }}
      scrollWheelZoom
      dragging
      zoomControl
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {visible.map((report) => (
        <Marker
          key={`marker-${report.id}`}
          position={[report.geometry.lat, report.geometry.lng]}
          icon={ICONS[report.status]}
        >
          <Popup>
            <button
              type="button"
              onClick={() => navigate(`/report/${report.id}`)}
              className="text-left"
              style={{ minWidth: 150 }}
            >
              <p style={{ marginBottom: 4 }}>{report.title}</p>
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
              <p style={{ marginTop: 6, fontSize: 11, color: "#1976D2" }}>
                Tap to view details →
              </p>
            </button>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

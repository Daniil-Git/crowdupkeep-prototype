import { useNavigate } from "react-router";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { Badge } from "./ui/badge";
import { useApp } from "../context/AppContext";
import { icon as leafletIcon } from "leaflet";

const redIcon = leafletIcon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const greenIcon = leafletIcon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const orangeIcon = leafletIcon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export function DashboardMap() {
  const navigate = useNavigate();
  const { reports } = useApp();

  return (
    <MapContainer
      center={[35.1676, 33.3736]}
      zoom={13}
      style={{ height: "100%", width: "100%", zIndex: 0 }}
      scrollWheelZoom={true}
      dragging={true}
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {reports.map((report) => {
        const markerIcon =
          report.status === "solved"
            ? greenIcon
            : report.status === "in-progress"
            ? orangeIcon
            : redIcon;

        return (
          <Marker
            key={`marker-${report.id}`}
            position={[report.location.lat, report.location.lng]}
            icon={markerIcon}
            eventHandlers={{
              click: () => {
                navigate(`/report/${report.id}`);
              },
            }}
          >
            <Popup>
              <div style={{ minWidth: "150px" }}>
                <p style={{ marginBottom: "4px" }}>{report.title}</p>
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
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
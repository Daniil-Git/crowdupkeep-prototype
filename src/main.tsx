import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import App from "./app/App";
import "./app/store/devConsole";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(<App />);

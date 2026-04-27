import { useState } from "react";
import { useNavigate } from "react-router";
import { MapPin, Upload } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { toast } from "sonner";

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [idPhoto, setIdPhoto] = useState<File | null>(null);
  const [idModalOpen, setIdModalOpen] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && password) {
      toast.success("Login successful!");
      navigate("/dashboard");
    }
  };

  const handleIDVerification = () => {
    if (idPhoto) {
      setIdModalOpen(false);
      setTimeout(() => {
        toast.success("✓ ID Verified successfully!");
      }, 300);
      setIdPhoto(null);
    } else {
      toast.error("Please upload an ID photo");
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header with map background */}
      <div className="relative h-[280px] bg-gradient-to-br from-[#1976D2] to-[#1565C0] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <MapPin className="absolute top-10 left-10 w-8 h-8 text-white" />
          <MapPin className="absolute bottom-20 right-12 w-6 h-6 text-white" />
          <MapPin className="absolute top-24 right-20 w-10 h-10 text-white" />
        </div>
        <div className="relative z-10 text-center text-white">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <MapPin className="w-12 h-12" />
          </div>
          <h1 className="text-3xl mb-2">CrowdUpKeep</h1>
          <p className="text-white/90">Make your city better</p>
        </div>
      </div>

      {/* Login form */}
      <div className="flex-1 px-6 pt-8 pb-6">
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <Label htmlFor="email">Email or Username</Label>
            <Input
              id="email"
              type="text"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <Button type="submit" className="w-full bg-[#1976D2] hover:bg-[#1565C0] text-white">
            Login
          </Button>
        </form>

        <div className="mt-6 space-y-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full border-[#1976D2] text-[#1976D2]">
                <Upload className="w-4 h-4 mr-2" />
                Verify ID/DOB
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[340px]">
              <DialogHeader>
                <DialogTitle>Verify Identity</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <p className="text-sm text-gray-600">
                  Upload a photo of your ID to verify your identity and date of birth.
                </p>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <Upload className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setIdPhoto(e.target.files?.[0] || null)}
                    className="hidden"
                    id="id-upload"
                  />
                  <label htmlFor="id-upload" className="cursor-pointer">
                    <span className="text-sm text-[#1976D2]">
                      {idPhoto ? idPhoto.name : "Choose file or take photo"}
                    </span>
                  </label>
                </div>
                <Button
                  className="w-full bg-[#1976D2] hover:bg-[#1565C0]"
                  onClick={handleIDVerification}
                >
                  Submit for Verification
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <div className="text-center">
            <span className="text-sm text-gray-600">Don't have an account? </span>
            <button
              onClick={() => navigate("/register")}
              className="text-sm text-[#1976D2]"
            >
              Register
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
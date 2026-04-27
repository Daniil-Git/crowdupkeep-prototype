import { useState } from "react";
import { useNavigate } from "react-router";
import { Camera, Upload } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Progress } from "./ui/progress";
import { toast } from "sonner";

export function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [idPhoto, setIdPhoto] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && username && password && idPhoto) {
      // Simulate progress
      setProgress(0);
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            toast.success("Account created and verified!");
            setTimeout(() => navigate("/"), 1000);
            return 100;
          }
          return prev + 10;
        });
      }, 100);
    } else {
      toast.error("Please fill all fields and upload ID photo");
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-gradient-to-br from-[#4CAF50] to-[#388E3C] px-6 py-8 text-white">
        <button onClick={() => navigate("/")} className="mb-4 text-white/90">
          ← Back to Login
        </button>
        <h1 className="text-2xl mb-1">Create Account</h1>
        <p className="text-white/90 text-sm">Join the community</p>
      </div>

      <div className="px-6 py-8">
        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <Label htmlFor="reg-email">Email</Label>
            <Input
              id="reg-email"
              type="email"
              placeholder="your.email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="reg-username">Username</Label>
            <Input
              id="reg-username"
              type="text"
              placeholder="Choose a username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="reg-password">Password</Label>
            <Input
              id="reg-password"
              type="password"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label>Upload ID/DOB Photo</Label>
            <div className="mt-1.5 border-2 border-dashed border-gray-300 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  {idPhoto ? (
                    <div className="w-16 h-16 rounded-lg bg-[#4CAF50] flex items-center justify-center text-white">
                      ✓
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Camera className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm mb-2">
                    {idPhoto ? idPhoto.name : "No file selected"}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => setIdPhoto(e.target.files?.[0] || null)}
                      className="hidden"
                      id="camera-upload"
                    />
                    <label htmlFor="camera-upload">
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
                      onChange={(e) => setIdPhoto(e.target.files?.[0] || null)}
                      className="hidden"
                      id="gallery-upload"
                    />
                    <label htmlFor="gallery-upload">
                      <Button type="button" size="sm" variant="outline" asChild>
                        <span className="cursor-pointer">
                          <Upload className="w-4 h-4 mr-1" />
                          Gallery
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {progress > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Verifying...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-[#4CAF50] hover:bg-[#388E3C] text-white"
            disabled={progress > 0 && progress < 100}
          >
            Verify & Register
          </Button>
        </form>
      </div>
    </div>
  );
}

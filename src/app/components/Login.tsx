import { useState } from "react";
import { useNavigate } from "react-router";
import { MapPin } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";
import { useAppStore } from "../store/appStore";

// Login is strictly username + password.
//
// The citizen ID is NEVER requested here — it's only used at
// registration to derive the long-lived identityNullifier. The
// loginNullifier is PBKDF2(password, salt + username), so the only
// way to reproduce the credential is to know BOTH fields. There is
// no fast path that bypasses the password (that was the bug this
// version fixes).
//
// In a real product, the store's `login` action would be a thin
// wrapper around POST /auth/session { username, loginNullifier },
// with the server holding the authoritative pair. Here the persisted
// local store stands in for the server; the comparison logic is
// identical in shape.
export function Login() {
  const navigate = useNavigate();
  const login = useAppStore((s) => s.login);
  const cachedUsername = useAppStore((s) => s.username);

  const [username, setUsername] = useState(cachedUsername ?? "");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error("Username and password are both required");
      return;
    }
    setSubmitting(true);
    try {
      const ok = await login({ username, password });
      if (ok) {
        toast.success("Login successful!");
        navigate("/dashboard");
        return;
      }
      // Identical message for "wrong password" and "unknown user" —
      // never disclose which one failed to a caller who might be
      // probing for valid usernames.
      toast.error("Invalid credentials.");
    } finally {
      setSubmitting(false);
      // Wipe the typed password from the form on every attempt — a
      // rejected value should not sit in the input waiting for the
      // user to retry by editing one character.
      setPassword("");
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white">
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

      <div className="flex-1 px-6 pt-8 pb-6">
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="Your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1.5"
              autoComplete="username"
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
              autoComplete="current-password"
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-[#1976D2] hover:bg-[#1565C0] text-white"
            disabled={submitting || !username || !password}
          >
            {submitting ? "Verifying…" : "Login"}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <span className="text-sm text-gray-600">Don't have an account? </span>
          <button onClick={() => navigate("/register")} className="text-sm text-[#1976D2]">
            Register
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";
import { IdentityInput } from "./IdentityInput";
import { useAppStore } from "../store/appStore";
import { CypriotIdFormatError } from "@/lib/cypriotId";

// Register flow rewired to feed the citizen ID through the
// canonicalise-then-PBKDF2 pipeline. The raw ID lives only in
// component-local state inside <IdentityInput />; once valid, the
// canonical 10-digit string is handed to this component via the
// `setCanonical` setter and immediately consumed by `register(...)`
// in the store, which derives the dual nullifiers and discards the
// canonical input.
export function Register() {
  const navigate = useNavigate();
  const register = useAppStore((s) => s.register);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [canonical, setCanonical] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !username || !password || !canonical) {
      toast.error("Please fill all fields and confirm your 10-digit ID");
      return;
    }
    setSubmitting(true);
    try {
      // Password and canonical citizen ID both feed the dual-derivation:
      //   identityNullifier ← PBKDF2(canonicalId, identity-salt)
      //   loginNullifier    ← PBKDF2(password,    login-salt+username)
      // The two are independent — leaking one cannot reveal the other.
      await register({ username, password, rawCitizenId: canonical });
      toast.success("Account created and verified!");
      setTimeout(() => navigate("/dashboard"), 600);
    } catch (err) {
      if (err instanceof CypriotIdFormatError) toast.error(err.message);
      else if (err instanceof Error) toast.error(err.message);
      else toast.error("Registration failed");
    } finally {
      setSubmitting(false);
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

          <IdentityInput
            onCanonicalReady={setCanonical}
            onCanonicalCleared={() => setCanonical(null)}
            disabled={submitting}
          />

          <Button
            type="submit"
            className="w-full bg-[#4CAF50] hover:bg-[#388E3C] text-white"
            disabled={submitting || !canonical}
          >
            {submitting ? "Deriving identity…" : "Verify & Register"}
          </Button>
        </form>
      </div>
    </div>
  );
}

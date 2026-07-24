import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";
import { getApiBase } from "../lib/api";

const API_BASE = getApiBase();


/**
 * Redirector
 *
 * Post-login routing:
 *   - User has a profile  → /dashboard
 *   - No profile yet      → /profile
 *   - Not signed in       → /sign-in
 */
export default function Redirector() {
  const { user, isSignedIn, isLoaded } = useAuthContext();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !user) {
      navigate("/sign-in", { replace: true });
      return;
    }

    const checkProfile = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/profile?user_id=${user.id}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        navigate(data.has_profile ? "/dashboard" : "/profile", {
          replace: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error("Redirector: profile check failed:", err);
        setError(msg);
        // Fall back to profile page so user is never stuck
        setTimeout(() => navigate("/profile", { replace: true }), 2000);
      }
    };

    checkProfile();
  }, [isLoaded, isSignedIn, user, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-orange-50">
        <div className="text-center">
          <p className="text-orange-600 font-medium mb-1">
            Could not load profile — redirecting…
          </p>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-orange-50 via-yellow-50 to-orange-100">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-orange-500 border-t-transparent mx-auto mb-6" />
        <p className="text-lg text-gray-600 font-medium">Setting up your account…</p>
        <p className="text-sm text-gray-400 mt-1">This will only take a moment</p>
      </div>
    </div>
  );
}
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";
import { getApiBase } from "../lib/api";

const SignInPage = () => {
  const { isSignedIn, isLoaded, signIn } = useAuthContext();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate("/redirector", { replace: true });
    }
  }, [isLoaded, isSignedIn, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.detail === "string" ? data.detail : "Login failed"
        );
      }
      signIn({
        id: data.user_id,
        email: data.email,
        name: data.name,
        token: data.access_token,
      });
      navigate("/redirector", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-orange-50 via-yellow-50 to-orange-100 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white shadow-2xl rounded-3xl px-8 py-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-100 rounded-2xl mb-4">
              <span className="text-3xl">₹</span>
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900">CreditSetu</h1>
            <p className="text-gray-500 text-sm mt-1">
              Alternative credit scoring for every Indian
            </p>
          </div>

          <h2 className="text-xl font-bold text-gray-800 mb-1 text-center">Welcome back</h2>
          <p className="text-sm text-gray-500 text-center mb-6">
            Sign in to access your account
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border-2 border-orange-200 focus:border-orange-500 focus:ring focus:ring-orange-200 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border-2 border-orange-200 focus:border-orange-500 focus:ring focus:ring-orange-200 focus:outline-none"
              />
            </div>

            {error && <p className="text-sm text-red-600 text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white py-3 rounded-xl font-semibold transition-colors"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-6">
            Don't have an account?{" "}
            <span
              className="text-orange-600 font-medium cursor-pointer hover:underline"
              onClick={() => navigate("/sign-up")}
            >
              Sign up
            </span>
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Secured with JWT &mdash; Bank of India Initiative
        </p>
      </div>
    </div>
  );
};

export default SignInPage;

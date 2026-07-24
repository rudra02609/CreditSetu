import type { FC } from "react";
import { Button } from "./Button";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";

const LandingPage: FC = () => {
  const navigate = useNavigate();
  const { isSignedIn } = useAuthContext();

  const handleGetStarted = () => {
    if (isSignedIn) {
      navigate("/redirector");
    } else {
      navigate("/sign-in");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-yellow-50 to-orange-100 flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">

      {/* Top-right Admin Login */}
      <div className="absolute top-4 right-6">
        <Button
          label="Login as Admin"
          onClick={() => navigate("/admin-login")}
          variant="outline"
        />
      </div>

      {/* Main content */}
      <div className="text-center z-8 max-w-md mx-auto">
        <div className="mb-4">
          <div className="w-64 h-64 mx-auto mb-4 flex items-center justify-center">
            <img
              src="/src/assets/farmer-logo.jpg"
              alt="Farmer with money"
              className="w-48 h-48 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        </div>

        <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
          Welcome to <span className="text-orange-600">CreditSetu</span>
        </h1>

        <p className="text-xl text-gray-600 mb-12 leading-relaxed">
          Fast, simple and reliable alternative credit scoring for every Indian.
        </p>

        <Button label="Get Started" onClick={handleGetStarted} />
      </div>
    </div>
  );
};

export default LandingPage;

import { Routes, Route, useParams } from "react-router-dom";
import { Toaster } from "./components/ui/toaster";
import { Toaster as Sonner } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthGuard } from "./context/AuthContext";

// User pages
import LandingPage from "./components/LandingPage";
import SignInPage from "./components/SignInPage";
import SignUpPage from "./components/SignUpPage";
import ProfileForm from "./components/ProfileForm";
import Dashboard from "./components/Dashboard";
import Redirector from "./components/Redirector";
import ApplyForm from "./components/ApplyForm";
import BehavioralPsychometricTest from "./components/psychometricTest";
import AadhaarVerification from "./components/AdharVerification";
import Applications from "./components/Applications";
import Support from "./components/Support";
import NotFound from "./components/NotFound";

// Admin pages
import AdminLogin from "./components/AdminLogin";
import AdminDashboard from "./components/AdminDashboard";
import CreditRiskDashboard from "./components/CreditRiskDashboard";

const queryClient = new QueryClient();

/** Extracts :userId param and passes it as userId to the CreditRiskDashboard */
function CreditRiskDashboardWrapper() {
  const { userId } = useParams<{ userId: string }>();
  return <CreditRiskDashboard userId={userId!} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />

        <Routes>
          {/* ── Public ─────────────────────────────────────────── */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/sign-in/*" element={<SignInPage />} />
          <Route path="/sign-up" element={<SignUpPage />} />
          <Route path="/sign-up/*" element={<SignUpPage />} />
          <Route path="/redirector" element={<Redirector />} />

          {/* ── Protected (JWT auth required) ───────────────── */}
          <Route path="/profile" element={<AuthGuard><ProfileForm /></AuthGuard>} />
          <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
          <Route path="/apply" element={<AuthGuard><ApplyForm /></AuthGuard>} />
          <Route path="/psychometric-test" element={<AuthGuard><BehavioralPsychometricTest /></AuthGuard>} />
          <Route path="/applications" element={<AuthGuard><Applications /></AuthGuard>} />
          <Route path="/support" element={<AuthGuard><Support /></AuthGuard>} />
          <Route path="/adhar" element={<AuthGuard><AadhaarVerification onAadhaarExtracted={() => {}} /></AuthGuard>} />
          <Route path="/credit-risk/:userId" element={<AuthGuard><CreditRiskDashboardWrapper /></AuthGuard>} />

          {/* ── Admin (own session management, no AuthGuard) ────── */}
          <Route path="/admin-login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminDashboard />} />

          {/* ── 404 ────────────────────────────────────────────── */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
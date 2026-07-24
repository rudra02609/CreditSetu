import React, { useState, useEffect } from "react";
import { X, TrendingUp, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { getApiBase } from "../lib/api";

const API_BASE = getApiBase();


interface UserData {
  name: string;
  creditScore: number;
  riskTier: string;
  probabilityOfDefault: number;
}

// Used when rendered as a modal (Admin Dashboard)
interface CreditRiskDashboardModalProps {
  userData: UserData;
  onClose: () => void;
  userId?: never;
}

// Used when rendered as a standalone page via /credit-risk/:userId route
interface CreditRiskDashboardRouteProps {
  userId: string;
  userData?: never;
  onClose?: never;
}

type CreditRiskDashboardProps =
  | CreditRiskDashboardModalProps
  | CreditRiskDashboardRouteProps;

const CreditRiskDashboard: React.FC<CreditRiskDashboardProps> = (props) => {
  const [aiReport, setAiReport] = useState<string>("Loading AI report...");
  const [language, setLanguage] = useState("English");
  const [routeUserData, setRouteUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(false);

  const languages = ["English", "Hindi", "Tamil", "Bengali", "Gujarati"];

  // Determine which mode we are in
  const isRouteMode = "userId" in props && !!props.userId;

  // Fetch user data when used as a routed page
  useEffect(() => {
    if (!isRouteMode) return;
    const fetchUserData = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${API_BASE}/admin/applications/${props.userId}`
        );
        if (!res.ok) throw new Error("Failed to fetch user data");
        const data = await res.json();
        const profile = data.profile || {};
        const latestApp = data.applications?.[0];
        const modelOut = latestApp?.model_output || {};
        setRouteUserData({
          name: profile.name || "Unknown",
          creditScore: Math.round(modelOut.alt_cibil_score || modelOut.final_cibil_score || 0),
          riskTier: modelOut.tier || modelOut.final_tier || "N/A",
          probabilityOfDefault: modelOut.pd ?? 0,
        });
      } catch (err) {
        console.error("Error fetching user data for credit risk:", err);
        setAiReport("Failed to load user data.");
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRouteMode]);

  const effectiveUserData = isRouteMode ? routeUserData : props.userData;

  // Load AI report based on user data
  useEffect(() => {
    if (!effectiveUserData) return;
    generateLocalReport(effectiveUserData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserData, language]);

  const generateLocalReport = (data: UserData) => {
    const approvalPct = ((1 - data.probabilityOfDefault) * 100).toFixed(1);
    let report = `Credit Risk Report for ${data.name}\n\n`;
    report += `Credit Score: ${data.creditScore}/1000\n`;
    report += `Risk Tier: ${data.riskTier}\n`;
    report += `Approval Probability: ${approvalPct}%\n\n`;

    if (data.probabilityOfDefault < 0.3) {
      report += "Assessment: LOW RISK — Strong candidate. Recommended for approval.";
    } else if (data.probabilityOfDefault < 0.6) {
      report += "Assessment: MODERATE RISK — Consider additional verification before approval.";
    } else {
      report += "Assessment: HIGH RISK — Requires careful manual review.";
    }
    setAiReport(report);
  };

  const getRiskColor = (tier: string) => {
    const t = tier.toLowerCase();
    if (t.includes("a") || t.includes("low")) return "text-green-600";
    if (t.includes("b") || t.includes("med")) return "text-yellow-600";
    return "text-red-600";
  };

  const content = (
    <div className={isRouteMode ? "min-h-screen bg-gray-50 p-6" : ""}>
      <div className={isRouteMode ? "max-w-4xl mx-auto bg-white rounded-xl shadow-lg" : ""}>
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h1 className="text-2xl font-bold">
            Credit Risk Report
            {effectiveUserData ? ` — ${effectiveUserData.name}` : ""}
          </h1>
          <div className="flex items-center gap-3">
            {/* Language Selector */}
            <div className="flex items-center gap-2">
              <label htmlFor="lang" className="text-sm font-medium">
                Language:
              </label>
              <select
                id="lang"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="border rounded p-1 text-sm"
              >
                {languages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>
            {/* Close button — only in modal mode */}
            {!isRouteMode && props.onClose && (
              <button
                onClick={props.onClose}
                className="p-1 hover:bg-gray-100 rounded-full"
              >
                <X size={24} />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading credit data...</div>
        ) : effectiveUserData ? (
          <>
            {/* Metrics Grid */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                  <h2 className="font-semibold text-blue-900">Credit Score</h2>
                </div>
                <p className="text-3xl font-bold text-blue-700">
                  {effectiveUserData.creditScore}
                  <span className="text-base font-normal text-blue-500">/1000</span>
                </p>
              </div>

              <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <h2 className="font-semibold text-orange-900">Risk Tier</h2>
                </div>
                <p className={`text-3xl font-bold ${getRiskColor(effectiveUserData.riskTier)}`}>
                  {effectiveUserData.riskTier}
                </p>
              </div>

              <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg col-span-1">
                <div className="flex items-center gap-2 mb-2">
                  {effectiveUserData.probabilityOfDefault < 0.4 ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <h2 className="font-semibold text-gray-900">Approval Probability</h2>
                </div>
                <p className="text-3xl font-bold text-gray-700">
                  {((1 - effectiveUserData.probabilityOfDefault) * 100).toFixed(1)}%
                </p>
              </div>
            </div>

            {/* AI Report */}
            <div className="p-6 border-t">
              <h2 className="text-lg font-semibold mb-3">AI Assessment</h2>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-line">
                {aiReport}
              </div>
            </div>
          </>
        ) : (
          <div className="p-12 text-center text-gray-500">No data available.</div>
        )}
      </div>
    </div>
  );

  // In modal mode, wrap in overlay
  if (!isRouteMode) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-screen overflow-y-auto">
          {content}
        </div>
      </div>
    );
  }

  return content;
};

export default CreditRiskDashboard;

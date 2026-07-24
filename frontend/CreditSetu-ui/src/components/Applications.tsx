import { useEffect, useState } from "react";
import { useAuthContext } from "../context/AuthContext";
import { SidebarProvider, SidebarTrigger } from "./ui/sidebar";
import { AppSidebar } from "./dashboard/AppSideBar";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { FileText, Clock, CheckCircle, XCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { getApiBase } from "../lib/api";

const API_BASE = getApiBase();


interface Application {
  created: string;
  status: string;
  raw?: {
    loan_category?: string;
    loan_amount_requested?: number;
  };
  model_output?: {
    final_cibil_score?: number;
    final_tier?: string;
  };
  user_notification?: {
    message: string;
    read: boolean;
    timestamp: string;
  };
  admin_remarks?: string;
}

const Applications = () => {
  const { user } = useAuthContext();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const getEffectiveUserId = (): string => {
    if (user?.id) return user.id;
    return localStorage.getItem("bharatscore_user_id") || "";
  };

  const fetchApplications = async () => {
    const userId = getEffectiveUserId();
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${API_BASE}/user/applications/${userId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setApplications(data.applications || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to load applications: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "pending":
      case "received":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case "rejected":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "issue":
        return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-100 text-green-800 border-green-300">Approved</Badge>;
      case "pending":
      case "received":
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Under Review</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800 border-red-300">Rejected</Badge>;
      case "issue":
        return <Badge className="bg-orange-100 text-orange-800 border-orange-300">Needs Attention</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatLoanCategory = (cat?: string) => {
    if (!cat) return "—";
    return cat.charAt(0).toUpperCase() + cat.slice(1) + " Loan";
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen w-full flex bg-background">
        <AppSidebar />
        <main className="flex-1">
          <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
            <div className="flex items-center">
              <SidebarTrigger className="mr-4" />
              <h1 className="text-xl font-semibold text-foreground">Loan Applications</h1>
            </div>
            <button
              onClick={fetchApplications}
              disabled={loading}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </header>

          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Your Applications</h2>
              <p className="text-muted-foreground">Track the status of your loan applications</p>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <RefreshCw className="animate-spin h-6 w-6 mr-3" />
                Loading your applications...
              </div>
            ) : applications.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-1">No applications yet</h3>
                  <p className="text-muted-foreground text-sm">
                    Submit your first loan application to get started.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {applications.map((app, idx) => (
                  <Card
                    key={idx}
                    className={`hover:shadow-md transition-shadow border ${
                      app.user_notification && !app.user_notification.read
                        ? "border-blue-300 bg-blue-50/30"
                        : "border-border/50"
                    }`}
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(app.status)}
                          <div>
                            <CardTitle className="text-lg">
                              {formatLoanCategory(app.raw?.loan_category)}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                              Applied:{" "}
                              {app.created
                                ? new Date(app.created).toLocaleDateString("en-IN", {
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                  })
                                : "—"}
                            </p>
                          </div>
                        </div>
                        {getStatusBadge(app.status)}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Loan Amount</p>
                          <p className="text-lg font-semibold text-foreground">
                            {app.raw?.loan_amount_requested
                              ? `₹${Number(app.raw.loan_amount_requested).toLocaleString("en-IN")}`
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">CreditSetu</p>
                          <p className="text-lg font-semibold text-foreground">
                            {app.model_output?.final_cibil_score
                              ? Math.round(app.model_output.final_cibil_score)
                              : "Pending"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Risk Tier</p>
                          <p className="text-lg font-semibold text-foreground">
                            {app.model_output?.final_tier || "—"}
                          </p>
                        </div>
                      </div>

                      {/* Admin Notification */}
                      {app.user_notification && (
                        <div
                          className={`mt-4 p-3 rounded-lg border-l-4 text-sm ${
                            app.status === "approved"
                              ? "bg-green-50 border-green-400 text-green-800"
                              : app.status === "rejected"
                              ? "bg-red-50 border-red-400 text-red-800"
                              : app.status === "issue"
                              ? "bg-orange-50 border-orange-400 text-orange-800"
                              : "bg-blue-50 border-blue-400 text-blue-800"
                          }`}
                        >
                          <p className="font-medium mb-1">
                            Update:{" "}
                            {!app.user_notification.read && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                New
                              </span>
                            )}
                          </p>
                          <p>{app.user_notification.message}</p>
                          {app.admin_remarks && (
                            <p className="mt-1 italic text-xs opacity-80">
                              Admin note: {app.admin_remarks}
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Applications;
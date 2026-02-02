import { useState, useEffect, createContext, useContext } from "react";
import { Outlet, NavLink, Navigate, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { 
  Building2, Users, CreditCard, Activity, Shield, LogOut, 
  ChevronLeft, Eye, X, BarChart3
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

// Context for view-as mode
const ViewAsContext = createContext(null);
export const useViewAs = () => useContext(ViewAsContext);

export default function SuperAdminLayout() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [viewAsStatus, setViewAsStatus] = useState({ active: false });
  const [stats, setStats] = useState(null);

  useEffect(() => {
    checkAuthorization();
  }, []);

  const checkAuthorization = async () => {
    try {
      // Try to access super admin stats - will fail if not authorized
      const res = await axios.get(`${API}/api/super-admin/stats`, { withCredentials: true });
      setStats(res.data);
      setAuthorized(true);
      
      // Check view-as status
      const viewAsRes = await axios.get(`${API}/api/super-admin/view-as/status`, { withCredentials: true });
      setViewAsStatus(viewAsRes.data);
    } catch (err) {
      if (err.response?.status === 404 || err.response?.status === 403) {
        setAuthorized(false);
      }
    }
    setLoading(false);
  };

  const exitViewAs = async () => {
    try {
      await axios.post(`${API}/api/super-admin/exit-view-as`, {}, { withCredentials: true });
      setViewAsStatus({ active: false });
      toast.success("Exited view-as mode");
    } catch (err) {
      toast.error("Failed to exit view-as mode");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <Shield className="w-16 h-16 mx-auto mb-4 text-slate-600" />
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-slate-400 mb-4">You don't have permission to access this area.</p>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ChevronLeft className="w-4 h-4 mr-2" />
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const navItems = [
    { path: "/super-admin", label: "Overview", icon: BarChart3, end: true },
    { path: "/super-admin/crm", label: "CRM", icon: Users },
    { path: "/super-admin/bi", label: "Business Intelligence", icon: CreditCard },
    { path: "/super-admin/organizations", label: "Organizations", icon: Building2 },
    { path: "/super-admin/audit", label: "Audit Log", icon: Activity },
  ];

  return (
    <ViewAsContext.Provider value={{ viewAsStatus, setViewAsStatus, exitViewAs }}>
      <div className="min-h-screen bg-slate-900 text-white flex">
        {/* View-As Banner */}
        {viewAsStatus.active && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-black px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              <span className="font-medium">
                Viewing as: <strong>{viewAsStatus.org_name}</strong> (Read-only)
              </span>
            </div>
            <Button size="sm" variant="secondary" onClick={exitViewAs}>
              <X className="w-4 h-4 mr-2" />
              Exit View-As
            </Button>
          </div>
        )}

        {/* Sidebar */}
        <div className={`w-64 bg-slate-800 flex flex-col ${viewAsStatus.active ? "mt-12" : ""}`}>
          {/* Header */}
          <div className="p-6 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-bold text-lg">Super Admin</h1>
                <p className="text-xs text-slate-400">Platform Management</p>
              </div>
            </div>
          </div>

          {/* Stats Quick View */}
          {stats && (
            <div className="p-4 border-b border-slate-700">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-slate-700/50 rounded p-2">
                  <p className="text-2xl font-bold">{stats.organizations?.total || 0}</p>
                  <p className="text-xs text-slate-400">Orgs</p>
                </div>
                <div className="bg-slate-700/50 rounded p-2">
                  <p className="text-2xl font-bold">{stats.total_users || 0}</p>
                  <p className="text-xs text-slate-400">Users</p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {navItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    isActive ? "bg-red-600 text-white" : "text-slate-300 hover:bg-slate-700"
                  }`
                }
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-slate-700">
            <Button 
              variant="outline" 
              className="w-full border-slate-600 text-slate-300 hover:bg-slate-700"
              onClick={() => navigate("/dashboard")}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Exit Super Admin
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className={`flex-1 overflow-auto ${viewAsStatus.active ? "mt-12" : ""}`}>
          <Outlet />
        </div>
      </div>
    </ViewAsContext.Provider>
  );
}

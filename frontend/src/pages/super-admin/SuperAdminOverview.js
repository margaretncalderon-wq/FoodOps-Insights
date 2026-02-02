import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Building2, Users, CreditCard, TrendingUp, Activity, Loader2 } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function SuperAdminOverview() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API}/api/super-admin/stats`, { withCredentials: true });
      setStats(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Platform Overview</h1>
        <p className="text-slate-400">Monitor all organizations and platform metrics</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <p className="text-3xl font-bold">{stats?.organizations?.total || 0}</p>
                <p className="text-sm text-slate-400">Total Organizations</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                <Activity className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-3xl font-bold">{stats?.organizations?.active || 0}</p>
                <p className="text-sm text-slate-400">Active Organizations</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Users className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <p className="text-3xl font-bold">{stats?.total_users || 0}</p>
                <p className="text-sm text-slate-400">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <p className="text-3xl font-bold">{stats?.events_this_month || 0}</p>
                <p className="text-sm text-slate-400">Events This Month</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscriptions by Plan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Subscriptions by Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(stats?.subscriptions_by_plan || {}).map(([plan, count]) => (
                <div key={plan} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      plan === "starter" ? "bg-slate-400" :
                      plan === "professional" ? "bg-amber-400" :
                      "bg-purple-400"
                    }`} />
                    <span className="capitalize">{plan}</span>
                  </div>
                  <span className="font-bold">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Organization Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <span>Active</span>
                </div>
                <span className="font-bold">{stats?.organizations?.active || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <span>Suspended</span>
                </div>
                <span className="font-bold">{stats?.organizations?.suspended || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Shield, Activity, Building2, Users } from "lucide-react";

import { KoraLoader } from "../../components/KoraLoader";
import { API_BASE as API } from "../../utils/api";

export default function GlobalAuditPage() {
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAudit();
  }, []);

  const fetchAudit = async () => {
    try {
      const res = await axios.get(`${API}/api/super-admin/audit?limit=100`, { withCredentials: true });
      setAudit(res.data || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const getActionBadge = (action) => {
    const colors = {
      suspend_org: "bg-red-600",
      reactivate_org: "bg-green-600",
      start_view_as: "bg-blue-600",
      exit_view_as: "bg-slate-600",
      override_subscription: "bg-amber-600",
      reset_usage: "bg-purple-600",
      change_member_role: "bg-cyan-600",
      remove_member: "bg-red-500",
      update_notes: "bg-slate-500",
      grant_super_admin: "bg-red-700"
    };
    return <Badge className={colors[action] || "bg-slate-600"}>{action.replace(/_/g, " ")}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <KoraLoader size={32} />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Global Audit Log</h1>
        <p className="text-slate-400">All super admin actions across the platform</p>
      </div>

      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-400">Timestamp</TableHead>
                <TableHead className="text-slate-400">Admin</TableHead>
                <TableHead className="text-slate-400">Action</TableHead>
                <TableHead className="text-slate-400">Organization</TableHead>
                <TableHead className="text-slate-400">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.map((entry, idx) => (
                <TableRow key={idx} className="border-slate-700">
                  <TableCell className="text-slate-400 text-sm">
                    {new Date(entry.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{entry.admin_name}</p>
                      <p className="text-xs text-slate-400">{entry.admin_email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getActionBadge(entry.action)}
                  </TableCell>
                  <TableCell>
                    {entry.org_name ? (
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400" />
                        <span>{entry.org_name}</span>
                      </div>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-slate-400 max-w-xs truncate">
                    {entry.details && Object.keys(entry.details).length > 0 
                      ? JSON.stringify(entry.details)
                      : "-"}
                  </TableCell>
                </TableRow>
              ))}

              {audit.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-slate-400">
                    No audit entries found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

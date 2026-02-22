import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { toast } from "sonner";
import { 
  Database, 
  AlertTriangle, 
  RefreshCw, 
  Trash2, 
  ArrowRight, 
  Wrench,
  Users,
  Building2,
  FileText,
  Calendar,
  Loader2,
  CheckCircle,
  XCircle,
  Search
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function DataDiagnosticsPage() {
  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  
  // Migration form
  const [sourceCompanyId, setSourceCompanyId] = useState("");
  const [targetCompanyId, setTargetCompanyId] = useState("");
  const [migrationResult, setMigrationResult] = useState(null);
  
  // Company diagnostics
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companyDiagnostics, setCompanyDiagnostics] = useState(null);

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/super-admin/diagnostics`, { withCredentials: true });
      setDiagnostics(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error loading diagnostics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDiagnostics();
  }, [fetchDiagnostics]);

  const fetchCompanyDiagnostics = async () => {
    if (!selectedCompanyId) {
      toast.error("Enter a company ID");
      return;
    }
    setActionLoading("company");
    try {
      const res = await axios.get(`${API}/api/super-admin/diagnostics/company/${selectedCompanyId}`, { withCredentials: true });
      setCompanyDiagnostics(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error loading company diagnostics");
    } finally {
      setActionLoading(null);
    }
  };

  const runMigration = async (dryRun = true) => {
    if (!sourceCompanyId || !targetCompanyId) {
      toast.error("Enter both source and target company IDs");
      return;
    }
    setActionLoading("migrate");
    try {
      const res = await axios.post(`${API}/api/super-admin/repair/migrate-data`, {
        source_company_id: sourceCompanyId,
        target_company_id: targetCompanyId,
        dry_run: dryRun
      }, { withCredentials: true });
      setMigrationResult(res.data);
      if (!dryRun) {
        toast.success("Data migrated successfully!");
        fetchDiagnostics();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Migration error");
    } finally {
      setActionLoading(null);
    }
  };

  const fixClientFields = async (companyId = null, dryRun = true) => {
    setActionLoading("fix-clients");
    try {
      const res = await axios.post(`${API}/api/super-admin/repair/fix-client-fields`, {
        company_id: companyId,
        dry_run: dryRun
      }, { withCredentials: true });
      if (dryRun) {
        toast.info(`Would fix: ${res.data.clients_without_status} status, ${res.data.clients_without_display_name} display names, ${res.data.clients_without_client_type} client types`);
      } else {
        toast.success("Client fields fixed!");
        fetchDiagnostics();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error fixing client fields");
    } finally {
      setActionLoading(null);
    }
  };

  const cleanupNanValues = async (companyId = null, dryRun = true) => {
    setActionLoading("cleanup-nan");
    try {
      const res = await axios.post(`${API}/api/super-admin/repair/cleanup-nan-values`, {
        company_id: companyId,
        dry_run: dryRun
      }, { withCredentials: true });
      if (dryRun) {
        toast.info(`Would check: ${res.data.leads_checked} leads, ${res.data.clients_checked} clients`);
      } else {
        toast.success(`Cleaned ${res.data.leads_cleaned || 0} leads, ${res.data.clients_cleaned || 0} clients`);
        fetchDiagnostics();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error cleaning data");
    } finally {
      setActionLoading(null);
    }
  };

  const deleteOrphanedData = async (dryRun = true) => {
    setActionLoading("delete-orphaned");
    try {
      const res = await axios.delete(`${API}/api/super-admin/repair/delete-orphaned-data?dry_run=${dryRun}`, { withCredentials: true });
      if (dryRun) {
        toast.info(`Would delete: ${res.data.orphaned_clients} clients, ${res.data.orphaned_leads} leads, ${res.data.orphaned_events} events`);
      } else {
        toast.success("Orphaned data deleted!");
        fetchDiagnostics();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error deleting orphaned data");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="w-6 h-6" />
            Data Diagnostics & Repair
          </h1>
          <p className="text-muted-foreground">System-wide data analysis and repair tools</p>
        </div>
        <Button onClick={fetchDiagnostics} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="w-4 h-4" />
              Companies
            </div>
            <p className="text-2xl font-bold">{diagnostics?.summary?.total_companies || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              Users
            </div>
            <p className="text-2xl font-bold">{diagnostics?.summary?.total_users || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              Clients
            </div>
            <p className="text-2xl font-bold">{diagnostics?.summary?.total_clients || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              Leads
            </div>
            <p className="text-2xl font-bold">{diagnostics?.summary?.total_leads || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              Events
            </div>
            <p className="text-2xl font-bold">{diagnostics?.summary?.total_events || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="w-4 h-4" />
              Proposals
            </div>
            <p className="text-2xl font-bold">{diagnostics?.summary?.total_proposals || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="w-4 h-4" />
              Invoices
            </div>
            <p className="text-2xl font-bold">{diagnostics?.summary?.total_invoices || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Issues Alert */}
      {(diagnostics?.issues?.orphaned_clients > 0 || diagnostics?.issues?.orphaned_leads > 0) && (
        <Card className="border-yellow-500">
          <CardHeader>
            <CardTitle className="text-yellow-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Data Issues Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {diagnostics.issues.orphaned_clients > 0 && (
                <li className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  {diagnostics.issues.orphaned_clients} orphaned clients (no valid company)
                </li>
              )}
              {diagnostics.issues.orphaned_leads > 0 && (
                <li className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  {diagnostics.issues.orphaned_leads} orphaned leads (no valid company)
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Data by Company */}
        <Card>
          <CardHeader>
            <CardTitle>Clients by Company (Top 20)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Company ID</th>
                    <th className="text-right py-2">Clients</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnostics?.data_by_company?.clients?.map((item, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="py-2 font-mono text-xs">{item._id}</td>
                      <td className="py-2 text-right font-bold">{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leads by Company (Top 20)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Company ID</th>
                    <th className="text-right py-2">Leads</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnostics?.data_by_company?.leads?.map((item, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="py-2 font-mono text-xs">{item._id}</td>
                      <td className="py-2 text-right font-bold">{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Company Diagnostics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Company Diagnostics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter company_id (e.g., company_abc123)"
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="flex-1"
            />
            <Button onClick={fetchCompanyDiagnostics} disabled={actionLoading === "company"}>
              {actionLoading === "company" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span className="ml-2">Analyze</span>
            </Button>
          </div>
          
          {companyDiagnostics && (
            <div className="bg-gray-50 p-4 rounded-lg space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Company</p>
                  <p className="font-bold">{companyDiagnostics.company?.name || "N/A"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Clients</p>
                  <p className="font-bold">{companyDiagnostics.data_counts?.clients}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Leads</p>
                  <p className="font-bold">{companyDiagnostics.data_counts?.leads}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Events</p>
                  <p className="font-bold">{companyDiagnostics.data_counts?.events}</p>
                </div>
              </div>
              
              {companyDiagnostics.issues?.length > 0 && (
                <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                  <p className="font-bold text-yellow-800 mb-2">Issues Found:</p>
                  <ul className="text-sm text-yellow-700 list-disc pl-5">
                    {companyDiagnostics.issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div>
                <p className="text-sm font-bold mb-2">Users ({companyDiagnostics.users?.length || 0})</p>
                <div className="text-xs space-y-1">
                  {companyDiagnostics.users?.map((user, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className={`px-1 rounded ${user.role === 'owner' ? 'bg-purple-100' : 'bg-gray-100'}`}>
                        {user.role}
                      </span>
                      <span>{user.email}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Repair Tools */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600 flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            Repair Tools (Danger Zone)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Migration Tool */}
          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
            <h4 className="font-bold flex items-center gap-2">
              <ArrowRight className="w-4 h-4" />
              Migrate Data Between Companies
            </h4>
            <p className="text-sm text-muted-foreground">
              Move all data (clients, leads, events) from one company to another.
            </p>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="Source company_id"
                value={sourceCompanyId}
                onChange={(e) => setSourceCompanyId(e.target.value)}
                className="flex-1"
              />
              <ArrowRight className="w-4 h-4 text-gray-400" />
              <Input
                placeholder="Target company_id"
                value={targetCompanyId}
                onChange={(e) => setTargetCompanyId(e.target.value)}
                className="flex-1"
              />
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => runMigration(true)}
                disabled={actionLoading === "migrate"}
              >
                {actionLoading === "migrate" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Preview Migration
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => {
                  if (window.confirm("Are you sure? This will move ALL data from source to target company.")) {
                    runMigration(false);
                  }
                }}
                disabled={actionLoading === "migrate"}
              >
                Execute Migration
              </Button>
            </div>
            {migrationResult && (
              <div className="bg-white p-3 rounded border text-sm font-mono">
                <pre>{JSON.stringify(migrationResult, null, 2)}</pre>
              </div>
            )}
          </div>

          {/* Fix Client Fields */}
          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
            <h4 className="font-bold flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Fix Missing Client Fields
            </h4>
            <p className="text-sm text-muted-foreground">
              Add missing status, display_name, and client_type fields to clients.
            </p>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => fixClientFields(null, true)}
                disabled={actionLoading === "fix-clients"}
              >
                {actionLoading === "fix-clients" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Preview Fix (All Companies)
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => {
                  if (window.confirm("Fix all client records missing fields?")) {
                    fixClientFields(null, false);
                  }
                }}
                disabled={actionLoading === "fix-clients"}
              >
                Execute Fix
              </Button>
            </div>
          </div>

          {/* Cleanup NaN Values */}
          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
            <h4 className="font-bold flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              Cleanup NaN/Invalid Values
            </h4>
            <p className="text-sm text-muted-foreground">
              Remove 'nan' strings and invalid float values from leads and clients.
            </p>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => cleanupNanValues(null, true)}
                disabled={actionLoading === "cleanup-nan"}
              >
                {actionLoading === "cleanup-nan" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Preview Cleanup
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => {
                  if (window.confirm("Clean all invalid values?")) {
                    cleanupNanValues(null, false);
                  }
                }}
                disabled={actionLoading === "cleanup-nan"}
              >
                Execute Cleanup
              </Button>
            </div>
          </div>

          {/* Delete Orphaned Data */}
          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
            <h4 className="font-bold flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              Delete Orphaned Data
            </h4>
            <p className="text-sm text-muted-foreground">
              Remove data not associated with any valid company.
            </p>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => deleteOrphanedData(true)}
                disabled={actionLoading === "delete-orphaned"}
              >
                {actionLoading === "delete-orphaned" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Preview Delete
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => {
                  if (window.confirm("PERMANENTLY delete all orphaned data? This cannot be undone.")) {
                    deleteOrphanedData(false);
                  }
                }}
                disabled={actionLoading === "delete-orphaned"}
              >
                Execute Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

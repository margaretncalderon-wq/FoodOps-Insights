import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Progress } from "../../components/ui/progress";
import { 
  Building2, Search, Filter, ChevronLeft, ChevronRight, 
  Eye, Ban, Check, Users, Calendar, Loader2, RefreshCw
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

export default function OrganizationsListPage() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchOrganizations();
  }, [page, statusFilter, planFilter]);

  const fetchOrganizations = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("page", page);
      params.append("limit", 20);
      if (search) params.append("search", search);
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (planFilter !== "all") params.append("plan", planFilter);

      const res = await axios.get(`${API}/api/super-admin/organizations?${params}`, { withCredentials: true });
      setOrganizations(res.data.organizations || []);
      setTotalPages(res.data.total_pages || 1);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load organizations");
    }
    setLoading(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchOrganizations();
  };

  const getStatusBadge = (org, subscription) => {
    const status = org?.organization?.status || "active";
    const subStatus = subscription?.status;

    if (status === "suspended") {
      return <Badge className="bg-red-600">Suspended</Badge>;
    }
    
    switch(subStatus) {
      case "active": return <Badge className="bg-green-600">Active</Badge>;
      case "trialing": return <Badge className="bg-blue-600">Trialing</Badge>;
      case "past_due": return <Badge className="bg-amber-600">Past Due</Badge>;
      case "canceled": return <Badge variant="secondary">Canceled</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getUsageBar = (current, limit, label) => {
    const percentage = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-slate-300">{label}</span>
          <span className="text-white font-medium">{current}/{limit}</span>
        </div>
        <Progress 
          value={percentage} 
          className={`h-1.5 bg-slate-600 ${percentage >= 80 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"} ${percentage >= 100 ? "[&>div]:bg-red-500" : ""}`}
        />
      </div>
    );
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Organizations</h1>
        <p className="text-slate-400">Manage all organizations on the platform</p>
      </div>

      {/* Filters */}
      <Card className="bg-slate-800 border-slate-700 mb-6">
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search organizations..."
                  className="pl-10 bg-slate-700 border-slate-600"
                />
              </div>
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 bg-slate-700 border-slate-600">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>

            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-40 bg-slate-700 border-slate-600">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="plan_starter">Starter</SelectItem>
                <SelectItem value="plan_professional">Professional</SelectItem>
                <SelectItem value="plan_enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>

            <Button type="submit" variant="secondary">
              <Filter className="w-4 h-4 mr-2" />
              Apply
            </Button>

            <Button type="button" variant="outline" onClick={fetchOrganizations} className="border-slate-600">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Results Count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-400">
          Showing {organizations.length} of {total} organizations
        </p>
      </div>

      {/* Organizations Table */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700 hover:bg-slate-700/50">
                  <TableHead className="text-slate-400">Organization</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                  <TableHead className="text-slate-400">Plan</TableHead>
                  <TableHead className="text-slate-400">Usage</TableHead>
                  <TableHead className="text-slate-400">Members</TableHead>
                  <TableHead className="text-slate-400">Created</TableHead>
                  <TableHead className="text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.map(org => (
                  <TableRow 
                    key={org.organization.company_id} 
                    className="border-slate-700 hover:bg-slate-700/50 cursor-pointer"
                    onClick={() => navigate(`/super-admin/organizations/${org.organization.company_id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-600 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="font-medium text-white">{org.organization.name}</p>
                          <p className="text-xs text-slate-300">{org.organization.company_id}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(org, org.subscription)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize border-slate-500 text-white">
                        {org.plan?.name || "No Plan"}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-48">
                      <div className="space-y-2">
                        {getUsageBar(
                          org.usage?.events_created || 0, 
                          org.limits?.events_per_month || 999,
                          "Events"
                        )}
                        {getUsageBar(
                          org.usage?.active_users || 0,
                          org.limits?.active_users || 999,
                          "Users"
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-white">
                        <Users className="w-4 h-4 text-slate-300" />
                        <span>{org.members_count || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-200 text-sm">
                      {new Date(org.organization.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="text-white hover:text-white hover:bg-slate-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/super-admin/organizations/${org.organization.company_id}`);
                        }}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {organizations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-slate-400">
                      No organizations found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="border-slate-600"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-slate-400">
            Page {page} of {totalPages}
          </span>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="border-slate-600"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

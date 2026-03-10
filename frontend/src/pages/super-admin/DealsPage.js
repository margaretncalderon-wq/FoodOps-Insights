import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";
import { Switch } from "../../components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  Loader2, Plus, Tag, Copy, Check, MoreHorizontal, 
  Pencil, Trash2, History, Building2, Percent, Calendar,
  DollarSign, Users
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function DealsPage() {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState("");

  const [formData, setFormData] = useState({
    deal_name: "",
    deal_code: "",
    company_id: "",
    kora_core_price_monthly: "",
    kora_core_price_annual: "",
    bundle_price_monthly: "",
    bundle_price_annual: "",
    discount_percent: "",
    discount_months: "",
    expires_at: "",
    contact_name: "",
    contact_email: "",
    notes: ""
  });

  useEffect(() => {
    fetchDeals();
    fetchCompanies();
  }, []);

  const fetchDeals = async () => {
    try {
      const res = await axios.get(`${API}/api/super-admin/deals`, { withCredentials: true });
      setDeals(res.data.deals || []);
    } catch (err) {
      toast.error("Error loading deals");
    }
    setLoading(false);
  };

  const fetchCompanies = async () => {
    try {
      const res = await axios.get(`${API}/api/super-admin/organizations`, { withCredentials: true });
      setCompanies(res.data.organizations || []);
    } catch (err) {
      console.error("Error loading companies");
    }
  };

  const resetForm = () => {
    setFormData({
      deal_name: "",
      deal_code: "",
      company_id: "",
      kora_core_price_monthly: "",
      kora_core_price_annual: "",
      bundle_price_monthly: "",
      bundle_price_annual: "",
      discount_percent: "",
      discount_months: "",
      expires_at: "",
      contact_name: "",
      contact_email: "",
      notes: ""
    });
  };

  const handleCreate = async () => {
    if (!formData.deal_name) {
      toast.error("Deal name is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        deal_name: formData.deal_name,
        deal_code: formData.deal_code || undefined,
        company_id: formData.company_id || undefined,
        kora_core_price_monthly: formData.kora_core_price_monthly ? parseFloat(formData.kora_core_price_monthly) : undefined,
        kora_core_price_annual: formData.kora_core_price_annual ? parseFloat(formData.kora_core_price_annual) : undefined,
        bundle_price_monthly: formData.bundle_price_monthly ? parseFloat(formData.bundle_price_monthly) : undefined,
        bundle_price_annual: formData.bundle_price_annual ? parseFloat(formData.bundle_price_annual) : undefined,
        discount_percent: formData.discount_percent ? parseFloat(formData.discount_percent) : undefined,
        discount_months: formData.discount_months ? parseInt(formData.discount_months) : undefined,
        expires_at: formData.expires_at || undefined,
        contact_name: formData.contact_name || undefined,
        contact_email: formData.contact_email || undefined,
        notes: formData.notes || undefined
      };

      await axios.post(`${API}/api/super-admin/deals`, payload, { withCredentials: true });
      toast.success("Deal created successfully");
      setShowCreateModal(false);
      resetForm();
      fetchDeals();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error creating deal");
    }
    setSaving(false);
  };

  const handleUpdate = async () => {
    if (!selectedDeal) return;

    setSaving(true);
    try {
      const payload = {
        deal_name: formData.deal_name || undefined,
        deal_code: formData.deal_code || undefined,
        kora_core_price_monthly: formData.kora_core_price_monthly ? parseFloat(formData.kora_core_price_monthly) : undefined,
        kora_core_price_annual: formData.kora_core_price_annual ? parseFloat(formData.kora_core_price_annual) : undefined,
        bundle_price_monthly: formData.bundle_price_monthly ? parseFloat(formData.bundle_price_monthly) : undefined,
        bundle_price_annual: formData.bundle_price_annual ? parseFloat(formData.bundle_price_annual) : undefined,
        discount_percent: formData.discount_percent ? parseFloat(formData.discount_percent) : undefined,
        discount_months: formData.discount_months ? parseInt(formData.discount_months) : undefined,
        expires_at: formData.expires_at || undefined,
        contact_name: formData.contact_name || undefined,
        contact_email: formData.contact_email || undefined,
        notes: formData.notes || undefined
      };

      await axios.put(`${API}/api/super-admin/deals/${selectedDeal.deal_id}`, payload, { withCredentials: true });
      toast.success("Deal updated");
      setShowEditModal(false);
      setSelectedDeal(null);
      fetchDeals();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error updating deal");
    }
    setSaving(false);
  };

  const handleDelete = async (deal) => {
    if (!window.confirm(`Deactivate deal "${deal.deal_name}"?`)) return;

    try {
      await axios.delete(`${API}/api/super-admin/deals/${deal.deal_id}`, { withCredentials: true });
      toast.success("Deal deactivated");
      fetchDeals();
    } catch (err) {
      toast.error("Error deactivating deal");
    }
  };

  const handleApplyDeal = async () => {
    if (!selectedDeal || !selectedCompany) return;

    setSaving(true);
    try {
      await axios.post(
        `${API}/api/super-admin/deals/${selectedDeal.deal_id}/apply/${selectedCompany}`,
        {},
        { withCredentials: true }
      );
      toast.success("Deal applied successfully");
      setShowApplyModal(false);
      setSelectedDeal(null);
      setSelectedCompany("");
      fetchDeals();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error applying deal");
    }
    setSaving(false);
  };

  const openEditModal = (deal) => {
    setSelectedDeal(deal);
    setFormData({
      deal_name: deal.deal_name || "",
      deal_code: deal.deal_code || "",
      company_id: deal.company_id || "",
      kora_core_price_monthly: deal.kora_core_price_monthly?.toString() || "",
      kora_core_price_annual: deal.kora_core_price_annual?.toString() || "",
      bundle_price_monthly: deal.bundle_price_monthly?.toString() || "",
      bundle_price_annual: deal.bundle_price_annual?.toString() || "",
      discount_percent: deal.discount_percent?.toString() || "",
      discount_months: deal.discount_months?.toString() || "",
      expires_at: deal.expires_at?.split("T")[0] || "",
      contact_name: deal.contact_name || "",
      contact_email: deal.contact_email || "",
      notes: deal.notes || ""
    });
    setShowEditModal(true);
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Custom Deals</h1>
          <p className="text-muted-foreground">Manage custom pricing for negotiations</p>
        </div>
        <Button onClick={() => { resetForm(); setShowCreateModal(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          New Deal
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Tag className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{deals.length}</p>
                <p className="text-sm text-muted-foreground">Total Deals</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Check className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{deals.filter(d => d.is_active).length}</p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Users className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{deals.reduce((sum, d) => sum + (d.times_used || 0), 0)}</p>
                <p className="text-sm text-muted-foreground">Times Used</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Percent className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{deals.filter(d => d.discount_percent).length}</p>
                <p className="text-sm text-muted-foreground">With Discounts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Deals Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Deals</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : deals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Tag className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No deals created yet</p>
              <Button variant="outline" className="mt-4" onClick={() => setShowCreateModal(true)}>
                Create your first deal
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deal Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Pricing</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.map((deal) => (
                  <TableRow key={deal.deal_id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{deal.deal_name}</p>
                        {deal.notes && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{deal.notes}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="px-2 py-1 bg-muted rounded text-sm font-mono">{deal.deal_code}</code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyCode(deal.deal_code)}
                        >
                          {copiedCode === deal.deal_code ? (
                            <Check className="w-3 h-3 text-green-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm space-y-1">
                        {deal.kora_core_price_monthly && (
                          <p>Core: ${deal.kora_core_price_monthly}/mo</p>
                        )}
                        {deal.bundle_price_monthly && (
                          <p>Bundle: ${deal.bundle_price_monthly}/mo</p>
                        )}
                        {!deal.kora_core_price_monthly && !deal.bundle_price_monthly && (
                          <span className="text-muted-foreground">Standard</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {deal.discount_percent ? (
                        <div>
                          <Badge variant="secondary" className="bg-green-100 text-green-700">
                            {deal.discount_percent}% off
                          </Badge>
                          {deal.discount_months && (
                            <p className="text-xs text-muted-foreground mt-1">
                              for {deal.discount_months} months
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {deal.contact_name && <p>{deal.contact_name}</p>}
                        {deal.contact_email && (
                          <p className="text-muted-foreground">{deal.contact_email}</p>
                        )}
                        {!deal.contact_name && !deal.contact_email && (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {deal.is_active ? (
                          <Badge className="bg-green-500">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                        {deal.expires_at && (
                          <span className="text-xs text-muted-foreground">
                            Exp: {formatDate(deal.expires_at)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{deal.times_used || 0}x</Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditModal(deal)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setSelectedDeal(deal);
                            setShowApplyModal(true);
                          }}>
                            <Building2 className="w-4 h-4 mr-2" />
                            Apply to Company
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setSelectedDeal(deal);
                            setShowHistoryModal(true);
                          }}>
                            <History className="w-4 h-4 mr-2" />
                            View History
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => handleDelete(deal)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Deactivate
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Deal Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" />
              Create New Deal
            </DialogTitle>
            <DialogDescription>
              Create a custom pricing deal for negotiation
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Deal Name *</Label>
                <Input
                  value={formData.deal_name}
                  onChange={(e) => setFormData({ ...formData, deal_name: e.target.value })}
                  placeholder="e.g., Enterprise Q1 2026"
                />
              </div>
              <div className="space-y-2">
                <Label>Deal Code (auto-generated if empty)</Label>
                <Input
                  value={formData.deal_code}
                  onChange={(e) => setFormData({ ...formData, deal_code: e.target.value.toUpperCase() })}
                  placeholder="e.g., ENTERPRISE50"
                />
              </div>
            </div>

            {/* Custom Pricing */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Custom Pricing (leave empty for standard)
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Kora Core Monthly</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      type="number"
                      value={formData.kora_core_price_monthly}
                      onChange={(e) => setFormData({ ...formData, kora_core_price_monthly: e.target.value })}
                      className="pl-7"
                      placeholder="69"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Kora Core Annual</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      type="number"
                      value={formData.kora_core_price_annual}
                      onChange={(e) => setFormData({ ...formData, kora_core_price_annual: e.target.value })}
                      className="pl-7"
                      placeholder="59"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Bundle Monthly</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      type="number"
                      value={formData.bundle_price_monthly}
                      onChange={(e) => setFormData({ ...formData, bundle_price_monthly: e.target.value })}
                      className="pl-7"
                      placeholder="39"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Bundle Annual</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      type="number"
                      value={formData.bundle_price_annual}
                      onChange={(e) => setFormData({ ...formData, bundle_price_annual: e.target.value })}
                      className="pl-7"
                      placeholder="33"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Discount */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Percent className="w-4 h-4" />
                Time-Limited Discount
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Discount Percentage</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={formData.discount_percent}
                      onChange={(e) => setFormData({ ...formData, discount_percent: e.target.value })}
                      placeholder="50"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>For How Many Months</Label>
                  <Input
                    type="number"
                    value={formData.discount_months}
                    onChange={(e) => setFormData({ ...formData, discount_months: e.target.value })}
                    placeholder="6"
                  />
                </div>
              </div>
            </div>

            {/* Contact & Expiration */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Contact & Expiration
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contact Name</Label>
                  <Input
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contact Email</Label>
                  <Input
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    placeholder="john@company.com"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Deal Expires On</Label>
                  <Input
                    type="date"
                    value={formData.expires_at}
                    onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Internal Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notes about this deal negotiation..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Create Deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Deal Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              Edit Deal
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Same fields as Create */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Deal Name</Label>
                <Input
                  value={formData.deal_name}
                  onChange={(e) => setFormData({ ...formData, deal_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Deal Code</Label>
                <Input
                  value={formData.deal_code}
                  onChange={(e) => setFormData({ ...formData, deal_code: e.target.value.toUpperCase() })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kora Core Monthly</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    type="number"
                    value={formData.kora_core_price_monthly}
                    onChange={(e) => setFormData({ ...formData, kora_core_price_monthly: e.target.value })}
                    className="pl-7"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Kora Core Annual</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    type="number"
                    value={formData.kora_core_price_annual}
                    onChange={(e) => setFormData({ ...formData, kora_core_price_annual: e.target.value })}
                    className="pl-7"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Discount %</Label>
                <Input
                  type="number"
                  value={formData.discount_percent}
                  onChange={(e) => setFormData({ ...formData, discount_percent: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Discount Months</Label>
                <Input
                  type="number"
                  value={formData.discount_months}
                  onChange={(e) => setFormData({ ...formData, discount_months: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply to Company Modal */}
      <Dialog open={showApplyModal} onOpenChange={setShowApplyModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Apply Deal to Company
            </DialogTitle>
            <DialogDescription>
              Apply "{selectedDeal?.deal_name}" to a company
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Label>Select Company</Label>
            <select
              className="w-full mt-2 p-2 border rounded-md"
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
            >
              <option value="">-- Select Company --</option>
              {companies.map((c) => (
                <option key={c.organization?.company_id || c.company_id} value={c.organization?.company_id || c.company_id}>
                  {c.organization?.name || c.name} ({c.owner_email || c.organization?.billing_email || ''})
                </option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApplyModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplyDeal} disabled={saving || !selectedCompany}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Apply Deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Modal */}
      <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Deal History
            </DialogTitle>
            <DialogDescription>
              {selectedDeal?.deal_name}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 max-h-[400px] overflow-y-auto">
            {selectedDeal?.history?.length > 0 ? (
              <div className="space-y-3">
                {selectedDeal.history.slice().reverse().map((entry, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline">{entry.action}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm">By: {entry.by}</p>
                    {entry.changes && (
                      <ul className="text-xs text-muted-foreground mt-1">
                        {entry.changes.map((c, i) => (
                          <li key={i}>• {c}</li>
                        ))}
                      </ul>
                    )}
                    {entry.company_name && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Company: {entry.company_name}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground">No history available</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHistoryModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

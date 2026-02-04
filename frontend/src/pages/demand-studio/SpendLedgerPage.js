import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { 
  Plus, DollarSign, Trash2, Loader2, Filter,
  TrendingUp, TrendingDown
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const SPEND_TYPES = [
  { value: "media", label: "Media Buy", labelEs: "Compra de Medios" },
  { value: "creative", label: "Creative", labelEs: "Creativo" },
  { value: "agency", label: "Agency Fee", labelEs: "Tarifa de Agencia" },
  { value: "production", label: "Production", labelEs: "Producción" },
  { value: "other", label: "Other", labelEs: "Otro" },
];

const CATEGORIES = [
  { value: "online", label: "Online", labelEs: "Online" },
  { value: "offline", label: "Offline", labelEs: "Offline" },
];

export default function SpendLedgerPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [spendRecords, setSpendRecords] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const [filterCampaign, setFilterCampaign] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  
  const [formData, setFormData] = useState({
    campaign_id: "",
    channel_id: "",
    spend_type: "media",
    category: "online",
    amount: 0,
    spend_date: new Date().toISOString().split('T')[0],
    description: "",
    vendor: "",
    invoice_ref: ""
  });

  useEffect(() => {
    fetchData();
  }, [filterCampaign, filterCategory]);

  const fetchData = async () => {
    try {
      let spendUrl = `${API}/api/demand-studio/spend`;
      const params = [];
      if (filterCampaign !== "all") params.push(`campaign_id=${filterCampaign}`);
      if (filterCategory !== "all") params.push(`category=${filterCategory}`);
      if (params.length) spendUrl += `?${params.join("&")}`;
      
      const [spendRes, campaignsRes, channelsRes] = await Promise.all([
        axios.get(spendUrl, { withCredentials: true }),
        axios.get(`${API}/api/demand-studio/campaigns`, { withCredentials: true }),
        axios.get(`${API}/api/demand-studio/channels`, { withCredentials: true })
      ]);
      setSpendRecords(spendRes.data);
      setCampaigns(campaignsRes.data);
      setChannels(channelsRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const payload = { ...formData };
      if (!payload.channel_id) delete payload.channel_id;
      
      await axios.post(`${API}/api/demand-studio/spend`, payload, { withCredentials: true });
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error("Error saving spend:", error);
    }
  };

  const handleDelete = async (spendId) => {
    if (!window.confirm(isEs ? "¿Eliminar este registro?" : "Delete this record?")) return;
    try {
      await axios.delete(`${API}/api/demand-studio/spend/${spendId}`, { withCredentials: true });
      fetchData();
    } catch (error) {
      console.error("Error deleting spend:", error);
    }
  };

  const resetForm = () => {
    setFormData({
      campaign_id: "",
      channel_id: "",
      spend_type: "media",
      category: "online",
      amount: 0,
      spend_date: new Date().toISOString().split('T')[0],
      description: "",
      vendor: "",
      invoice_ref: ""
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
  };

  const getCampaignName = (campaignId) => {
    const campaign = campaigns.find(c => c.campaign_id === campaignId);
    return campaign ? campaign.name : "-";
  };

  const getChannelName = (channelId) => {
    if (!channelId) return "-";
    const channel = channels.find(c => c.channel_id === channelId);
    return channel ? (channel.channel_name || channel.channel_type) : "-";
  };

  // Calculate totals
  const totalSpend = spendRecords.reduce((sum, r) => sum + r.amount, 0);
  const onlineSpend = spendRecords.filter(r => r.category === "online").reduce((sum, r) => sum + r.amount, 0);
  const offlineSpend = spendRecords.filter(r => r.category === "offline").reduce((sum, r) => sum + r.amount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="spend-ledger-page">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(totalSpend)}</p>
                <p className="text-xs text-muted-foreground">{isEs ? "Gasto Total" : "Total Spend"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(onlineSpend)}</p>
                <p className="text-xs text-muted-foreground">Online</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(offlineSpend)}</p>
                <p className="text-xs text-muted-foreground">Offline</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          <Select value={filterCampaign} onValueChange={setFilterCampaign}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={isEs ? "Campaña" : "Campaign"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEs ? "Todas" : "All"}</SelectItem>
              {campaigns.map(c => (
                <SelectItem key={c.campaign_id} value={c.campaign_id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder={isEs ? "Categoría" : "Category"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEs ? "Todas" : "All"}</SelectItem>
              {CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value}>{isEs ? c.labelEs : c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          {isEs ? "Registrar Gasto" : "Record Spend"}
        </Button>
      </div>

      {/* Spend Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                <TableHead>{isEs ? "Campaña" : "Campaign"}</TableHead>
                <TableHead>{isEs ? "Canal" : "Channel"}</TableHead>
                <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                <TableHead>{isEs ? "Categoría" : "Category"}</TableHead>
                <TableHead>{isEs ? "Proveedor" : "Vendor"}</TableHead>
                <TableHead className="text-right">{isEs ? "Monto" : "Amount"}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {spendRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay registros de gastos" : "No spend records"}
                  </TableCell>
                </TableRow>
              ) : (
                spendRecords.map(record => (
                  <TableRow key={record.spend_id}>
                    <TableCell>{record.spend_date}</TableCell>
                    <TableCell>{getCampaignName(record.campaign_id)}</TableCell>
                    <TableCell>{getChannelName(record.channel_id)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {SPEND_TYPES.find(t => t.value === record.spend_type)?.[isEs ? 'labelEs' : 'label'] || record.spend_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={record.category === "online" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"}>
                        {record.category}
                      </Badge>
                    </TableCell>
                    <TableCell>{record.vendor || "-"}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(record.amount)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(record.spend_id)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Record Spend Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEs ? "Registrar Gasto" : "Record Spend"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{isEs ? "Campaña" : "Campaign"} *</label>
              <Select 
                value={formData.campaign_id || "none"} 
                onValueChange={(v) => setFormData({ ...formData, campaign_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar campaña" : "Select campaign"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Seleccionar..." : "Select..."}</SelectItem>
                  {campaigns.map(c => (
                    <SelectItem key={c.campaign_id} value={c.campaign_id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Canal (opcional)" : "Channel (optional)"}</label>
              <Select 
                value={formData.channel_id || "none"} 
                onValueChange={(v) => setFormData({ ...formData, channel_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar canal" : "Select channel"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Sin canal" : "No channel"}</SelectItem>
                  {channels.filter(c => !formData.campaign_id || c.campaign_id === formData.campaign_id).map(c => (
                    <SelectItem key={c.channel_id} value={c.channel_id}>
                      {c.channel_name || c.channel_type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Tipo" : "Type"}</label>
                <Select 
                  value={formData.spend_type} 
                  onValueChange={(v) => setFormData({ ...formData, spend_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPEND_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{isEs ? t.labelEs : t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Categoría" : "Category"}</label>
                <Select 
                  value={formData.category} 
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{isEs ? c.labelEs : c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Monto" : "Amount"} *</label>
                <Input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Fecha" : "Date"}</label>
                <Input
                  type="date"
                  value={formData.spend_date}
                  onChange={(e) => setFormData({ ...formData, spend_date: e.target.value })}
                />
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Proveedor" : "Vendor"}</label>
              <Input
                value={formData.vendor}
                onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                placeholder={isEs ? "Nombre del proveedor" : "Vendor name"}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Descripción" : "Description"}</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={isEs ? "Descripción del gasto" : "Spend description"}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Ref. Factura" : "Invoice Ref"}</label>
              <Input
                value={formData.invoice_ref}
                onChange={(e) => setFormData({ ...formData, invoice_ref: e.target.value })}
                placeholder={isEs ? "Número de factura" : "Invoice number"}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSave} disabled={!formData.campaign_id || !formData.amount}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search, User, Mail, Phone, Building2, MoreHorizontal, Trash2, Edit } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PIPELINE_STAGES = ["lead", "contacted", "proposal", "negotiation", "won", "lost"];

export default function CRMPage() {
  const { t, language } = useLanguage();
  const [clients, setClients] = useState([]);
  const [pipeline, setPipeline] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [viewMode, setViewMode] = useState("list"); // list or pipeline
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company_name: "",
    address: "",
    notes: "",
    pipeline_stage: "lead",
    tags: [],
  });

  useEffect(() => {
    fetchClients();
    fetchPipeline();
  }, []);

  const fetchClients = async () => {
    try {
      const response = await axios.get(`${API}/crm/clients`, { withCredentials: true });
      setClients(response.data);
    } catch (error) {
      console.error("Failed to fetch clients:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPipeline = async () => {
    try {
      const response = await axios.get(`${API}/crm/pipeline`, { withCredentials: true });
      setPipeline(response.data);
    } catch (error) {
      console.error("Failed to fetch pipeline:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingClient) {
        await axios.put(`${API}/crm/clients/${editingClient.client_id}`, formData, {
          withCredentials: true,
        });
        toast.success(language === "es" ? "Cliente actualizado" : "Client updated");
      } else {
        await axios.post(`${API}/crm/clients`, formData, { withCredentials: true });
        toast.success(language === "es" ? "Cliente creado" : "Client created");
      }
      fetchClients();
      fetchPipeline();
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save client");
    }
  };

  const handleDelete = async (clientId) => {
    if (!confirm(language === "es" ? "¿Eliminar cliente?" : "Delete client?")) return;
    try {
      await axios.delete(`${API}/crm/clients/${clientId}`, { withCredentials: true });
      toast.success(language === "es" ? "Cliente eliminado" : "Client deleted");
      fetchClients();
      fetchPipeline();
    } catch (error) {
      toast.error("Failed to delete client");
    }
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      email: client.email || "",
      phone: client.phone || "",
      company_name: client.company_name || "",
      address: client.address || "",
      notes: client.notes || "",
      pipeline_stage: client.pipeline_stage,
      tags: client.tags || [],
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingClient(null);
    setFormData({
      name: "",
      email: "",
      phone: "",
      company_name: "",
      address: "",
      notes: "",
      pipeline_stage: "lead",
      tags: [],
    });
  };

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stageColors = {
    lead: "bg-muted text-muted-foreground",
    contacted: "bg-info/10 text-info",
    proposal: "bg-warning/10 text-warning",
    negotiation: "bg-primary/10 text-primary",
    won: "bg-success/10 text-success",
    lost: "bg-destructive/10 text-destructive",
  };

  return (
    <Layout>
      <div className="space-y-6" data-testid="crm-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">{t("crm")}</h1>
            <p className="text-muted-foreground mt-1">{t("clients")}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-muted rounded-lg p-1">
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
              >
                {language === "es" ? "Lista" : "List"}
              </Button>
              <Button
                variant={viewMode === "pipeline" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("pipeline")}
              >
                Pipeline
              </Button>
            </div>
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="rounded-full gap-2" data-testid="add-client-btn">
                  <Plus className="w-4 h-4" />
                  {t("addClient")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="font-heading">
                    {editingClient ? t("edit") : t("addClient")}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("name")} *</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        data-testid="client-name-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("email")}</Label>
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        data-testid="client-email-input"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("phone")}</Label>
                      <Input
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("companyName")}</Label>
                      <Input
                        value={formData.company_name}
                        onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("pipelineStage")}</Label>
                    <Select
                      value={formData.pipeline_stage}
                      onValueChange={(value) => setFormData({ ...formData, pipeline_stage: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PIPELINE_STAGES.map((stage) => (
                          <SelectItem key={stage} value={stage}>
                            {t(stage)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("address")}</Label>
                    <Input
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("notes")}</Label>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      {t("cancel")}
                    </Button>
                    <Button type="submit" data-testid="save-client-btn">
                      {t("save")}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="client-search-input"
          />
        </div>

        {/* List View */}
        {viewMode === "list" && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-4 font-medium">{t("name")}</th>
                      <th className="text-left p-4 font-medium">{t("email")}</th>
                      <th className="text-left p-4 font-medium">{t("phone")}</th>
                      <th className="text-left p-4 font-medium">{t("status")}</th>
                      <th className="text-left p-4 font-medium">{t("eventsCount")}</th>
                      <th className="text-right p-4 font-medium">{t("actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map((client) => (
                      <tr
                        key={client.client_id}
                        className="border-b hover:bg-muted/30 transition-colors"
                        data-testid={`client-row-${client.client_id}`}
                      >
                        <td className="p-4">
                          <Link
                            to={`/crm/${client.client_id}`}
                            className="flex items-center gap-3 hover:text-primary"
                          >
                            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                              <User className="w-5 h-5 text-secondary-foreground" />
                            </div>
                            <div>
                              <p className="font-medium">{client.name}</p>
                              {client.company_name && (
                                <p className="text-sm text-muted-foreground">{client.company_name}</p>
                              )}
                            </div>
                          </Link>
                        </td>
                        <td className="p-4 text-muted-foreground">{client.email || "-"}</td>
                        <td className="p-4 text-muted-foreground">{client.phone || "-"}</td>
                        <td className="p-4">
                          <Badge className={stageColors[client.pipeline_stage]}>
                            {t(client.pipeline_stage)}
                          </Badge>
                        </td>
                        <td className="p-4">{client.events_count}</td>
                        <td className="p-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(client)}>
                                <Edit className="w-4 h-4 mr-2" />
                                {t("edit")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(client.client_id)}
                                className="text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                {t("delete")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                    {filteredClients.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          {t("noResults")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pipeline View */}
        {viewMode === "pipeline" && (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {PIPELINE_STAGES.map((stage) => (
              <div key={stage} className="flex-shrink-0 w-72">
                <div className="bg-muted/50 rounded-t-lg p-3 flex items-center justify-between">
                  <span className="font-medium">{t(stage)}</span>
                  <Badge variant="outline">{pipeline[stage]?.length || 0}</Badge>
                </div>
                <div className="bg-muted/30 rounded-b-lg p-2 min-h-[400px] space-y-2">
                  {pipeline[stage]?.map((client) => (
                    <Link
                      key={client.client_id}
                      to={`/crm/${client.client_id}`}
                      className="block"
                    >
                      <Card className="hover:shadow-card transition-all">
                        <CardContent className="p-4">
                          <p className="font-medium">{client.name}</p>
                          {client.email && (
                            <p className="text-sm text-muted-foreground truncate">{client.email}</p>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

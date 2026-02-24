// components/collaboration/SharedEntitiesList.js
// Component to view and manage shared entities (sent/received)

import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import {
  Share2,
  Users,
  FolderKanban,
  Target,
  XCircle,
  Eye,
  MessageSquare,
  PenLine,
  Edit,
  Clock,
  Building2,
  Loader2
} from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";

const API = process.env.REACT_APP_BACKEND_URL;

const PERMISSION_ICONS = {
  view: Eye,
  comment: MessageSquare,
  create: PenLine,
  edit: Edit
};

const PERMISSION_LABELS = {
  view: { en: "View", es: "Ver" },
  comment: { en: "Comment", es: "Comentar" },
  create: { en: "Create", es: "Crear" },
  edit: { en: "Edit", es: "Editar" }
};

export default function SharedEntitiesList() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [sentShares, setSentShares] = useState([]);
  const [receivedShares, setReceivedShares] = useState([]);
  const [revoking, setRevoking] = useState(null);

  useEffect(() => {
    fetchShares();
  }, []);

  const fetchShares = async () => {
    try {
      const [sentRes, receivedRes] = await Promise.all([
        axios.get(`${API}/api/share/sent`, { withCredentials: true }),
        axios.get(`${API}/api/share/received`, { withCredentials: true })
      ]);
      setSentShares(sentRes.data || []);
      setReceivedShares(receivedRes.data || []);
    } catch (error) {
      console.error("Error fetching shares:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (shareId) => {
    setRevoking(shareId);
    try {
      await axios.post(`${API}/api/share/${shareId}/revoke`, {}, { withCredentials: true });
      toast.success(isEs ? "Acceso revocado" : "Access revoked");
      fetchShares();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error revoking access");
    } finally {
      setRevoking(null);
    }
  };

  const getEntityIcon = (entityType) => {
    return entityType === "project" ? FolderKanban : Target;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString(isEs ? "es-ES" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="w-5 h-5" />
          {isEs ? "Colaboración entre Organizaciones" : "Cross-Organization Collaboration"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="received">
          <TabsList className="mb-4">
            <TabsTrigger value="received" className="gap-2">
              <Users className="w-4 h-4" />
              {isEs ? "Compartido Conmigo" : "Shared With Me"} ({receivedShares.filter(s => s.status === "active").length})
            </TabsTrigger>
            <TabsTrigger value="sent" className="gap-2">
              <Share2 className="w-4 h-4" />
              {isEs ? "Compartido por Mí" : "Shared By Me"} ({sentShares.filter(s => s.status === "active").length})
            </TabsTrigger>
          </TabsList>

          {/* Received Shares */}
          <TabsContent value="received">
            {receivedShares.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{isEs ? "No hay entidades compartidas contigo" : "No entities shared with you"}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {receivedShares.map(share => {
                  const EntityIcon = getEntityIcon(share.entity_type);
                  const PermIcon = PERMISSION_ICONS[share.permission_level] || Eye;
                  const isActive = share.status === "active";
                  
                  return (
                    <div 
                      key={share.share_id} 
                      className={`p-4 border rounded-lg ${isActive ? "bg-card" : "bg-muted/50 opacity-60"}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-purple-500/10 rounded-lg">
                            <EntityIcon className="w-5 h-5 text-purple-500" />
                          </div>
                          <div>
                            <h4 className="font-medium">{share.entity_name}</h4>
                            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                              <Building2 className="w-3 h-3" />
                              <span>{share.source_org_name}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={isActive ? "default" : "secondary"} className="gap-1">
                            <PermIcon className="w-3 h-3" />
                            {PERMISSION_LABELS[share.permission_level]?.[isEs ? "es" : "en"] || share.permission_level}
                          </Badge>
                          <Badge variant={isActive ? "outline" : "secondary"}>
                            {isActive 
                              ? (isEs ? "Activo" : "Active") 
                              : (isEs ? "Revocado" : "Revoked")}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(share.created_at)}
                        </span>
                        <span>
                          {isEs ? "Alcance" : "Scope"}: {share.scope?.join(", ")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Sent Shares */}
          <TabsContent value="sent">
            {sentShares.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Share2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{isEs ? "No has compartido nada aún" : "You haven't shared anything yet"}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sentShares.map(share => {
                  const EntityIcon = getEntityIcon(share.entity_type);
                  const PermIcon = PERMISSION_ICONS[share.permission_level] || Eye;
                  const isActive = share.status === "active";
                  
                  return (
                    <div 
                      key={share.share_id} 
                      className={`p-4 border rounded-lg ${isActive ? "bg-card" : "bg-muted/50 opacity-60"}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-blue-500/10 rounded-lg">
                            <EntityIcon className="w-5 h-5 text-blue-500" />
                          </div>
                          <div>
                            <h4 className="font-medium">{share.entity_name}</h4>
                            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                              <Users className="w-3 h-3" />
                              <span>{isEs ? "Compartido con" : "Shared with"}: {share.target_org_name}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="gap-1">
                            <PermIcon className="w-3 h-3" />
                            {PERMISSION_LABELS[share.permission_level]?.[isEs ? "es" : "en"] || share.permission_level}
                          </Badge>
                          {isActive ? (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => handleRevoke(share.share_id)}
                              disabled={revoking === share.share_id}
                            >
                              {revoking === share.share_id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <XCircle className="w-4 h-4 mr-1" />
                                  {isEs ? "Revocar" : "Revoke"}
                                </>
                              )}
                            </Button>
                          ) : (
                            <Badge variant="secondary">
                              {isEs ? "Revocado" : "Revoked"}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(share.created_at)}
                        </span>
                        <span>
                          {isEs ? "Por" : "By"}: {share.created_by_user_name}
                        </span>
                        {share.revoked_at && (
                          <span className="text-red-500">
                            {isEs ? "Revocado" : "Revoked"}: {formatDate(share.revoked_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

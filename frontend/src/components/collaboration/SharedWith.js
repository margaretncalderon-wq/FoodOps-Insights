// components/collaboration/SharedWith.js
// Component to display who an entity is shared with and allow revoking access

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { 
  Users, 
  Building2, 
  X, 
  Loader2, 
  Eye, 
  MessageSquare, 
  Plus, 
  Edit3,
  ChevronDown,
  ChevronUp,
  Shield
} from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { formatDateOnly } from "../../utils/dates";

const API = process.env.REACT_APP_BACKEND_URL;

const PERMISSION_LABELS = {
  view: { en: "View Only", es: "Solo Ver", icon: Eye },
  comment: { en: "Comment", es: "Comentar", icon: MessageSquare },
  create: { en: "Create Items", es: "Crear Elementos", icon: Plus },
  edit: { en: "Full Edit", es: "Edición Completa", icon: Edit3 },
};

export default function SharedWith({ 
  entityType, // "project" | "campaign"
  entityId,
  entityName,
  isOwner = false, // Only owner org can see/manage shares
  onShareRevoked 
}) {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(false);
  const [shares, setShares] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [shareToRevoke, setShareToRevoke] = useState(null);
  const [revoking, setRevoking] = useState(false);

  const fetchShares = useCallback(async () => {
    if (!isOwner) return; // Only owner can view shares
    
    setLoading(true);
    try {
      const response = await axios.get(`${API}/api/share/sent`, { withCredentials: true });
      // Filter shares for this specific entity
      const entityShares = (response.data || []).filter(
        share => share.entity_type === entityType && 
                 share.entity_id === entityId &&
                 share.status === "active"
      );
      setShares(entityShares);
    } catch (error) {
      console.error("Error fetching shares:", error);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, isOwner]);

  useEffect(() => {
    if (isOwner) {
      fetchShares();
    }
  }, [fetchShares, isOwner]);

  const handleRevokeClick = (share) => {
    setShareToRevoke(share);
    setRevokeDialogOpen(true);
  };

  const handleConfirmRevoke = async () => {
    if (!shareToRevoke) return;
    
    setRevoking(true);
    try {
      await axios.post(
        `${API}/api/share/${shareToRevoke.share_id}/revoke`, 
        {}, 
        { withCredentials: true }
      );
      toast.success(isEs ? "Acceso revocado" : "Access revoked");
      setRevokeDialogOpen(false);
      setShareToRevoke(null);
      fetchShares();
      if (onShareRevoked) onShareRevoked();
    } catch (error) {
      const msg = error.response?.data?.detail || (isEs ? "Error al revocar" : "Error revoking access");
      toast.error(msg);
    } finally {
      setRevoking(false);
    }
  };

  // Don't render anything if not owner or no shares
  if (!isOwner || shares.length === 0) {
    return null;
  }

  return (
    <>
      <div 
        className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 mt-4"
        data-testid="shared-with-section"
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-foreground">
              {isEs ? "Compartido con" : "Shared with"} 
              <Badge variant="outline" className="ml-2 text-purple-400 border-purple-400">
                {shares.length} {shares.length === 1 ? (isEs ? "org" : "org") : (isEs ? "orgs" : "orgs")}
              </Badge>
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {expanded && (
          <div className="mt-3 space-y-2">
            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              shares.map((share) => {
                const permLabel = PERMISSION_LABELS[share.permission_level] || PERMISSION_LABELS.view;
                const PermIcon = permLabel.icon;
                
                return (
                  <div 
                    key={share.share_id}
                    className="flex items-center justify-between bg-background/50 rounded-lg p-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {share.target_org_name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <PermIcon className="w-3 h-3" />
                          <span>{isEs ? permLabel.es : permLabel.en}</span>
                          <span>•</span>
                          <span>{formatDateOnly(share.created_at, language)}</span>
                        </div>
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevokeClick(share)}
                      className="text-red-400 hover:text-red-500 hover:bg-red-500/10"
                      data-testid={`revoke-share-${share.share_id}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-500" />
              {isEs ? "Revocar Acceso" : "Revoke Access"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isEs 
                ? `¿Estás seguro de que deseas revocar el acceso de "${shareToRevoke?.target_org_name}" a este ${entityType === "project" ? "proyecto" : "campaña"}? Esta acción no se puede deshacer.`
                : `Are you sure you want to revoke "${shareToRevoke?.target_org_name}"'s access to this ${entityType}? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>
              {isEs ? "Cancelar" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmRevoke}
              className="bg-red-500 hover:bg-red-600"
              disabled={revoking}
            >
              {revoking && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEs ? "Revocar" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

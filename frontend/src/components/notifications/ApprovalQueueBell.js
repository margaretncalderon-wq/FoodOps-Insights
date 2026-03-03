// components/notifications/ApprovalQueueBell.js - Approval queue badge in header
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { ClipboardList, Loader2, CheckCircle, ThumbsUp, ThumbsDown, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

export default function ApprovalQueueBell() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [pendingItems, setPendingItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchPending = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/agency/pending-approvals`, { withCredentials: true });
      setPendingItems(res.data.pending || []);
    } catch (err) {
      // Silently fail - user might not have any collaborations
      console.debug("No pending approvals or not authorized");
    }
  }, []);

  useEffect(() => {
    fetchPending();
    // Poll every 2 minutes
    const interval = setInterval(fetchPending, 120000);
    return () => clearInterval(interval);
  }, [fetchPending]);

  const handleApprove = async (postId, companyId) => {
    setLoading(true);
    try {
      await axios.post(`${API}/api/org/switch/${companyId}`, {}, { withCredentials: true });
      await axios.patch(`${API}/api/demand-studio/social/posts/${postId}`, {
        status: "scheduled",
        needs_approval: false
      }, { withCredentials: true });
      toast.success(isEs ? "Post aprobado" : "Post approved");
      fetchPending();
    } catch (err) {
      toast.error(isEs ? "Error al aprobar" : "Error approving");
    }
    setLoading(false);
  };

  const handleReject = async (postId, companyId) => {
    setLoading(true);
    try {
      await axios.post(`${API}/api/org/switch/${companyId}`, {}, { withCredentials: true });
      await axios.patch(`${API}/api/demand-studio/social/posts/${postId}`, {
        status: "draft",
        needs_approval: false,
        rejection_note: isEs ? "Rechazado" : "Rejected"
      }, { withCredentials: true });
      toast.success(isEs ? "Post rechazado" : "Post rejected");
      fetchPending();
    } catch (err) {
      toast.error(isEs ? "Error al rechazar" : "Error rejecting");
    }
    setLoading(false);
  };

  // Don't show if no pending items
  if (pendingItems.length === 0) {
    return null;
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className="relative text-white/70 hover:text-white hover:bg-white/10"
          data-testid="approval-queue-bell"
        >
          <ClipboardList className="w-5 h-5" />
          {pendingItems.length > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px]"
            >
              {pendingItems.length > 9 ? "9+" : pendingItems.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        <div className="p-3 border-b">
          <h4 className="font-semibold text-sm">
            {isEs ? "Cola de Aprobación" : "Approval Queue"}
          </h4>
          <p className="text-xs text-muted-foreground">
            {pendingItems.length} {isEs ? "posts pendientes" : "pending posts"}
          </p>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <div className="divide-y">
            {pendingItems.slice(0, 5).map((post) => (
              <div key={post.post_id} className="p-3">
                <div className="flex items-start gap-2 mb-2">
                  {post.company_logo ? (
                    <img src={post.company_logo} alt="" className="w-6 h-6 rounded" />
                  ) : (
                    <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">
                        {post.company_name?.[0]?.toUpperCase() || "?"}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{post.company_name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {post.caption || (isEs ? "Sin caption" : "No caption")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-7 text-xs"
                    onClick={() => handleReject(post.post_id, post.company_id)}
                  >
                    <ThumbsDown className="w-3 h-3 mr-1" />
                    {isEs ? "Rechazar" : "Reject"}
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 h-7 text-xs"
                    onClick={() => handleApprove(post.post_id, post.company_id)}
                  >
                    <ThumbsUp className="w-3 h-3 mr-1" />
                    {isEs ? "Aprobar" : "Approve"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {pendingItems.length > 5 && (
          <div className="p-2 border-t">
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full text-xs"
              onClick={() => {
                setOpen(false);
                navigate("/demand-studio/agency");
              }}
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              {isEs ? `Ver todos (${pendingItems.length})` : `View all (${pendingItems.length})`}
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

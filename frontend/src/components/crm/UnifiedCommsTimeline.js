// components/crm/UnifiedCommsTimeline.js - Unified communications timeline (manual logs + channel messages)
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { API_BASE as API } from "../../utils/api";

// UI Components
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { toast } from "sonner";
import RichTextEditor from "../ui/RichTextEditor";

// Icons
import {
  Phone, Mail, Video, FileText, MessageSquare, Plus, 
  ChevronDown, ChevronUp, ExternalLink, RefreshCw,
  Instagram, Send, ArrowUpRight, ArrowDownLeft,
  MessageCircle, Calendar, StickyNote
} from "lucide-react";

// Communication types for manual logging
const MANUAL_COMM_TYPES = [
  { value: "call", label: "Call", labelEs: "Llamada", icon: Phone },
  { value: "email", label: "Email", labelEs: "Email", icon: Mail },
  { value: "meeting", label: "Meeting", labelEs: "Reunión", icon: Video },
  { value: "note", label: "Note", labelEs: "Nota", icon: FileText },
  { value: "message", label: "Message", labelEs: "Mensaje", icon: MessageSquare },
];

// Channel provider icons
const ChannelIcon = ({ provider, className = "w-3 h-3" }) => {
  const icons = {
    whatsapp: <Phone className={className} />,
    email: <Mail className={className} />,
    instagram: <Instagram className={className} />,
    facebook: <MessageCircle className={className} />,
    manual: <MessageSquare className={className} />
  };
  return icons[provider] || <MessageSquare className={className} />;
};

// Provider colors
const providerColors = {
  whatsapp: "bg-green-100 text-green-700 border-green-200",
  email: "bg-blue-100 text-blue-700 border-blue-200",
  instagram: "bg-pink-100 text-pink-700 border-pink-200",
  facebook: "bg-indigo-100 text-indigo-700 border-indigo-200",
  manual: "bg-purple-100 text-purple-700 border-purple-200",
  // Manual log types
  call: "bg-amber-100 text-amber-700 border-amber-200",
  meeting: "bg-teal-100 text-teal-700 border-teal-200",
  note: "bg-gray-100 text-gray-700 border-gray-200",
  message: "bg-violet-100 text-violet-700 border-violet-200",
};

export default function UnifiedCommsTimeline({ 
  entityType, // "lead" or "client"
  entityId, 
  entityName,
  maxVisible = 5 
}) {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const isEs = language === "es";

  // State
  const [allComms, setAllComms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  
  // Form for manual log
  const [form, setForm] = useState({
    comm_type: "call",
    direction: "outbound",
    subject: "",
    content: "",
  });

  // Fetch both types of communications
  const fetchAllComms = useCallback(async () => {
    if (!entityType || !entityId) return;
    
    setLoading(true);
    try {
      // Fetch both sources in parallel
      const [manualRes, channelRes] = await Promise.all([
        // Manual logs (existing system)
        axios.get(`${API}/api/crm/${entityType}s/${entityId}/communications`, { withCredentials: true })
          .catch(() => ({ data: [] })),
        // Channel messages (new Comms system)
        axios.get(`${API}/api/comms/contact/${entityType}/${entityId}/messages?limit=50`, { withCredentials: true })
          .catch(() => ({ data: [] }))
      ]);

      // Process manual logs
      const manualData = Array.isArray(manualRes.data) 
        ? manualRes.data 
        : manualRes.data.communications || [];
      
      const manualComms = manualData.map(log => ({
        id: log.comm_id || log._id,
        type: "manual",
        subtype: log.comm_type,
        direction: log.direction,
        subject: log.subject,
        content: log.content,
        created_at: log.created_at,
        created_by: log.created_by_name,
        icon: MANUAL_COMM_TYPES.find(t => t.value === log.comm_type)?.icon || FileText,
        colorClass: providerColors[log.comm_type] || providerColors.note
      }));

      // Process channel messages
      const channelData = channelRes.data || [];
      const channelComms = channelData.map(msg => ({
        id: msg.message_id,
        type: "channel",
        subtype: msg.provider,
        direction: msg.direction,
        subject: msg.channel_display_name || msg.provider,
        content: msg.content_text,
        created_at: msg.created_at,
        created_by: msg.sent_by_user_name,
        conversation_id: msg.conversation_id,
        icon: null, // Will use ChannelIcon component
        provider: msg.provider,
        colorClass: providerColors[msg.provider] || providerColors.manual
      }));

      // Combine and sort by date (newest first)
      const combined = [...manualComms, ...channelComms].sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA;
      });

      setAllComms(combined);
    } catch (error) {
      console.error("Error fetching communications:", error);
      setAllComms([]);
    }
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => {
    fetchAllComms();
  }, [fetchAllComms]);

  // Handle manual log submission
  const handleSubmit = async () => {
    if (!form.subject.trim()) {
      toast.error(isEs ? "Agrega un asunto" : "Add a subject");
      return;
    }
    
    try {
      await axios.post(`${API}/api/crm/comms`, {
        ...form,
        entity_type: entityType,
        entity_id: entityId,
        entity_name: entityName
      }, { withCredentials: true });
      
      toast.success(isEs ? "Comunicación registrada" : "Communication logged");
      setShowNewDialog(false);
      setForm({ comm_type: "call", direction: "outbound", subject: "", content: "" });
      fetchAllComms();
    } catch (error) {
      console.error("Error logging communication:", error);
      toast.error(isEs ? "Error al registrar" : "Error logging");
    }
  };

  // Format time
  const formatTime = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) {
      return date.toLocaleTimeString(isEs ? "es-ES" : "en-US", { 
        hour: "2-digit", 
        minute: "2-digit" 
      });
    }
    if (diffDays === 1) return isEs ? "Ayer" : "Yesterday";
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString(isEs ? "es-ES" : "en-US", { 
      day: "2-digit", 
      month: "short" 
    });
  };

  const visibleComms = showAll ? allComms : allComms.slice(0, maxVisible);
  const hasMore = allComms.length > maxVisible;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="unified-comms-timeline">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          {isEs ? "Comunicaciones" : "Communications"} 
          <Badge variant="outline" className="text-xs">{allComms.length}</Badge>
        </h4>
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline"
            className="h-7 text-xs"
            onClick={() => navigate("/client-engagement/crm/inbox")}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            Inbox
          </Button>
          <Button 
            size="sm" 
            className="h-7 text-xs"
            onClick={() => setShowNewDialog(true)}
          >
            <Plus className="w-3 h-3 mr-1" />
            {isEs ? "Registrar" : "Log"}
          </Button>
        </div>
      </div>

      {/* Communications list */}
      {allComms.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg bg-muted/20">
          <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>{isEs ? "Sin comunicaciones" : "No communications"}</p>
          <Button 
            variant="link" 
            size="sm" 
            className="mt-1"
            onClick={() => setShowNewDialog(true)}
          >
            {isEs ? "Registrar primera comunicación" : "Log first communication"}
          </Button>
        </div>
      ) : (
        <ScrollArea className={showAll && allComms.length > 6 ? "max-h-[400px]" : ""}>
          <div className="space-y-2">
            {visibleComms.map((comm) => (
              <div 
                key={comm.id}
                className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs ${
                  comm.type === "channel" ? "bg-card" : "bg-muted/30"
                }`}
              >
                {/* Icon */}
                <div className={`p-1.5 rounded shrink-0 border ${comm.colorClass}`}>
                  {comm.type === "channel" ? (
                    <ChannelIcon provider={comm.provider} className="w-3.5 h-3.5" />
                  ) : (
                    <comm.icon className="w-3.5 h-3.5" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    {/* Direction indicator */}
                    {comm.direction === "inbound" ? (
                      <ArrowDownLeft className="w-3 h-3 text-green-600" />
                    ) : (
                      <ArrowUpRight className="w-3 h-3 text-blue-600" />
                    )}
                    
                    {/* Type badge */}
                    <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">
                      {comm.type === "channel" ? comm.provider : (isEs 
                        ? MANUAL_COMM_TYPES.find(t => t.value === comm.subtype)?.labelEs 
                        : MANUAL_COMM_TYPES.find(t => t.value === comm.subtype)?.label) || comm.subtype}
                    </Badge>

                    {/* Subject/title */}
                    <span className="font-medium truncate">{comm.subject}</span>

                    {/* Time */}
                    <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                      {formatTime(comm.created_at)}
                    </span>
                  </div>

                  {/* Content preview */}
                  {comm.content && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                      {comm.content.replace(/<[^>]*>/g, '').substring(0, 150)}
                    </p>
                  )}

                  {/* Created by */}
                  {comm.created_by && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {isEs ? "Por" : "By"}: {comm.created_by}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Show more button */}
      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs h-7"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? (
            <>
              <ChevronUp className="w-3 h-3 mr-1" />
              {isEs ? "Ver menos" : "Show less"}
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3 mr-1" />
              {isEs ? `Ver ${allComms.length - maxVisible} más` : `Show ${allComms.length - maxVisible} more`}
            </>
          )}
        </Button>
      )}

      {/* New Communication Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isEs ? "Registrar Comunicación" : "Log Communication"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">{isEs ? "Tipo" : "Type"}</label>
                <Select value={form.comm_type} onValueChange={(v) => setForm({ ...form, comm_type: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MANUAL_COMM_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        <div className="flex items-center gap-2">
                          <t.icon className="w-3.5 h-3.5" />
                          {isEs ? t.labelEs : t.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">{isEs ? "Dirección" : "Direction"}</label>
                <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outbound">{isEs ? "Saliente" : "Outbound"}</SelectItem>
                    <SelectItem value="inbound">{isEs ? "Entrante" : "Inbound"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block">{isEs ? "Asunto" : "Subject"} *</label>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder={isEs ? "Ej: Llamada de seguimiento" : "E.g. Follow-up call"}
                className="h-9"
              />
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block">{isEs ? "Notas" : "Notes"}</label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder={isEs ? "Detalles de la comunicación..." : "Communication details..."}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSubmit} disabled={!form.subject.trim()}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

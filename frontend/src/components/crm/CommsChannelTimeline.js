// components/crm/CommsChannelTimeline.js - Timeline de mensajes omnicanal para perfiles de Lead/Client
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { API_BASE as API } from "../../utils/api";

// UI Components
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";

// Icons
import {
  MessageSquare,
  Phone,
  Mail,
  Instagram,
  MessageCircle,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw
} from "lucide-react";

// Provider icons
const ProviderIcon = ({ provider, className = "w-3 h-3" }) => {
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
  whatsapp: "bg-green-100 text-green-600",
  email: "bg-blue-100 text-blue-600",
  instagram: "bg-pink-100 text-pink-600",
  facebook: "bg-indigo-100 text-indigo-600",
  manual: "bg-gray-100 text-gray-600"
};

export default function CommsChannelTimeline({ contactType, contactId, maxVisible = 5 }) {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const isEs = language === "es";
  
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const fetchMessages = useCallback(async () => {
    if (!contactType || !contactId) return;
    
    setLoading(true);
    try {
      const res = await axios.get(
        `${API}/api/comms/contact/${contactType}/${contactId}/messages?limit=50`,
        { withCredentials: true }
      );
      setMessages(res.data || []);
    } catch (error) {
      console.error("Error fetching channel messages:", error);
      setMessages([]);
    }
    setLoading(false);
  }, [contactType, contactId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

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

  const visibleMessages = showAll ? messages : messages.slice(0, maxVisible);
  const hasMore = messages.length > maxVisible;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="comms-channel-timeline">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
          <MessageSquare className="w-3.5 h-3.5" />
          {isEs ? "Mensajes de Canal" : "Channel Messages"} ({messages.length})
        </h4>
        <Button 
          size="sm" 
          variant="ghost" 
          className="h-6 text-xs px-2"
          onClick={() => navigate("/client-engagement/crm/inbox")}
        >
          <ExternalLink className="w-3 h-3 mr-1" />
          {isEs ? "Ver Inbox" : "View Inbox"}
        </Button>
      </div>

      {/* Messages list */}
      {messages.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground text-xs border rounded bg-muted/20">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>{isEs ? "Sin mensajes de canales" : "No channel messages"}</p>
          <p className="text-[10px] mt-1">
            {isEs 
              ? "Los mensajes de WhatsApp, Email, etc. aparecerán aquí" 
              : "Messages from WhatsApp, Email, etc. will appear here"}
          </p>
        </div>
      ) : (
        <ScrollArea className={showAll ? "max-h-[300px]" : ""}>
          <div className="space-y-1.5">
            {visibleMessages.map(msg => (
              <div 
                key={msg.message_id}
                className={`flex items-start gap-2 p-2 rounded border text-xs ${
                  msg.direction === "inbound" 
                    ? "bg-muted/30" 
                    : "bg-primary/5 border-primary/20"
                }`}
              >
                {/* Provider icon */}
                <div className={`p-1.5 rounded shrink-0 ${providerColors[msg.provider] || providerColors.manual}`}>
                  <ProviderIcon provider={msg.provider} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {/* Direction indicator */}
                    {msg.direction === "inbound" ? (
                      <ArrowDownLeft className="w-3 h-3 text-green-500" />
                    ) : (
                      <ArrowUpRight className="w-3 h-3 text-blue-500" />
                    )}
                    
                    {/* Provider badge */}
                    <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">
                      {msg.channel_display_name || msg.provider}
                    </Badge>

                    {/* Time */}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>

                  {/* Message text */}
                  <p className="text-[11px] line-clamp-2">
                    {msg.content_text || (isEs ? "Sin contenido" : "No content")}
                  </p>

                  {/* Sender for outbound */}
                  {msg.direction === "outbound" && msg.sent_by_user_name && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {isEs ? "Por" : "By"}: {msg.sent_by_user_name}
                    </p>
                  )}

                  {/* Internal note indicator */}
                  {msg.is_internal_note && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 mt-1 bg-yellow-50 text-yellow-700 border-yellow-200">
                      {isEs ? "Nota interna" : "Internal note"}
                    </Badge>
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
          className="w-full text-[10px] h-6"
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
              {isEs ? `Ver ${messages.length - maxVisible} más` : `Show ${messages.length - maxVisible} more`}
            </>
          )}
        </Button>
      )}
    </div>
  );
}

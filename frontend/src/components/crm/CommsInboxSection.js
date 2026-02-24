// components/crm/CommsInboxSection.js - Kora Comms Inbox UI
import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { API_BASE as API } from "../../utils/api";

// UI Components
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Textarea } from "../ui/textarea";
import { ScrollArea } from "../ui/scroll-area";
import { Avatar, AvatarFallback } from "../ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Separator } from "../ui/separator";

// Icons
import {
  Inbox,
  MessageSquare,
  Send,
  User,
  Users,
  Clock,
  CheckCircle2,
  Circle,
  AlertCircle,
  ChevronDown,
  Search,
  Filter,
  MoreVertical,
  Phone,
  Mail,
  MessageCircle,
  Instagram,
  Facebook,
  RefreshCw,
  Plus,
  X,
  StickyNote,
  ArrowLeft
} from "lucide-react";

// Provider icons mapping
const ProviderIcon = ({ provider, className = "w-4 h-4" }) => {
  const icons = {
    whatsapp: <Phone className={className} />,
    email: <Mail className={className} />,
    instagram: <Instagram className={className} />,
    facebook: <Facebook className={className} />,
    manual: <MessageCircle className={className} />
  };
  return icons[provider] || <MessageCircle className={className} />;
};

// Provider colors
const providerColors = {
  whatsapp: "bg-green-500/20 text-green-600",
  email: "bg-blue-500/20 text-blue-600",
  instagram: "bg-pink-500/20 text-pink-600",
  facebook: "bg-indigo-500/20 text-indigo-600",
  manual: "bg-gray-500/20 text-gray-600"
};

// Status colors
const statusColors = {
  open: "bg-green-500/20 text-green-600",
  pending: "bg-yellow-500/20 text-yellow-600",
  closed: "bg-gray-500/20 text-gray-600"
};

// Priority colors
const priorityColors = {
  low: "bg-gray-500/20 text-gray-600",
  normal: "bg-blue-500/20 text-blue-600",
  high: "bg-red-500/20 text-red-600"
};

export default function CommsInboxSection() {
  const { language } = useLanguage();
  const isEs = language === "es";

  // State
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [stats, setStats] = useState({});
  const [inboxes, setInboxes] = useState([]);
  const [orgUsers, setOrgUsers] = useState([]);
  
  // Filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterAssigned, setFilterAssigned] = useState("all");
  const [filterInbox, setFilterInbox] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.append("status", filterStatus);
      if (filterAssigned === "me") params.append("assigned_to", "me");
      else if (filterAssigned === "unassigned") params.append("assigned_to", "unassigned");
      if (filterInbox !== "all") params.append("inbox_id", filterInbox);

      const res = await axios.get(`${API}/api/comms/conversations?${params}`, { withCredentials: true });
      setConversations(res.data || []);
    } catch (error) {
      console.error("Error fetching conversations:", error);
    }
  }, [filterStatus, filterAssigned, filterInbox]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/comms/stats`, { withCredentials: true });
      setStats(res.data || {});
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  }, []);

  // Fetch inboxes
  const fetchInboxes = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/comms/inboxes`, { withCredentials: true });
      setInboxes(res.data || []);
    } catch (error) {
      console.error("Error fetching inboxes:", error);
    }
  }, []);

  // Fetch org users for assignment
  const fetchOrgUsers = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/organization/members`, { withCredentials: true });
      setOrgUsers(res.data || []);
    } catch (error) {
      console.error("Error fetching org users:", error);
    }
  }, []);

  // Fetch messages for selected conversation
  const fetchMessages = useCallback(async (conversationId) => {
    try {
      const res = await axios.get(`${API}/api/comms/conversations/${conversationId}/messages`, { withCredentials: true });
      setMessages(res.data || []);
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchConversations(), fetchStats(), fetchInboxes(), fetchOrgUsers()]);
      setLoading(false);
    };
    loadData();
  }, [fetchConversations, fetchStats, fetchInboxes, fetchOrgUsers]);

  // Refetch on filter change
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Load messages when conversation selected
  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.conversation_id);
    }
  }, [selectedConversation, fetchMessages]);

  // Send message
  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedConversation) return;

    setSendingMessage(true);
    try {
      await axios.post(
        `${API}/api/comms/conversations/${selectedConversation.conversation_id}/messages`,
        {
          conversation_id: selectedConversation.conversation_id,
          direction: "outbound",
          message_type: "text",
          content_text: messageText.trim()
        },
        { withCredentials: true }
      );
      setMessageText("");
      await fetchMessages(selectedConversation.conversation_id);
      await fetchConversations();
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setSendingMessage(false);
    }
  };

  // Update conversation status
  const handleUpdateStatus = async (status) => {
    if (!selectedConversation) return;
    try {
      await axios.patch(
        `${API}/api/comms/conversations/${selectedConversation.conversation_id}`,
        { status },
        { withCredentials: true }
      );
      setSelectedConversation({ ...selectedConversation, status });
      await fetchConversations();
      await fetchStats();
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  // Assign conversation
  const handleAssign = async (userId) => {
    if (!selectedConversation) return;
    try {
      const res = await axios.patch(
        `${API}/api/comms/conversations/${selectedConversation.conversation_id}`,
        { assigned_user_id: userId || null },
        { withCredentials: true }
      );
      setSelectedConversation(res.data);
      await fetchConversations();
      await fetchStats();
    } catch (error) {
      console.error("Error assigning conversation:", error);
    }
  };

  // Filter conversations by search
  const filteredConversations = conversations.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (c.contact_name || "").toLowerCase().includes(q) ||
      (c.last_message_preview || "").toLowerCase().includes(q)
    );
  });

  // Format time
  const formatTime = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return isEs ? "ahora" : "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-180px)] flex flex-col">
      {/* Header with stats */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">{isEs ? "Bandeja de Comunicaciones" : "Comms Inbox"}</h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Gestiona todas las conversaciones con leads y clientes" : "Manage all conversations with leads and clients"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Circle className="w-2 h-2 fill-green-500 text-green-500" />
            {stats.open_conversations || 0} {isEs ? "abiertas" : "open"}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <User className="w-3 h-3" />
            {stats.my_conversations || 0} {isEs ? "mías" : "mine"}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <AlertCircle className="w-3 h-3" />
            {stats.unassigned_conversations || 0} {isEs ? "sin asignar" : "unassigned"}
          </Badge>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex border rounded-lg overflow-hidden bg-card">
        {/* Left sidebar - Filters & Conversation list */}
        <div className="w-80 border-r flex flex-col">
          {/* Filters */}
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={isEs ? "Buscar conversación..." : "Search conversation..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
                  <SelectItem value="open">{isEs ? "Abiertos" : "Open"}</SelectItem>
                  <SelectItem value="pending">{isEs ? "Pendientes" : "Pending"}</SelectItem>
                  <SelectItem value="closed">{isEs ? "Cerrados" : "Closed"}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterAssigned} onValueChange={setFilterAssigned}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
                  <SelectItem value="me">{isEs ? "Mis conv." : "Mine"}</SelectItem>
                  <SelectItem value="unassigned">{isEs ? "Sin asignar" : "Unassigned"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Conversation list */}
          <ScrollArea className="flex-1">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Inbox className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{isEs ? "No hay conversaciones" : "No conversations"}</p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredConversations.map((conv) => (
                  <div
                    key={conv.conversation_id}
                    onClick={() => setSelectedConversation(conv)}
                    className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                      selectedConversation?.conversation_id === conv.conversation_id ? "bg-muted" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className={providerColors[conv.channel_provider]}>
                          <ProviderIcon provider={conv.channel_provider} className="w-5 h-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm truncate">
                            {conv.contact_name || (isEs ? "Sin nombre" : "Unknown")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(conv.last_message_at)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {conv.last_message_preview || (isEs ? "Sin mensajes" : "No messages")}
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                          <Badge variant="outline" className={`text-[10px] px-1 py-0 ${statusColors[conv.status]}`}>
                            {conv.status}
                          </Badge>
                          {conv.unread_count > 0 && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-primary">
                              {conv.unread_count}
                            </Badge>
                          )}
                          {conv.priority === "high" && (
                            <Badge variant="outline" className={`text-[10px] px-1 py-0 ${priorityColors.high}`}>
                              !
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right panel - Thread view */}
        {selectedConversation ? (
          <div className="flex-1 flex flex-col">
            {/* Conversation header */}
            <div className="p-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="md:hidden"
                  onClick={() => setSelectedConversation(null)}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <Avatar className="h-10 w-10">
                  <AvatarFallback className={providerColors[selectedConversation.channel_provider]}>
                    <ProviderIcon provider={selectedConversation.channel_provider} className="w-5 h-5" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-medium">
                    {selectedConversation.contact_name || (isEs ? "Sin nombre" : "Unknown")}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="capitalize">{selectedConversation.channel_provider}</span>
                    {selectedConversation.contact_phone && (
                      <>
                        <span>•</span>
                        <span>{selectedConversation.contact_phone}</span>
                      </>
                    )}
                    {selectedConversation.contact_email && (
                      <>
                        <span>•</span>
                        <span>{selectedConversation.contact_email}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Status selector */}
                <Select 
                  value={selectedConversation.status} 
                  onValueChange={handleUpdateStatus}
                >
                  <SelectTrigger className="h-8 w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">
                      <div className="flex items-center gap-2">
                        <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                        {isEs ? "Abierto" : "Open"}
                      </div>
                    </SelectItem>
                    <SelectItem value="pending">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-yellow-500" />
                        {isEs ? "Pendiente" : "Pending"}
                      </div>
                    </SelectItem>
                    <SelectItem value="closed">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-gray-500" />
                        {isEs ? "Cerrado" : "Closed"}
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>

                {/* Assignment selector */}
                <Select 
                  value={selectedConversation.assigned_user_id || "unassigned"} 
                  onValueChange={(v) => handleAssign(v === "unassigned" ? null : v)}
                >
                  <SelectTrigger className="h-8 w-36">
                    <User className="w-3 h-3 mr-1" />
                    <SelectValue placeholder={isEs ? "Asignar" : "Assign"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">
                      {isEs ? "Sin asignar" : "Unassigned"}
                    </SelectItem>
                    {orgUsers.map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {u.name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* More options */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <User className="w-4 h-4 mr-2" />
                      {isEs ? "Ver perfil de contacto" : "View contact profile"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">
                      <X className="w-4 h-4 mr-2" />
                      {isEs ? "Cerrar conversación" : "Close conversation"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>{isEs ? "No hay mensajes" : "No messages yet"}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.message_id}
                      className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg p-3 ${
                          msg.is_internal_note
                            ? "bg-yellow-500/10 border border-yellow-500/30"
                            : msg.direction === "outbound"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {msg.is_internal_note && (
                          <div className="flex items-center gap-1 text-xs text-yellow-600 mb-1">
                            <StickyNote className="w-3 h-3" />
                            {isEs ? "Nota interna" : "Internal note"}
                          </div>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{msg.content_text}</p>
                        <div className={`flex items-center gap-2 mt-1 text-xs ${
                          msg.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}>
                          <span>{formatTime(msg.created_at)}</span>
                          {msg.direction === "outbound" && msg.sent_by_user_name && (
                            <span>• {msg.sent_by_user_name}</span>
                          )}
                          {msg.delivery_status && msg.direction === "outbound" && (
                            <span className="capitalize">• {msg.delivery_status}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Reply composer */}
            <div className="p-3 border-t">
              <div className="flex gap-2">
                <Textarea
                  placeholder={isEs ? "Escribe un mensaje..." : "Type a message..."}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="min-h-[60px] max-h-[120px] resize-none"
                  rows={2}
                />
                <div className="flex flex-col gap-1">
                  <Button 
                    onClick={handleSendMessage} 
                    disabled={!messageText.trim() || sendingMessage}
                    className="h-full"
                  >
                    {sendingMessage ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-1">
                {isEs ? "Selecciona una conversación" : "Select a conversation"}
              </h3>
              <p className="text-sm">
                {isEs 
                  ? "Elige una conversación de la lista para ver los mensajes" 
                  : "Choose a conversation from the list to view messages"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

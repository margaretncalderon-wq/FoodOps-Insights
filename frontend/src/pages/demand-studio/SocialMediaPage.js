import { useState, useEffect, useCallback } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { useLanguage } from "../../contexts/LanguageContext";
import { usePresence } from "../../hooks/usePresence";
import { EntityPresenceBar, PresenceAvatarStack } from "../../components/PresenceAvatars";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { 
  Plus, Calendar, List, BarChart3, Hash, Instagram, 
  Loader2, Play, Copy, Archive, Check, Settings, Edit,
  ChevronLeft, ChevronRight, Linkedin, Youtube, Lightbulb,
  ExternalLink, Sparkles, Trash2, ArrowRight, Grid3X3, Wand2, Share2,
  Building2, ChevronDown, AtSign, User, Video, Film, Eye, MoreHorizontal,
  ArrowUpRight, GripVertical, History
} from "lucide-react";

import { API_BASE as API } from "../../utils/api"; // Dynamic API URL
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import FeedTab from "../../components/demand-studio/FeedTab";
import StudioEditor from "../../components/demand-studio/StudioEditor";
import SocialSharing from "../../components/demand-studio/SocialSharing";
import AccountSharing from "../../components/demand-studio/AccountSharing";
import ActivityFeed from "../../components/demand-studio/ActivityFeed";
import { SocialMetricsSection } from "../../components/demand-studio/SocialMetricsSection";
import CommentsSection from "../../components/shared/CommentsSection";
import RichTextEditor from "../../components/ui/RichTextEditor";
import { GlobalActivityLog } from "../../components/GlobalActivityLog";

const PLATFORMS = [
  { value: "instagram", label: "Instagram", icon: Instagram, color: "bg-pink-500" },
  { value: "tiktok", label: "TikTok", icon: Hash, color: "bg-black" },
  { value: "linkedin", label: "LinkedIn", icon: Linkedin, color: "bg-blue-600" },
  { value: "facebook", label: "Facebook", icon: Hash, color: "bg-blue-500" },
  { value: "youtube", label: "YouTube", icon: Youtube, color: "bg-red-500" },
];

const FORMATS = [
  { value: "reel", label: "Reel", labelEs: "Reel" },
  { value: "carousel", label: "Carousel", labelEs: "Carrusel" },
  { value: "post", label: "Post", labelEs: "Post" },
  { value: "story", label: "Story", labelEs: "Historia" },
  { value: "live", label: "Live", labelEs: "En Vivo" },
];

const STATUSES = [
  { value: "idea", label: "Idea", labelEs: "Idea", color: "bg-gray-100 text-gray-800" },
  { value: "calendar", label: "Calendar", labelEs: "Calendarizado", color: "bg-cyan-100 text-cyan-800" },
  { value: "production", label: "Production", labelEs: "Producción", color: "bg-orange-100 text-orange-800" },
  { value: "editing", label: "Editing", labelEs: "Edición", color: "bg-purple-100 text-purple-800" },
  { value: "drafted", label: "Ready", labelEs: "Listo", color: "bg-yellow-100 text-yellow-800" },
  { value: "scheduled", label: "Scheduled", labelEs: "Programado", color: "bg-blue-100 text-blue-800" },
  { value: "posted", label: "Posted", labelEs: "Publicado", color: "bg-green-100 text-green-800" },
  { value: "archived", label: "Archived", labelEs: "Archivado", color: "bg-gray-100 text-gray-600" },
];

const IDEA_STATUSES = [
  { value: "new", label: "New", labelEs: "Nueva", color: "bg-purple-100 text-purple-800" },
  { value: "reviewing", label: "Reviewing", labelEs: "Revisando", color: "bg-yellow-100 text-yellow-800" },
  { value: "approved", label: "Approved", labelEs: "Aprobada", color: "bg-green-100 text-green-800" },
  { value: "used", label: "Used", labelEs: "Usada", color: "bg-blue-100 text-blue-800" },
  { value: "archived", label: "Archived", labelEs: "Archivada", color: "bg-gray-100 text-gray-600" },
];

export default function SocialMediaPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState("overview");
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Get org context from parent (DemandStudioPage)
  const outletContext = useOutletContext() || {};
  const { selectedOrgId, selectedOrg, isOwnOrg } = outletContext;
  
  // Account-centric context - each account is a separate workspace
  const [accessibleAccounts, setAccessibleAccounts] = useState([]); // [{account_id, handle, platform, _access_type, _role, _shared_by}]
  const [selectedAccountId, setSelectedAccountId] = useState(null); // null = show all owned, string = specific account
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [isViewingShared, setIsViewingShared] = useState(false);
  
  // Legacy org context - for backwards compatibility
  const [availableOrgs, setAvailableOrgs] = useState([]);
  const [activeOrgId, setActiveOrgId] = useState(null);
  const [activeOrgName, setActiveOrgName] = useState(null);
  
  // Data
  const [stats, setStats] = useState({});
  const [posts, setPosts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [pillars, setPillars] = useState([]);
  const [audiences, setAudiences] = useState([]);
  const [segments, setSegments] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [insights, setInsights] = useState({});
  const [ideas, setIdeas] = useState([]);
  const [externalPartners, setExternalPartners] = useState([]);
  
  // Filters
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterFormat, setFilterFormat] = useState("all");
  const [filterCampaign, setFilterCampaign] = useState("all");
  const [filterPillar, setFilterPillar] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all"); // "all" | "owned" | "shared"
  
  // Calendar filters
  const [calFilterAccount, setCalFilterAccount] = useState("all");
  const [calFilterFormat, setCalFilterFormat] = useState("all");
  const [calFilterPillar, setCalFilterPillar] = useState("all");
  
  // Calendar
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [calendarPosts, setCalendarPosts] = useState([]);
  const [calendarPillarStats, setCalendarPillarStats] = useState(null);
  
  // Dialogs
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [pillarDialogOpen, setPillarDialogOpen] = useState(false);
  const [postSaving, setPostSaving] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [ideaSaving, setIdeaSaving] = useState(false);
  const [convertingSaving, setConvertingSaving] = useState(false);
  const [pillarSaving, setPillarSaving] = useState(false);
  const [audienceDialogOpen, setAudienceDialogOpen] = useState(false);
  const [audienceSaving, setAudienceSaving] = useState(false);
  const [segmentDialogOpen, setSegmentDialogOpen] = useState(false);
  const [segmentSaving, setSegmentSaving] = useState(false);
  const [ideaDialogOpen, setIdeaDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [editingIdea, setEditingIdea] = useState(null);
  const [convertIdeaDialogOpen, setConvertIdeaDialogOpen] = useState(false);
  const [ideaToConvert, setIdeaToConvert] = useState(null);
  const [convertTargetStatus, setConvertTargetStatus] = useState("production");
  const [convertTargetAccount, setConvertTargetAccount] = useState("");
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioAssets, setStudioAssets] = useState([]);
  
  // Comment/notification counts per post (for inline badges)
  const [postCommentCounts, setPostCommentCounts] = useState({});

  // Presence: track which post is being edited and get entity viewers
  const editingEntityId = postDialogOpen && editingPost ? editingPost.post_id : null;
  const editingEntityTitle = postDialogOpen && editingPost ? editingPost.title : null;
  const { entityViewers, leaveEntity, onlineUsers: pageOnlineUsers } = usePresence({
    page: "demand-studio/social-media",
    entityType: editingEntityId ? "social_post" : null,
    entityId: editingEntityId,
    entityTitle: editingEntityTitle,
    orgId: selectedOrgId && !isOwnOrg ? selectedOrgId : null
  });
  
  // Forms
  const [postForm, setPostForm] = useState({
    social_account_id: "",
    campaign_id: "",
    pillar_id: "",
    audience_id: "",
    sub_audience_id: "",
    segment_id: "",
    format: "post",
    status: "idea",
    title: "",
    caption: "",
    hook: "",
    cta: "",
    scheduled_at: "",
    production_date: "",
    link_url: "",
    notes: "",
    content_body: ""
  });
  
  const [accountForm, setAccountForm] = useState({
    platform: "instagram",
    handle: "",
    status: "active"
  });
  
  const [pillarForm, setPillarForm] = useState({
    name: "",
    description: "",
    what_is_it: "",
    why_it_matters: "",
    content_tags: [],
    weight_percentage: "",
    color: "",
    icon: "",
    platforms: []
  });
  const [pillarTagInput, setPillarTagInput] = useState("");
  const [editingPillar, setEditingPillar] = useState(null);

  const [audienceForm, setAudienceForm] = useState({
    name: "",
    description: "",
    platforms: [],
    sub_audiences: []
  });
  const [editingAudience, setEditingAudience] = useState(null);

  const [segmentForm, setSegmentForm] = useState({
    name: "",
    description: "",
    platforms: [],
    pillar_ids: []
  });
  const [editingSegment, setEditingSegment] = useState(null);

  const PLATFORM_OPTIONS = [
    { value: "instagram", label: "Instagram", icon: Instagram },
    { value: "linkedin", label: "LinkedIn", icon: Linkedin },
    { value: "youtube", label: "YouTube", icon: Youtube },
    { value: "tiktok", label: "TikTok", icon: Play },
    { value: "facebook", label: "Facebook", icon: Share2 },
    { value: "twitter", label: "X / Twitter", icon: AtSign },
  ];

  const [ideaForm, setIdeaForm] = useState({
    title: "",
    description: "",
    source_url: "",
    pillar_id: "",
    segment_id: "",
    audience_id: "",
    social_account_id: "",
    tags: [],
    status: "new",
    content_body: ""
  });
  const [tagInput, setTagInput] = useState("");
  const [ideaGroupBy, setIdeaGroupBy] = useState("none"); // none, pillar, segment, audience, status

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeView === "calendar") {
      fetchCalendarPosts();
    }
  }, [activeView, calendarMonth, calFilterAccount, calFilterFormat, calFilterPillar]);

  // Fetch all accessible accounts (owned + shared via account_memberships)
  const fetchAccessibleAccounts = async () => {
    try {
      const res = await axios.get(`${API}/api/account-sharing/my-accounts`, { withCredentials: true });
      setAccessibleAccounts(res.data || []);
      
      // If no account is selected and we have accounts, select "all" by default
      if (res.data && res.data.length > 0 && selectedAccountId === null) {
        // Default to showing all owned accounts
      }
    } catch (err) {
      console.error("Error fetching accessible accounts:", err);
      // Fallback to legacy org-based fetch
      fetchAvailableOrgs();
    }
  };

  // Fetch available organizations (legacy, for backwards compatibility)
  const fetchAvailableOrgs = async () => {
    try {
      const res = await axios.get(`${API}/api/social-sharing/available-orgs`, { withCredentials: true });
      setAvailableOrgs(res.data || []);
    } catch (err) {
      console.error("Error fetching available orgs:", err);
    }
  };

  useEffect(() => {
    fetchAccessibleAccounts();
    fetchAvailableOrgs(); // Keep for backwards compatibility
  }, []);

  // Refetch data when org changes from parent context
  useEffect(() => {
    if (selectedOrgId) {
      setLoading(true);
      fetchData(isOwnOrg ? null : selectedOrgId, selectedAccountId);
    } else if (selectedOrgId === null && isOwnOrg) {
      // Own org selected
      setLoading(true);
      fetchData(null, selectedAccountId);
    }
  }, [selectedOrgId, isOwnOrg]);

  // Handle account selection change
  const handleAccountChange = (accountId) => {
    if (accountId === "all") {
      // Show all owned accounts
      setSelectedAccountId(null);
      setSelectedAccount(null);
      setIsViewingShared(false);
      setLoading(true);
      fetchData(isOwnOrg ? null : selectedOrgId, null);
    } else {
      const account = accessibleAccounts.find(a => a.account_id === accountId);
      setSelectedAccountId(accountId);
      setSelectedAccount(account);
      setIsViewingShared(account?._access_type === "shared");
      setLoading(true);
      fetchData(isOwnOrg ? null : selectedOrgId, accountId);
    }
  };

  // Helper to get org_id query param for write operations
  const getOrgParam = () => {
    const orgId = selectedOrgId && !isOwnOrg ? selectedOrgId : null;
    return orgId ? `?org_id=${orgId}` : "";
  };

  const fetchData = async (orgId = null, accountId = null) => {
    try {
      // Use selectedOrgId from context if available and not own org
      const effectiveOrgId = orgId || (selectedOrgId && !isOwnOrg ? selectedOrgId : null);
      
      // Build query params based on account or org
      let params = new URLSearchParams();
      if (accountId) {
        params.append("account_id", accountId);
      }
      if (effectiveOrgId) {
        params.append("org_id", effectiveOrgId);
      }
      const queryString = params.toString() ? `?${params.toString()}` : "";
      const andParams = params.toString() ? `&${params.toString()}` : "";
      
      const [statsRes, postsRes, accountsRes, pillarsRes, audiencesRes, segmentsRes, campaignsRes, insightsRes, ideasRes, partnersRes] = await Promise.all([
        axios.get(`${API}/api/demand-studio/social/stats${queryString}`, { withCredentials: true }).catch(() => ({ data: {} })),
        axios.get(`${API}/api/demand-studio/social/posts${queryString}`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/demand-studio/social/accounts?include_shared=true${andParams}`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/demand-studio/social/pillars${queryString}`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/demand-studio/social/audiences${queryString}`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/demand-studio/social/segments${queryString}`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/demand-studio/campaigns${queryString}`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/demand-studio/social/insights${queryString}`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/demand-studio/social/ideas${queryString}`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/partners`, { withCredentials: true }).catch(() => ({ data: { partners: [] } })),
      ]);
      
      setStats(statsRes.data);
      setPosts(postsRes.data);
      setAccounts(accountsRes.data);
      setPillars(pillarsRes.data);
      setAudiences(audiencesRes.data || []);
      setSegments(segmentsRes.data || []);
      setCampaigns(campaignsRes.data);
      setInsights(insightsRes.data);
      setIdeas(ideasRes.data);
      setExternalPartners((partnersRes.data?.partners || partnersRes.data || []).filter(p => 
        ["agency", "contractor", "freelancer", "asociacion"].includes(p.partner_type)
      ));
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Handle org change (legacy, for backwards compatibility)
  const handleOrgChange = (orgId) => {
    if (orgId === "mine") {
      setActiveOrgId(null);
      setActiveOrgName(null);
      setIsViewingShared(false);
      setLoading(true);
      fetchData(null, null);
    } else {
      const org = availableOrgs.find(o => o.org_id === orgId);
      setActiveOrgId(orgId);
      setActiveOrgName(org?.name || "");
      setIsViewingShared(true);
      setLoading(true);
      fetchData(orgId, null);
    }
  };

  const fetchCalendarPosts = async () => {
    const startDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).toISOString();
    const endDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const orgParam = selectedOrgId && !isOwnOrg ? `&org_id=${selectedOrgId}` : "";
    
    try {
      const [postsRes, statsRes] = await Promise.all([
        axios.get(`${API}/api/demand-studio/social/calendar?start_date=${startDate}&end_date=${endDate}${orgParam}`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/demand-studio/social/calendar/pillar-stats?year=${calendarMonth.getFullYear()}&month=${calendarMonth.getMonth() + 1}${orgParam}`, { withCredentials: true }).catch(() => ({ data: null }))
      ]);
      setCalendarPosts(postsRes.data);
      setCalendarPillarStats(statsRes.data);
    } catch (error) {
      console.error("Error fetching calendar data:", error);
    }
  };

  // Fetch comment/notification counts for visible posts
  const fetchPostCommentCounts = async (postIds) => {
    if (!postIds || postIds.length === 0) return;
    try {
      const orgParam = selectedOrgId && !isOwnOrg ? `&org_id=${selectedOrgId}` : "";
      const res = await axios.get(
        `${API}/api/comments/counts/by-entities?entity_type=social_post&entity_ids=${postIds.join(",")}${orgParam}`,
        { withCredentials: true }
      );
      setPostCommentCounts(prev => ({ ...prev, ...(res.data || {}) }));
    } catch (error) {
      // Silently fail
    }
  };

  // Fetch comment counts when posts change
  useEffect(() => {
    if (posts.length > 0) {
      const postIds = posts.map(p => p.post_id);
      fetchPostCommentCounts(postIds);
    }
  }, [posts]);

  // Deep linking: handle ?openPost=xxx or ?openIdea=xxx from notification clicks
  useEffect(() => {
    const openPostId = searchParams.get("openPost");
    const openIdeaId = searchParams.get("openIdea");
    
    if (openPostId && posts.length > 0) {
      const post = posts.find(p => p.post_id === openPostId);
      if (post) {
        setEditingPost(post);
        setPostForm({
          social_account_id: post.social_account_id || "",
          campaign_id: post.campaign_id || "",
          pillar_id: post.pillar_id || "",
          audience_id: post.audience_id || "",
          sub_audience_id: post.sub_audience_id || "",
          segment_id: post.segment_id || "",
          format: post.format || "post",
          status: post.status || "idea",
          title: post.title || "",
          caption: post.caption || "",
          hook: post.hook || "",
          cta: post.cta || "",
          scheduled_at: post.scheduled_at ? post.scheduled_at.slice(0, 16) : "",
          production_date: post.production_date ? post.production_date.slice(0, 10) : "",
          link_url: post.link_url || "",
          notes: post.notes || "",
          content_body: post.content_body || ""
        });
        setPostDialogOpen(true);
        // Clean up URL params
        setSearchParams({}, { replace: true });
      }
    }
    
    if (openIdeaId && ideas.length > 0) {
      const idea = ideas.find(i => i.idea_id === openIdeaId);
      if (idea) {
        setEditingIdea(idea);
        setIdeaDialogOpen(true);
        setSearchParams({}, { replace: true });
      }
    }
  }, [posts, ideas, searchParams]);

  const handleSavePost = async () => {
    if (postSaving) return;
    // Validation for production/editing status
    if ((postForm.status === "production" || postForm.status === "editing") && !postForm.production_date) {
      toast.error(isEs ? "Fecha de producción requerida para este estado" : "Production date required for this status");
      return;
    }
    // Validation for scheduled status
    if (postForm.status === "scheduled" && !postForm.scheduled_at) {
      toast.error(isEs ? "Fecha de publicación requerida para programar" : "Publish date required for scheduling");
      return;
    }
    
    setPostSaving(true);
    try {
      const payload = { ...postForm };
      if (!payload.campaign_id) delete payload.campaign_id;
      if (!payload.pillar_id) delete payload.pillar_id;
      if (!payload.audience_id) delete payload.audience_id;
      if (!payload.sub_audience_id) delete payload.sub_audience_id;
      if (!payload.segment_id) delete payload.segment_id;
      if (!payload.production_date) delete payload.production_date;
      
      if (editingPost) {
        await axios.put(`${API}/api/demand-studio/social/posts/${editingPost.post_id}${getOrgParam()}`, payload, { withCredentials: true });
      } else {
        await axios.post(`${API}/api/demand-studio/social/posts${getOrgParam()}`, payload, { withCredentials: true });
      }
      setPostDialogOpen(false);
      setEditingPost(null);
      resetPostForm();
      await fetchData(isOwnOrg ? null : selectedOrgId);
      fetchCalendarPosts();
    } catch (error) {
      console.error("Error saving post:", error);
      const errMsg = error?.response?.data?.detail || (isEs ? "Error al guardar el post" : "Error saving post");
      toast.error(errMsg);
    } finally {
      setPostSaving(false);
    }
  };

  const handleDeletePost = async (postId) => {
    if (!window.confirm(isEs ? "¿Eliminar este post?" : "Delete this post?")) return;
    try {
      await axios.delete(`${API}/api/demand-studio/social/posts/${postId}${getOrgParam()}`, { withCredentials: true });
      toast.success(isEs ? "Post eliminado" : "Post deleted");
      await fetchData(isOwnOrg ? null : selectedOrgId);
      fetchCalendarPosts();
    } catch (error) {
      console.error("Error deleting post:", error);
      toast.error(isEs ? "Error al eliminar el post" : "Error deleting post");
    }
  };

  const handleMarkAsPosted = async (postId) => {
    try {
      await axios.post(`${API}/api/demand-studio/social/posts/${postId}/mark-posted${getOrgParam()}`, {}, { withCredentials: true });
      await fetchData(isOwnOrg ? null : selectedOrgId);
      fetchCalendarPosts();
    } catch (error) {
      console.error("Error marking as posted:", error);
      toast.error(isEs ? "Error al marcar como publicado" : "Error marking as posted");
    }
  };

  // Quick status change with optional date prompt
  const [quickStatusDialog, setQuickStatusDialog] = useState({ open: false, postId: null, targetStatus: null, postTitle: "" });
  const [quickProductionDate, setQuickProductionDate] = useState("");

  const handleQuickStatusChange = async (postId, targetStatus, postTitle) => {
    // If moving to production or editing, ask for production_date
    if (targetStatus === "production" || targetStatus === "editing") {
      setQuickStatusDialog({ open: true, postId, targetStatus, postTitle });
      setQuickProductionDate(new Date().toISOString().split("T")[0]);
      return;
    }
    // Direct status change
    try {
      await axios.patch(`${API}/api/demand-studio/social/posts/${postId}${getOrgParam()}`, { status: targetStatus }, { withCredentials: true });
      await fetchData(isOwnOrg ? null : selectedOrgId);
      fetchCalendarPosts();
    } catch (error) {
      console.error("Error changing status:", error);
      toast.error(isEs ? "Error al cambiar estado" : "Error changing status");
    }
  };

  const confirmQuickStatusChange = async () => {
    try {
      await axios.patch(`${API}/api/demand-studio/social/posts/${quickStatusDialog.postId}${getOrgParam()}`, {
        status: quickStatusDialog.targetStatus,
        production_date: quickProductionDate || null
      }, { withCredentials: true });
      setQuickStatusDialog({ open: false, postId: null, targetStatus: null, postTitle: "" });
      setQuickProductionDate("");
      await fetchData(isOwnOrg ? null : selectedOrgId);
      fetchCalendarPosts();
    } catch (error) {
      console.error("Error changing status:", error);
      toast.error(isEs ? "Error al cambiar estado" : "Error changing status");
    }
  };

  // Calendar drag & drop handler
  const handleCalendarDragEnd = async (result) => {
    if (!result.destination) return;
    const postId = result.draggableId;
    const targetDateStr = result.destination.droppableId; // format: "cal-YYYY-MM-DD"
    if (!targetDateStr.startsWith("cal-")) return;
    const newDate = targetDateStr.replace("cal-", "");
    try {
      await axios.patch(`${API}/api/demand-studio/social/posts/${postId}${getOrgParam()}`, {
        scheduled_at: newDate + "T12:00:00"
      }, { withCredentials: true });
      await fetchData(isOwnOrg ? null : selectedOrgId);
      fetchCalendarPosts();
    } catch (error) {
      console.error("Error moving post:", error);
      toast.error(isEs ? "Error al mover el post" : "Error moving post");
    }
  };

  const handleDuplicatePost = async (postId) => {
    try {
      await axios.post(`${API}/api/demand-studio/social/posts/${postId}/duplicate${getOrgParam()}`, {}, { withCredentials: true });
      await fetchData(isOwnOrg ? null : selectedOrgId);
      fetchCalendarPosts();
    } catch (error) {
      console.error("Error duplicating post:", error);
      toast.error(isEs ? "Error al duplicar el post" : "Error duplicating post");
    }
  };

  const handleSaveAccount = async () => {
    if (accountSaving) return;
    setAccountSaving(true);
    try {
      if (editingAccount) {
        await axios.put(`${API}/api/demand-studio/social/accounts/${editingAccount.account_id}${getOrgParam()}`, accountForm, { withCredentials: true });
        toast.success(isEs ? "Cuenta actualizada" : "Account updated");
      } else {
        await axios.post(`${API}/api/demand-studio/social/accounts${getOrgParam()}`, accountForm, { withCredentials: true });
        toast.success(isEs ? "Cuenta guardada" : "Account saved");
      }
      setAccountDialogOpen(false);
      setEditingAccount(null);
      setAccountForm({ platform: "instagram", handle: "", status: "active" });
      await fetchData(isOwnOrg ? null : selectedOrgId);
      fetchCalendarPosts();
    } catch (error) {
      console.error("Error saving account:", error);
      const errMsg = error?.response?.data?.detail || (isEs ? "Error al guardar la cuenta" : "Error saving account");
      toast.error(errMsg);
    } finally {
      setAccountSaving(false);
    }
  };

  const handleDeleteAccount = async (account) => {
    if (!window.confirm(isEs 
      ? `¿Eliminar la cuenta @${account.handle}? Se perderá toda la configuración asociada.` 
      : `Delete account @${account.handle}? All associated configuration will be lost.`)) return;
    try {
      await axios.delete(`${API}/api/demand-studio/social/accounts/${account.account_id}${getOrgParam()}`, { withCredentials: true });
      toast.success(isEs ? "Cuenta eliminada" : "Account deleted");
      await fetchData(isOwnOrg ? null : selectedOrgId);
      fetchCalendarPosts();
    } catch (error) {
      const errMsg = error?.response?.data?.detail || (isEs ? "Error al eliminar" : "Error deleting");
      toast.error(errMsg);
    }
  };

  const openEditAccount = (account) => {
    setEditingAccount(account);
    setAccountForm({ platform: account.platform, handle: account.handle, status: account.status || "active" });
    setAccountDialogOpen(true);
  };

  const openNewAccount = () => {
    setEditingAccount(null);
    setAccountForm({ platform: "instagram", handle: "", status: "active" });
    setAccountDialogOpen(true);
  };

  const handleSavePillar = async () => {
    if (pillarSaving) return;
    setPillarSaving(true);
    try {
      const orgParam = selectedOrgId && !isOwnOrg ? `?org_id=${selectedOrgId}` : "";
      const payload = {
        ...pillarForm,
        weight_percentage: pillarForm.weight_percentage ? parseFloat(pillarForm.weight_percentage) : null
      };
      if (editingPillar) {
        await axios.put(`${API}/api/demand-studio/social/pillars/${editingPillar.pillar_id}${orgParam}`, payload, { withCredentials: true });
        toast.success(isEs ? "Pilar actualizado" : "Pillar updated");
      } else {
        await axios.post(`${API}/api/demand-studio/social/pillars${orgParam}`, payload, { withCredentials: true });
        toast.success(isEs ? "Pilar creado" : "Pillar created");
      }
      setPillarDialogOpen(false);
      setPillarForm({ name: "", description: "", what_is_it: "", why_it_matters: "", content_tags: [], weight_percentage: "", color: "", icon: "", platforms: [] });
      setPillarTagInput("");
      setEditingPillar(null);
      await fetchData(isOwnOrg ? null : selectedOrgId);
      fetchCalendarPosts();
    } catch (error) {
      console.error("Error saving pillar:", error);
      const errMsg = error?.response?.data?.detail || (isEs ? "Error al guardar pilar" : "Error saving pillar");
      toast.error(errMsg);
    } finally {
      setPillarSaving(false);
    }
  };

  const handleDeletePillar = async (pillarId) => {
    if (!window.confirm(isEs ? "¿Eliminar este pilar?" : "Delete this pillar?")) return;
    try {
      await axios.delete(`${API}/api/demand-studio/social/pillars/${pillarId}${getOrgParam()}`, { withCredentials: true });
      toast.success(isEs ? "Pilar eliminado" : "Pillar deleted");
      await fetchData(isOwnOrg ? null : selectedOrgId);
    } catch (error) {
      console.error("Error deleting pillar:", error);
      toast.error(isEs ? "Error al eliminar pilar" : "Error deleting pillar");
    }
  };

  const openEditPillar = (pillar) => {
    setEditingPillar(pillar);
    setPillarForm({ 
      name: pillar.name, 
      description: pillar.description || "",
      what_is_it: pillar.what_is_it || "",
      why_it_matters: pillar.why_it_matters || "",
      content_tags: pillar.content_tags || [],
      weight_percentage: pillar.weight_percentage || "",
      color: pillar.color || "",
      icon: pillar.icon || "",
      platforms: pillar.platforms || []
    });
    setPillarTagInput("");
    setPillarDialogOpen(true);
  };

  const togglePillarPlatform = (platform) => {
    setPillarForm(prev => {
      const currentPlatforms = prev.platforms || [];
      return {
        ...prev,
        platforms: currentPlatforms.includes(platform)
          ? currentPlatforms.filter(p => p !== platform)
          : [...currentPlatforms, platform]
      };
    });
  };

  // Audiences handlers
  const handleSaveAudience = async () => {
    if (audienceSaving) return;
    setAudienceSaving(true);
    try {
      const orgParam = selectedOrgId && !isOwnOrg ? `?org_id=${selectedOrgId}` : "";
      if (editingAudience) {
        await axios.put(`${API}/api/demand-studio/social/audiences/${editingAudience.audience_id}${orgParam}`, audienceForm, { withCredentials: true });
        toast.success(isEs ? "Audiencia actualizada" : "Audience updated");
      } else {
        await axios.post(`${API}/api/demand-studio/social/audiences${orgParam}`, audienceForm, { withCredentials: true });
        toast.success(isEs ? "Audiencia creada" : "Audience created");
      }
      setAudienceDialogOpen(false);
      setAudienceForm({ name: "", description: "", platforms: [], sub_audiences: [] });
      setEditingAudience(null);
      await fetchData(isOwnOrg ? null : selectedOrgId);
    } catch (error) {
      console.error("Error saving audience:", error);
      const errMsg = error?.response?.data?.detail || (isEs ? "Error al guardar audiencia" : "Error saving audience");
      toast.error(errMsg);
    } finally {
      setAudienceSaving(false);
    }
  };

  const handleDeleteAudience = async (audienceId) => {
    if (!window.confirm(isEs ? "¿Eliminar esta audiencia?" : "Delete this audience?")) return;
    try {
      await axios.delete(`${API}/api/demand-studio/social/audiences/${audienceId}${getOrgParam()}`, { withCredentials: true });
      toast.success(isEs ? "Audiencia eliminada" : "Audience deleted");
      await fetchData(isOwnOrg ? null : selectedOrgId);
    } catch (error) {
      console.error("Error deleting audience:", error);
      toast.error(isEs ? "Error al eliminar audiencia" : "Error deleting audience");
    }
  };

  const openEditAudience = (audience) => {
    setEditingAudience(audience);
    setAudienceForm({ 
      name: audience.name, 
      description: audience.description || "",
      platforms: audience.platforms || [],
      sub_audiences: audience.sub_audiences || []
    });
    setAudienceDialogOpen(true);
  };

  const toggleAudiencePlatform = (platform) => {
    setAudienceForm(prev => {
      const currentPlatforms = prev.platforms || [];
      return {
        ...prev,
        platforms: currentPlatforms.includes(platform)
          ? currentPlatforms.filter(p => p !== platform)
          : [...currentPlatforms, platform]
      };
    });
  };

  // Segments handlers
  const handleSaveSegment = async () => {
    if (segmentSaving) return;
    setSegmentSaving(true);
    try {
      const orgParam = selectedOrgId && !isOwnOrg ? `?org_id=${selectedOrgId}` : "";
      if (editingSegment) {
        await axios.put(`${API}/api/demand-studio/social/segments/${editingSegment.segment_id}${orgParam}`, segmentForm, { withCredentials: true });
        toast.success(isEs ? "Segmento actualizado" : "Segment updated");
      } else {
        await axios.post(`${API}/api/demand-studio/social/segments${orgParam}`, segmentForm, { withCredentials: true });
        toast.success(isEs ? "Segmento creado" : "Segment created");
      }
      setSegmentDialogOpen(false);
      setSegmentForm({ name: "", description: "", platforms: [], pillar_ids: [] });
      setEditingSegment(null);
      await fetchData(isOwnOrg ? null : selectedOrgId);
    } catch (error) {
      console.error("Error saving segment:", error);
      const errMsg = error?.response?.data?.detail || (isEs ? "Error al guardar segmento" : "Error saving segment");
      toast.error(errMsg);
    } finally {
      setSegmentSaving(false);
    }
  };

  const handleDeleteSegment = async (segmentId) => {
    if (!window.confirm(isEs ? "¿Eliminar este segmento?" : "Delete this segment?")) return;
    try {
      await axios.delete(`${API}/api/demand-studio/social/segments/${segmentId}${getOrgParam()}`, { withCredentials: true });
      toast.success(isEs ? "Segmento eliminado" : "Segment deleted");
      await fetchData(isOwnOrg ? null : selectedOrgId);
    } catch (error) {
      console.error("Error deleting segment:", error);
      toast.error(isEs ? "Error al eliminar segmento" : "Error deleting segment");
    }
  };

  const openEditSegment = (segment) => {
    setEditingSegment(segment);
    setSegmentForm({ 
      name: segment.name, 
      description: segment.description || "",
      platforms: segment.platforms || [],
      pillar_ids: segment.pillar_ids || []
    });
    setSegmentDialogOpen(true);
  };

  const toggleSegmentPlatform = (platform) => {
    setSegmentForm(prev => {
      const currentPlatforms = prev.platforms || [];
      return {
        ...prev,
        platforms: currentPlatforms.includes(platform)
          ? currentPlatforms.filter(p => p !== platform)
          : [...currentPlatforms, platform]
      };
    });
  };

  // Ideas handlers
  const handleSaveIdea = async () => {
    if (ideaSaving) return;
    setIdeaSaving(true);
    try {
      const payload = { ...ideaForm };
      if (!payload.pillar_id) delete payload.pillar_id;
      
      if (editingIdea) {
        await axios.put(`${API}/api/demand-studio/social/ideas/${editingIdea.idea_id}${getOrgParam()}`, payload, { withCredentials: true });
      } else {
        await axios.post(`${API}/api/demand-studio/social/ideas${getOrgParam()}`, payload, { withCredentials: true });
      }
      setIdeaDialogOpen(false);
      setEditingIdea(null);
      resetIdeaForm();
      await fetchData(isOwnOrg ? null : selectedOrgId);
    } catch (error) {
      console.error("Error saving idea:", error);
      toast.error(isEs ? "Error al guardar la idea" : "Error saving idea");
    } finally {
      setIdeaSaving(false);
    }
  };

  const handleDeleteIdea = async (ideaId) => {
    if (!window.confirm(isEs ? "¿Eliminar esta idea?" : "Delete this idea?")) return;
    try {
      await axios.delete(`${API}/api/demand-studio/social/ideas/${ideaId}${getOrgParam()}`, { withCredentials: true });
      await fetchData(isOwnOrg ? null : selectedOrgId);
    } catch (error) {
      console.error("Error deleting idea:", error);
      toast.error(isEs ? "Error al eliminar la idea" : "Error deleting idea");
    }
  };

  const handleConvertIdea = async (accountId) => {
    if (!ideaToConvert || !accountId || convertingSaving) return;
    setConvertingSaving(true);
    try {
      await axios.post(`${API}/api/demand-studio/social/ideas/${ideaToConvert.idea_id}/convert-to-post?social_account_id=${accountId}&target_status=${convertTargetStatus}${selectedOrgId && !isOwnOrg ? `&org_id=${selectedOrgId}` : ""}`, {}, { withCredentials: true });
      setConvertIdeaDialogOpen(false);
      setIdeaToConvert(null);
      setConvertTargetStatus("production");
      setConvertTargetAccount("");
      await fetchData(isOwnOrg ? null : selectedOrgId);
      fetchCalendarPosts();
    } catch (error) {
      console.error("Error converting idea:", error);
      toast.error(isEs ? "Error al convertir la idea" : "Error converting idea");
    } finally {
      setConvertingSaving(false);
    }
  };

  const openEditIdea = (idea) => {
    setEditingIdea(idea);
    setIdeaForm({
      title: idea.title,
      description: idea.description || "",
      source_url: idea.source_url || "",
      pillar_id: idea.pillar_id || "",
      segment_id: idea.segment_id || "",
      audience_id: idea.audience_id || "",
      social_account_id: idea.social_account_id || "",
      tags: idea.tags || [],
      status: idea.status,
      content_body: idea.content_body || ""
    });
    setIdeaDialogOpen(true);
  };

  const resetIdeaForm = () => {
    setIdeaForm({
      title: "",
      description: "",
      source_url: "",
      pillar_id: "",
      segment_id: "",
      audience_id: "",
      social_account_id: "",
      tags: [],
      status: "new",
      content_body: ""
    });
    setTagInput("");
  };

  const addTag = () => {
    if (tagInput.trim() && !ideaForm.tags.includes(tagInput.trim())) {
      setIdeaForm({ ...ideaForm, tags: [...ideaForm.tags, tagInput.trim()] });
      setTagInput("");
    }
  };

  const removeTag = (tag) => {
    setIdeaForm({ ...ideaForm, tags: ideaForm.tags.filter(t => t !== tag) });
  };

  const openEditPost = (post) => {
    setEditingPost(post);
    setPostForm({
      social_account_id: post.social_account_id,
      campaign_id: post.campaign_id || "",
      pillar_id: post.pillar_id || "",
      audience_id: post.audience_id || "",
      sub_audience_id: post.sub_audience_id || "",
      segment_id: post.segment_id || "",
      format: post.format,
      status: post.status,
      title: post.title,
      caption: post.caption || "",
      hook: post.hook || "",
      cta: post.cta || "",
      scheduled_at: post.scheduled_at || "",
      production_date: post.production_date || "",
      link_url: post.link_url || "",
      notes: post.notes || "",
      content_body: post.content_body || ""
    });
    setPostDialogOpen(true);
  };

  const resetPostForm = () => {
    setPostForm({
      social_account_id: accounts[0]?.account_id || "",
      campaign_id: "",
      pillar_id: "",
      audience_id: "",
      sub_audience_id: "",
      segment_id: "",
      format: "post",
      status: "idea",
      title: "",
      caption: "",
      hook: "",
      cta: "",
      scheduled_at: "",
      production_date: "",
      link_url: "",
      notes: "",
      content_body: ""
    });
  };

  const getStatusBadge = (status) => {
    const s = STATUSES.find(st => st.value === status);
    return s ? <Badge className={s.color}>{isEs ? s.labelEs : s.label}</Badge> : <Badge>{status}</Badge>;
  };

  const getIdeaStatusBadge = (status) => {
    const s = IDEA_STATUSES.find(st => st.value === status);
    return s ? <Badge className={s.color}>{isEs ? s.labelEs : s.label}</Badge> : <Badge>{status}</Badge>;
  };

  const getFormatBadge = (format) => {
    const f = FORMATS.find(ft => ft.value === format);
    return f ? <Badge variant="outline">{isEs ? f.labelEs : f.label}</Badge> : <Badge variant="outline">{format}</Badge>;
  };

  const getPlatformInfo = (platform) => {
    return PLATFORMS.find(p => p.value === platform) || PLATFORMS[0];
  };

  const getAccountName = (accountId) => {
    const account = accounts.find(a => a.account_id === accountId);
    if (!account) return "-";
    const platform = getPlatformInfo(account.platform);
    return `${account.handle} (${platform.label})`;
  };

  // Filter posts
  const filteredPosts = posts.filter(post => {
    // Exclude items with status "idea" from queue - they belong in Ideas tab
    if (post.status === "idea") return false;
    if (filterAccount !== "all" && post.social_account_id !== filterAccount) return false;
    if (filterStatus !== "all" && post.status !== filterStatus) return false;
    if (filterFormat !== "all" && post.format !== filterFormat) return false;
    if (filterCampaign !== "all" && post.campaign_id !== filterCampaign) return false;
    if (filterPillar !== "all" && post.pillar_id !== filterPillar) return false;
    return true;
  });

  // Filter calendar posts
  const filteredCalendarPosts = calendarPosts.filter(post => {
    if (calFilterAccount !== "all" && post.social_account_id !== calFilterAccount) return false;
    if (calFilterFormat !== "all" && post.format !== calFilterFormat) return false;
    if (calFilterPillar !== "all" && post.pillar_id !== calFilterPillar) return false;
    return true;
  });

  // Combine ideas from ideas collection + posts with status "idea"
  const allIdeas = [
    ...ideas,
    ...posts.filter(p => p.status === "idea").map(p => ({
      idea_id: p.post_id,
      title: p.title,
      description: p.caption || p.notes || "",
      source_url: p.link_url || "",
      pillar_id: p.pillar_id || "",
      tags: p.tags || [],
      status: "new",
      created_at: p.created_at,
      _from_post: true,
      _post: p
    }))
  ];

  // Calendar helpers
  const getDaysInMonth = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const getPostsForDay = (day) => {
    if (!day) return [];
    const dateStr = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return filteredCalendarPosts.filter(p => {
      const scheduledDate = p.scheduled_at?.substring(0, 10);
      const postedDate = p.posted_at?.substring(0, 10);
      const createdDate = (!p.scheduled_at && !p.posted_at) ? p.created_at?.substring(0, 10) : null;
      return scheduledDate === dateStr || postedDate === dateStr || createdDate === dateStr;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Helper to get platform icon
  const getPlatformIcon = (platform) => {
    switch (platform?.toLowerCase()) {
      case 'instagram': return <Instagram className="w-4 h-4 text-pink-500" />;
      case 'linkedin': return <Linkedin className="w-4 h-4 text-blue-600" />;
      case 'youtube': return <Youtube className="w-4 h-4 text-red-500" />;
      case 'tiktok': return <Hash className="w-4 h-4" />;
      case 'facebook': return <Hash className="w-4 h-4 text-blue-500" />;
      default: return <AtSign className="w-4 h-4" />;
    }
  };

  // Separate owned and shared accounts
  const ownedAccounts = accessibleAccounts.filter(a => a._access_type === "owned");
  const sharedAccounts = accessibleAccounts.filter(a => a._access_type === "shared");

  return (
    <div className="space-y-6" data-testid="social-media-page">
      {/* Account Selector Dropdown - Account-centric model */}
      {accessibleAccounts.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border" data-testid="account-selector">
          <AtSign className="w-5 h-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              {isEs ? "Cuenta activa:" : "Active account:"}
            </p>
          </div>
          <Select value={selectedAccountId || "all"} onValueChange={handleAccountChange}>
            <SelectTrigger className="w-72" data-testid="account-selector-trigger">
              <SelectValue>
                {selectedAccountId && selectedAccount ? (
                  <div className="flex items-center gap-2">
                    {getPlatformIcon(selectedAccount.platform)}
                    <span>@{selectedAccount.handle}</span>
                    {selectedAccount._access_type === "shared" && (
                      <Badge variant="secondary" className="text-[10px] ml-1">
                        {isEs ? "Compartida" : "Shared"}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    {isEs ? "Todas mis cuentas" : "All my accounts"}
                  </div>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {/* All accounts option */}
              <SelectItem value="all" data-testid="account-option-all">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  {isEs ? "Todas mis cuentas" : "All my accounts"}
                </div>
              </SelectItem>
              
              {/* Owned accounts section */}
              {ownedAccounts.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">
                    {isEs ? "Mis Cuentas" : "My Accounts"}
                  </div>
                  {ownedAccounts.map(acc => (
                    <SelectItem key={acc.account_id} value={acc.account_id} data-testid={`account-option-${acc.account_id}`}>
                      <div className="flex items-center gap-2">
                        {getPlatformIcon(acc.platform)}
                        <span>@{acc.handle}</span>
                        <Badge variant="outline" className="text-[10px] ml-1 capitalize">
                          {acc.platform}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </>
              )}
              
              {/* Shared accounts section */}
              {sharedAccounts.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">
                    {isEs ? "Compartidas Conmigo" : "Shared With Me"}
                  </div>
                  {sharedAccounts.map(acc => (
                    <SelectItem key={acc.account_id} value={acc.account_id} data-testid={`account-option-shared-${acc.account_id}`}>
                      <div className="flex items-center gap-2">
                        {getPlatformIcon(acc.platform)}
                        <span>@{acc.handle}</span>
                        <Badge variant="secondary" className="text-[10px] ml-1">
                          {acc._shared_by}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {acc._role === "contributor" ? (isEs ? "Editar" : "Edit") : (isEs ? "Ver" : "View")}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Shared Account Banner */}
      {isViewingShared && selectedAccount && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800" data-testid="shared-account-banner">
          <Share2 className="w-5 h-5 text-blue-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              {isEs 
                ? `Viendo @${selectedAccount.handle} (compartida por ${selectedAccount._shared_by})` 
                : `Viewing @${selectedAccount.handle} (shared by ${selectedAccount._shared_by})`}
            </p>
            <p className="text-xs text-blue-600">
              {selectedAccount._role === "contributor" 
                ? (isEs ? "Puedes crear y editar contenido para esta cuenta" : "You can create and edit content for this account")
                : (isEs ? "Solo puedes ver el contenido de esta cuenta" : "You can only view content for this account")}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => handleAccountChange("all")} data-testid="back-to-all-accounts">
            {isEs ? "Volver a mis cuentas" : "Back to my accounts"}
          </Button>
        </div>
      )}

      {/* View Tabs */}
      <Tabs value={activeView} onValueChange={setActiveView}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">{isEs ? "Resumen" : "Overview"}</span>
            </TabsTrigger>
            <TabsTrigger value="ideas" className="gap-2">
              <Lightbulb className="w-4 h-4" />
              <span className="hidden sm:inline">{isEs ? "Ideas" : "Ideas"}</span>
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-2">
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">{isEs ? "Calendario" : "Calendar"}</span>
            </TabsTrigger>
            <TabsTrigger value="queue" className="gap-2">
              <List className="w-4 h-4" />
              <span className="hidden sm:inline">{isEs ? "Cola" : "Queue"}</span>
            </TabsTrigger>
            <TabsTrigger value="production" className="gap-2">
              <Video className="w-4 h-4" />
              <span className="hidden sm:inline">{isEs ? "Producción" : "Production"}</span>
            </TabsTrigger>
            <TabsTrigger value="editing" className="gap-2">
              <Film className="w-4 h-4" />
              <span className="hidden sm:inline">{isEs ? "Edición" : "Editing"}</span>
            </TabsTrigger>
            <TabsTrigger value="feed" className="gap-2">
              <Grid3X3 className="w-4 h-4" />
              <span className="hidden sm:inline">Feed</span>
            </TabsTrigger>
            <TabsTrigger value="archived" className="gap-2">
              <Archive className="w-4 h-4" />
              <span className="hidden sm:inline">{isEs ? "Archivados" : "Archived"}</span>
            </TabsTrigger>
            <TabsTrigger value="metrics" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">{isEs ? "Métricas" : "Metrics"}</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">{isEs ? "Config" : "Settings"}</span>
            </TabsTrigger>
          </TabsList>
          
          <div className="flex gap-2">
            <GlobalActivityLog 
              orgId={selectedOrgId && !isOwnOrg ? selectedOrgId : null}
              trigger={
                <Button variant="outline" size="icon" data-testid="demand-studio-activity-log-btn">
                  <History className="w-4 h-4" />
                </Button>
              }
            />
            <Button variant="outline" onClick={() => setStudioOpen(true)}>
              <Wand2 className="w-4 h-4 mr-2" />
              Studio
            </Button>
            <Button variant="outline" onClick={() => { resetIdeaForm(); setIdeaDialogOpen(true); }}>
              <Lightbulb className="w-4 h-4 mr-2" />
              {isEs ? "Nueva Idea" : "New Idea"}
            </Button>
            <Button onClick={() => { resetPostForm(); setPostDialogOpen(true); }} data-testid="new-post-button">
              <Plus className="w-4 h-4 mr-2" />
              {isEs ? "Nuevo Post" : "New Post"}
            </Button>
          </div>
        </div>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.scheduledThisWeek || 0}</p>
                    <p className="text-xs text-muted-foreground">
                      {isEs ? "Programados esta semana" : "Scheduled this week"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <Check className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.postedThisMonth || 0}</p>
                    <p className="text-xs text-muted-foreground">
                      {isEs ? "Publicados este mes" : "Posted this month"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Lightbulb className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{allIdeas.filter(i => i.status !== 'archived' && i.status !== 'used').length}</p>
                    <p className="text-xs text-muted-foreground">
                      {isEs ? "Ideas pendientes" : "Pending ideas"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                    <Play className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.campaignLinkedPosts || 0}</p>
                    <p className="text-xs text-muted-foreground">
                      {isEs ? "Posts con campaña" : "Campaign-linked"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Insights */}
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{isEs ? "Por Formato" : "By Format"}</CardTitle>
              </CardHeader>
              <CardContent>
                {insights.byFormat?.length > 0 ? (
                  <div className="space-y-2">
                    {insights.byFormat.map(item => (
                      <div key={item.format} className="flex justify-between items-center">
                        <span className="text-sm capitalize">{item.format}</span>
                        <Badge variant="secondary">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{isEs ? "Sin datos" : "No data"}</p>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{isEs ? "Por Pilar" : "By Pillar"}</CardTitle>
              </CardHeader>
              <CardContent>
                {insights.byPillar?.length > 0 ? (
                  <div className="space-y-2">
                    {insights.byPillar.map(item => (
                      <div key={item.pillar_id} className="flex justify-between items-center">
                        <span className="text-sm">{item.name}</span>
                        <Badge variant="secondary">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{isEs ? "Sin datos" : "No data"}</p>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{isEs ? "Por Estado" : "By Status"}</CardTitle>
              </CardHeader>
              <CardContent>
                {insights.byStatus?.length > 0 ? (
                  <div className="space-y-2">
                    {insights.byStatus.map(item => (
                      <div key={item.status} className="flex justify-between items-center">
                        <span className="text-sm capitalize">{item.status}</span>
                        <Badge variant="secondary">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{isEs ? "Sin datos" : "No data"}</p>
                )}
                {insights.totalPosts > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      {isEs ? "Tasa de publicación" : "Post rate"}: <span className="font-semibold text-foreground">{insights.postRate}%</span>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Audience & Sub-Audience Insights */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card data-testid="insights-by-audience">
              <CardHeader>
                <CardTitle className="text-base">{isEs ? "Por Audiencia" : "By Audience"}</CardTitle>
              </CardHeader>
              <CardContent>
                {insights.byAudience?.length > 0 ? (
                  <div className="space-y-2">
                    {insights.byAudience.map(item => (
                      <div key={item.audience_id} className="flex justify-between items-center">
                        <span className="text-sm">{item.name}</span>
                        <Badge variant="secondary">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{isEs ? "Sin datos - asigna audiencias a tus posts" : "No data - assign audiences to your posts"}</p>
                )}
              </CardContent>
            </Card>
            
            <Card data-testid="insights-by-sub-audience">
              <CardHeader>
                <CardTitle className="text-base">{isEs ? "Por Sub-Audiencia" : "By Sub-Audience"}</CardTitle>
              </CardHeader>
              <CardContent>
                {insights.bySubAudience?.length > 0 ? (
                  <div className="space-y-2">
                    {insights.bySubAudience.map(item => (
                      <div key={`${item.audience_id}-${item.sub_audience_id}`} className="flex justify-between items-center">
                        <div className="text-sm">
                          <span className="font-medium">{item.sub_audience_name}</span>
                          <span className="text-xs text-muted-foreground ml-1.5">({item.audience_name})</span>
                        </div>
                        <Badge variant="secondary">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{isEs ? "Sin datos - asigna sub-audiencias a tus posts" : "No data - assign sub-audiences to your posts"}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Activity Feed - Recent Changes */}
          <div className="mt-6">
            <ActivityFeed accountId={selectedAccountId} orgId={selectedOrgId && !isOwnOrg ? selectedOrgId : null} limit={8} />
          </div>
        </TabsContent>

        {/* Ideas Tab */}
        <TabsContent value="ideas" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">{isEs ? "Ideas e Inspiración" : "Ideas & Inspiration"}</h3>
              <p className="text-sm text-muted-foreground">
                {isEs ? "Guarda ideas de contenido para usar después" : "Save content ideas to use later"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={ideaGroupBy} onValueChange={setIdeaGroupBy}>
                <SelectTrigger className="w-[180px] h-9" data-testid="idea-group-select">
                  <SelectValue placeholder={isEs ? "Agrupar por..." : "Group by..."} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Sin agrupar" : "No grouping"}</SelectItem>
                  <SelectItem value="pillar">{isEs ? "Por Pilar" : "By Pillar"}</SelectItem>
                  <SelectItem value="segment">{isEs ? "Por Segmento" : "By Segment"}</SelectItem>
                  <SelectItem value="audience">{isEs ? "Por Audiencia" : "By Audience"}</SelectItem>
                  <SelectItem value="status">{isEs ? "Por Estado" : "By Status"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {allIdeas.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Lightbulb className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {isEs ? "No hay ideas guardadas. ¡Agrega tu primera idea!" : "No saved ideas. Add your first idea!"}
                </p>
              </CardContent>
            </Card>
          ) : (() => {
            // Group ideas
            const grouped = {};
            const getLabelForGroup = (key, groupType) => {
              if (key === "_unassigned") return isEs ? "Sin asignar" : "Unassigned";
              if (key === "used") return isEs ? "Usadas" : "Used";
              if (groupType === "pillar") return pillars.find(p => p.pillar_id === key)?.name || key;
              if (groupType === "segment") return segments.find(s => s.segment_id === key)?.name || key;
              if (groupType === "audience") return audiences.find(a => a.audience_id === key)?.name || key;
              if (groupType === "status") {
                const s = IDEA_STATUSES.find(st => st.value === key);
                return isEs ? (s?.labelEs || key) : (s?.label || key);
              }
              return key;
            };
            const getIconForGroup = (key, groupType) => {
              if (groupType === "pillar") return pillars.find(p => p.pillar_id === key)?.icon;
              return null;
            };

            if (ideaGroupBy === "none") {
              // Separate used ideas at the bottom
              const active = allIdeas.filter(i => i.status !== "used" && !i._from_post);
              const used = allIdeas.filter(i => i.status === "used" || i._from_post);
              if (active.length > 0) grouped["_active"] = active;
              if (used.length > 0) grouped["used"] = used;
            } else {
              allIdeas.forEach(i => {
                let key;
                if (ideaGroupBy === "pillar") key = i.pillar_id || "_unassigned";
                else if (ideaGroupBy === "segment") key = i.segment_id || "_unassigned";
                else if (ideaGroupBy === "audience") key = i.audience_id || "_unassigned";
                else if (ideaGroupBy === "status") key = i.status || "new";
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(i);
              });
            }

            // Sort: _unassigned last, used last
            const sortedKeys = Object.keys(grouped).sort((a, b) => {
              if (a === "used") return 1;
              if (b === "used") return -1;
              if (a === "_unassigned") return 1;
              if (b === "_unassigned") return -1;
              if (a === "_active") return -1;
              if (b === "_active") return 1;
              return 0;
            });

            return (
              <div className="space-y-6">
                {sortedKeys.map(groupKey => {
                  const items = grouped[groupKey];
                  const showHeader = ideaGroupBy !== "none" || groupKey === "used";
                  const label = groupKey === "_active" 
                    ? (isEs ? "Activas" : "Active")
                    : getLabelForGroup(groupKey, ideaGroupBy);
                  const icon = getIconForGroup(groupKey, ideaGroupBy);
                  
                  return (
                    <div key={groupKey}>
                      {showHeader && (
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                          {icon && <span>{icon}</span>}
                          <h4 className="font-semibold text-sm">{label}</h4>
                          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                        </div>
                      )}
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {items.map(idea => {
                          const ideaPillar = pillars.find(p => p.pillar_id === idea.pillar_id);
                          const ideaSegment = segments.find(s => s.segment_id === idea.segment_id);
                          const ideaAudience = audiences.find(a => a.audience_id === idea.audience_id);
                          const ideaAccount = accounts.find(a => a.account_id === idea.social_account_id);
                          return (
                            <Card key={idea.idea_id} className="hover:shadow-md transition-shadow group" data-testid={`idea-card-${idea.idea_id}`}>
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between mb-2">
                                  <h4 className="font-medium line-clamp-2 flex-1">{idea.title}</h4>
                                  {getIdeaStatusBadge(idea.status)}
                                </div>
                                {idea.description && (
                                  <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{idea.description}</p>
                                )}
                                {/* Metadata badges */}
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                  {ideaPillar && (
                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                                      {ideaPillar.icon || ""} {ideaPillar.name}
                                    </span>
                                  )}
                                  {ideaSegment && (
                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">{ideaSegment.name}</span>
                                  )}
                                  {ideaAudience && (
                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{ideaAudience.name}</span>
                                  )}
                                  {ideaAccount && (
                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{ideaAccount.handle}</span>
                                  )}
                                </div>
                                {idea.tags?.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mb-2">
                                    {idea.tags.map(tag => (
                                      <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                                    ))}
                                  </div>
                                )}
                                {idea.source_url && (
                                  <a href={idea.source_url} target="_blank" rel="noopener noreferrer"
                                    className="text-xs text-blue-500 hover:underline flex items-center gap-1 mb-2">
                                    <ExternalLink className="w-3 h-3" />
                                    {isEs ? "Ver fuente" : "View source"}
                                  </a>
                                )}
                                <div className="flex justify-end gap-1 pt-2 border-t">
                                  {idea._from_post ? (
                                    <>
                                      <Button variant="ghost" size="sm"
                                        onClick={(e) => { e.stopPropagation(); handleQuickStatusChange(idea.idea_id, "production", idea.title); }}
                                        className="text-orange-600 hover:text-orange-700 hover:bg-orange-50" data-testid="idea-to-production-btn">
                                        <Video className="w-4 h-4 mr-1" />{isEs ? "Producción" : "Production"}
                                      </Button>
                                      <Button variant="ghost" size="icon" onClick={() => openEditPost(idea._post)}><Settings className="w-4 h-4" /></Button>
                                      <Button variant="ghost" size="icon" onClick={() => handleDeletePost(idea.idea_id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                                    </>
                                  ) : (
                                    <>
                                      {idea.status !== "used" && (
                                        <Button variant="ghost" size="sm"
                                          onClick={() => { setIdeaToConvert(idea); setConvertIdeaDialogOpen(true); }}>
                                          <ArrowRight className="w-4 h-4 mr-1" />{isEs ? "A Post" : "To Post"}
                                        </Button>
                                      )}
                                      <Button variant="ghost" size="icon" onClick={() => openEditIdea(idea)}><Settings className="w-4 h-4" /></Button>
                                      <Button variant="ghost" size="icon" onClick={() => handleDeleteIdea(idea.idea_id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                                    </>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </TabsContent>

        {/* Calendar Tab */}
        <TabsContent value="calendar" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <h3 className="font-semibold min-w-[150px] text-center">
                {calendarMonth.toLocaleDateString(isEs ? 'es' : 'en', { month: 'long', year: 'numeric' })}
              </h3>
              <Button variant="outline" size="icon" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            
            {/* Calendar Filters */}
            <div className="flex flex-wrap gap-2">
              <Select value={calFilterAccount} onValueChange={setCalFilterAccount}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder={isEs ? "Canal" : "Channel"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
                  {accounts.map(a => (
                    <SelectItem key={a.account_id} value={a.account_id}>
                      <span className="flex items-center gap-2">{getPlatformIcon(a.platform)} {a.handle || a.account_name || a.platform}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={calFilterFormat} onValueChange={setCalFilterFormat}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder={isEs ? "Tipo" : "Type"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
                  {FORMATS.map(f => (
                    <SelectItem key={f.value} value={f.value}>{isEs ? f.labelEs : f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={calFilterPillar} onValueChange={setCalFilterPillar}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder={isEs ? "Pilar" : "Pillar"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
                  {pillars.map(p => (
                    <SelectItem key={p.pillar_id} value={p.pillar_id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Pillar Mini Report */}
          {calendarPillarStats && calendarPillarStats.pillars && calendarPillarStats.pillars.length > 0 && (
            <div className="space-y-2" data-testid="calendar-pillar-stats">
              <div className="flex flex-wrap gap-3">
                {calendarPillarStats.pillars.map(ps => {
                  const statusCounts = ps.by_status || {};
                  const posted = statusCounts.posted || 0;
                  const production = statusCounts.production || 0;
                  const editing = statusCounts.editing || 0;
                  const queue = (statusCounts.drafted || 0) + (statusCounts.calendar || 0) + (statusCounts.scheduled || 0);
                  const actualPct = ps.actual_percentage || 0;
                  const targetPct = ps.target_percentage || 0;
                  const isOver = ps.over_target;
                  return (
                    <div key={ps.pillar_id} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border bg-card ${isOver ? 'border-red-300 bg-red-50/50' : ''}`} style={{ borderLeftWidth: 4, borderLeftColor: ps.color || "#6B7280" }}>
                      <div className="flex items-center gap-2">
                        {ps.icon && <span className="text-base">{ps.icon}</span>}
                        <div>
                          <p className="text-sm font-semibold leading-tight">{ps.name}</p>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">{ps.total} {ps.total === 1 ? "post" : "posts"}</span>
                            <span className="text-xs font-bold" style={{ color: isOver ? '#EF4444' : (ps.color || '#6B7280') }}>
                              {actualPct}%
                            </span>
                            {targetPct > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                / {targetPct}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1.5 ml-2">
                        {posted > 0 && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">{posted} {isEs ? "pub" : "pub"}</span>}
                        {production > 0 && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{production} {isEs ? "prod" : "prod"}</span>}
                        {editing > 0 && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{editing} {isEs ? "edit" : "edit"}</span>}
                        {queue > 0 && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{queue} {isEs ? "cola" : "queue"}</span>}
                        {isOver && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700" data-testid="pillar-over-alert">
                            +{ps.diff_from_target}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {calendarPillarStats.pillars.some(ps => ps.over_target) && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs" data-testid="pillar-balance-warning">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                  <span>
                    {isEs 
                      ? `Algunos pilares superan su peso objetivo este mes. Revisa la distribución de contenido.`
                      : `Some pillars exceed their target weight this month. Review content distribution.`}
                  </span>
                </div>
              )}
            </div>
          )}
          
          <Card>
            <CardContent className="p-4">
              <DragDropContext onDragEnd={handleCalendarDragEnd}>
                <div className="grid grid-cols-7 gap-1">
                  {[isEs ? 'Dom' : 'Sun', isEs ? 'Lun' : 'Mon', isEs ? 'Mar' : 'Tue', isEs ? 'Mié' : 'Wed', isEs ? 'Jue' : 'Thu', isEs ? 'Vie' : 'Fri', isEs ? 'Sáb' : 'Sat'].map(day => (
                    <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                      {day}
                    </div>
                  ))}
                  {getDaysInMonth().map((day, idx) => {
                    const dayPosts = getPostsForDay(day);
                    const dateStr = day ? `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : `empty-${idx}`;
                    return (
                      <Droppable droppableId={`cal-${dateStr}`} key={idx} isDropDisabled={!day}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`min-h-[80px] p-1 border rounded transition-colors ${day ? 'bg-background' : 'bg-muted/30'} ${snapshot.isDraggingOver && day ? 'bg-blue-50 border-blue-300' : ''}`}
                          >
                            {day && (
                              <>
                                <span className="text-xs font-medium">{day}</span>
                                <div className="space-y-1 mt-1">
                                  {dayPosts.slice(0, 3).map((post, postIdx) => {
                                    const platform = post.account?.platform;
                                    const isPosted = post.status === 'posted';
                                    const formatIcon = post.format === 'reel' ? '🎬' : post.format === 'carousel' ? '📸' : post.format === 'story' ? '⏱' : post.format === 'live' ? '🔴' : '📄';
                                    return (
                                      <Draggable key={post.post_id} draggableId={post.post_id} index={postIdx}>
                                        {(dragProvided, dragSnapshot) => (
                                          <div
                                            ref={dragProvided.innerRef}
                                            {...dragProvided.draggableProps}
                                            {...dragProvided.dragHandleProps}
                                            className={`text-xs p-1 rounded truncate cursor-grab flex items-center gap-1 ${
                                              isPosted ? 'bg-green-50 opacity-60' : 'bg-blue-100'
                                            } ${dragSnapshot.isDragging ? 'shadow-lg ring-2 ring-blue-400 opacity-90' : ''}`}
                                            onClick={() => openEditPost(post)}
                                            data-testid="calendar-draggable-post"
                                          >
                                            <GripVertical className="w-2 h-2 text-muted-foreground flex-shrink-0" />
                                            <span className="flex-shrink-0">{getPlatformIcon(platform)}</span>
                                            <span className="flex-shrink-0 text-[10px] leading-none">{formatIcon}</span>
                                            <span className={`truncate ${isPosted ? 'line-through' : ''}`}>{post.title}</span>
                                            {isPosted && <Check className="w-3 h-3 text-green-600 flex-shrink-0" />}
                                            {postCommentCounts[post.post_id]?.unread > 0 && (
                                              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                                            )}
                                            {postCommentCounts[post.post_id]?.comments > 0 && !postCommentCounts[post.post_id]?.unread && (
                                              <AtSign className="w-2.5 h-2.5 text-gray-400 flex-shrink-0" />
                                            )}
                                          </div>
                                        )}
                                      </Draggable>
                                    );
                                  })}
                                  {dayPosts.length > 3 && (
                                    <span className="text-xs text-muted-foreground">+{dayPosts.length - 3} más</span>
                                  )}
                                </div>
                              </>
                            )}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    );
                  })}
                </div>
              </DragDropContext>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Queue Tab */}
        <TabsContent value="queue" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <Select value={filterAccount} onValueChange={setFilterAccount}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={isEs ? "Cuenta" : "Account"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEs ? "Todas" : "All"}</SelectItem>
                {accounts.map(a => (
                  <SelectItem key={a.account_id} value={a.account_id}>
                    <span className="flex items-center gap-2">{getPlatformIcon(a.platform)} {a.handle || a.account_name || a.platform}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={isEs ? "Estado" : "Status"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
                {STATUSES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{isEs ? s.labelEs : s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterFormat} onValueChange={setFilterFormat}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder={isEs ? "Formato" : "Format"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
                {FORMATS.map(f => (
                  <SelectItem key={f.value} value={f.value}>{isEs ? f.labelEs : f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterPillar} onValueChange={setFilterPillar}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder={isEs ? "Pilar" : "Pillar"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
                {pillars.map(p => (
                  <SelectItem key={p.pillar_id} value={p.pillar_id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterCampaign} onValueChange={setFilterCampaign}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={isEs ? "Campaña" : "Campaign"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEs ? "Todas" : "All"}</SelectItem>
                {campaigns.map(c => (
                  <SelectItem key={c.campaign_id} value={c.campaign_id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Posts Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 text-sm font-medium">{isEs ? "Fecha" : "Date"}</th>
                      <th className="text-left p-3 text-sm font-medium">{isEs ? "Cuenta" : "Account"}</th>
                      <th className="text-left p-3 text-sm font-medium">{isEs ? "Formato" : "Format"}</th>
                      <th className="text-left p-3 text-sm font-medium">{isEs ? "Estado" : "Status"}</th>
                      <th className="text-left p-3 text-sm font-medium">{isEs ? "Título" : "Title"}</th>
                      <th className="text-left p-3 text-sm font-medium">{isEs ? "Pilar" : "Pillar"}</th>
                      <th className="text-left p-3 text-sm font-medium">{isEs ? "Audiencia" : "Audience"}</th>
                      <th className="text-left p-3 text-sm font-medium">{isEs ? "Sub-Aud." : "Sub-Aud."}</th>
                      <th className="text-left p-3 text-sm font-medium">{isEs ? "Segmento" : "Segment"}</th>
                      <th className="text-right p-3 text-sm font-medium">{isEs ? "Acciones" : "Actions"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPosts.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center py-8 text-muted-foreground">
                          {isEs ? "No hay posts" : "No posts"}
                        </td>
                      </tr>
                    ) : (
                      filteredPosts.map(post => (
                        <tr key={post.post_id} className="border-b hover:bg-muted/30">
                          <td className="p-3 text-sm">
                            {post.scheduled_at ? new Date(post.scheduled_at).toLocaleDateString() : "-"}
                          </td>
                          <td className="p-3 text-sm">{getAccountName(post.social_account_id)}</td>
                          <td className="p-3">{getFormatBadge(post.format)}</td>
                          <td className="p-3">{getStatusBadge(post.status)}</td>
                          <td className="p-3 text-sm font-medium max-w-[200px]">
                            <div className="flex items-center gap-1.5">
                              <div className="truncate">{post.title}</div>
                              {/* Online editors indicator */}
                              {(() => {
                                const editors = pageOnlineUsers.filter(u => u.entity_id === post.post_id);
                                if (editors.length > 0) {
                                  return <PresenceAvatarStack users={editors} size="xs" maxShow={2} />;
                                }
                                return null;
                              })()}
                              {(() => {
                                const cc = postCommentCounts[post.post_id];
                                if (!cc) return null;
                                const hasUnread = cc.unread > 0;
                                const hasComments = cc.comments > 0;
                                if (!hasComments && !hasUnread) return null;
                                return (
                                  <span 
                                    className={`inline-flex items-center gap-0.5 flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                      hasUnread ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                                    }`}
                                    title={`${cc.comments} ${isEs ? 'comentarios' : 'comments'}${hasUnread ? `, ${cc.unread} ${isEs ? 'nuevos' : 'new'}` : ''}`}
                                    data-testid="post-comment-badge"
                                  >
                                    <AtSign className="w-2.5 h-2.5" />
                                    {cc.comments}
                                  </span>
                                );
                              })()}
                            </div>
                            {post.link_url && (
                              <a href={post.link_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline truncate block" title={post.link_url}>
                                {isEs ? "URL Fuente" : "Source URL"}
                              </a>
                            )}
                          </td>
                          <td className="p-3 text-sm">
                            {post.pillar_id ? pillars.find(p => p.pillar_id === post.pillar_id)?.name || "-" : "-"}
                          </td>
                          <td className="p-3 text-sm">
                            {post.audience_id ? audiences.find(a => a.audience_id === post.audience_id)?.name || "-" : "-"}
                          </td>
                          <td className="p-3 text-sm text-xs">
                            {(() => {
                              if (!post.sub_audience_id || !post.audience_id) return "-";
                              const aud = audiences.find(a => a.audience_id === post.audience_id);
                              const sub = aud?.sub_audiences?.find(sa => sa.sub_id === post.sub_audience_id);
                              return sub?.name || "-";
                            })()}
                          </td>
                          <td className="p-3 text-sm">
                            {post.segment_id ? segments.find(s => s.segment_id === post.segment_id)?.name || "-" : "-"}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditPost(post)} title={isEs ? "Ver post" : "View post"} data-testid="view-post-btn">
                                <Eye className="w-4 h-4 text-blue-500" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" data-testid="quick-status-menu">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {STATUSES.filter(s => s.value !== post.status).map(s => (
                                    <DropdownMenuItem key={s.value} onClick={() => handleQuickStatusChange(post.post_id, s.value, post.title)} data-testid={`quick-status-${s.value}`}>
                                      <ArrowUpRight className="w-3 h-3 mr-2" />
                                      {isEs ? s.labelEs : s.label}
                                    </DropdownMenuItem>
                                  ))}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleDuplicatePost(post.post_id)}>
                                    <Copy className="w-3 h-3 mr-2" />
                                    {isEs ? "Duplicar" : "Duplicate"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleDeletePost(post.post_id)} className="text-red-600">
                                    <Trash2 className="w-3 h-3 mr-2" />
                                    {isEs ? "Eliminar" : "Delete"}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Production Tab - Shows items with status: production or editing, grouped by production_date */}
        <TabsContent value="production" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="w-5 h-5" />
                {isEs ? "Producción" : "Production"}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {isEs 
                  ? "Contenido que necesita ser grabado o editado, agrupado por fecha de producción"
                  : "Content that needs to be recorded or edited, grouped by production date"}
              </p>
            </CardHeader>
            <CardContent>
              {(() => {
                // Filter posts with status production or editing
                const productionPosts = posts.filter(p => p.status === "production" || p.status === "editing");
                
                if (productionPosts.length === 0) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      <Video className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>{isEs ? "No hay contenido en producción" : "No content in production"}</p>
                      <p className="text-xs mt-1">
                        {isEs 
                          ? "Cambia el estado de un post a 'Producción' o 'Edición' para verlo aquí"
                          : "Change a post status to 'Production' or 'Editing' to see it here"}
                      </p>
                    </div>
                  );
                }
                
                // Group by production_date
                const grouped = productionPosts.reduce((acc, post) => {
                  const date = post.production_date || "no_date";
                  if (!acc[date]) acc[date] = [];
                  acc[date].push(post);
                  return acc;
                }, {});
                
                // Sort dates ascending (earliest first), with no_date at end
                const sortedDates = Object.keys(grouped).sort((a, b) => {
                  if (a === "no_date") return 1;
                  if (b === "no_date") return -1;
                  return new Date(a) - new Date(b);
                });
                
                return (
                  <div className="space-y-6">
                    {sortedDates.map(date => (
                      <div key={date} className="border rounded-lg overflow-hidden">
                        <div className="bg-muted px-4 py-2 font-medium flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          {date === "no_date" 
                            ? (isEs ? "Sin fecha de producción" : "No production date")
                            : new Date(date + "T00:00:00").toLocaleDateString(isEs ? "es-ES" : "en-US", { 
                                weekday: 'long', 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric' 
                              })
                          }
                          <span className="ml-auto text-sm text-muted-foreground">
                            {grouped[date].length} {grouped[date].length === 1 ? "item" : "items"}
                          </span>
                        </div>
                        <div className="divide-y">
                          {grouped[date].map(post => (
                            <div 
                              key={post.post_id} 
                              className="p-4 hover:bg-muted/30 cursor-pointer flex items-center gap-4"
                              onClick={() => openEditPost(post)}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-medium truncate">{post.title}</p>
                                  {postCommentCounts[post.post_id]?.unread > 0 && (
                                    <span className="inline-flex items-center gap-0.5 flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500 text-white" data-testid="post-comment-badge">
                                      <AtSign className="w-2.5 h-2.5" />
                                      {postCommentCounts[post.post_id].unread}
                                    </span>
                                  )}
                                  {postCommentCounts[post.post_id]?.comments > 0 && !postCommentCounts[post.post_id]?.unread && (
                                    <span className="inline-flex items-center gap-0.5 flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                      <AtSign className="w-2.5 h-2.5" />
                                      {postCommentCounts[post.post_id].comments}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                                  <span>{getAccountName(post.social_account_id)}</span>
                                  <span>•</span>
                                  <span>{getFormatBadge(post.format)}</span>
                                </div>
                                {post.link_url && (
                                  <a href={post.link_url.startsWith('http') ? post.link_url : `https://${post.link_url}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-1" title={post.link_url} data-testid="production-post-link-url">
                                    <ExternalLink className="w-3 h-3" />
                                    {isEs ? "URL Fuente" : "Source URL"}
                                  </a>
                                )}
                              </div>
                              <div>
                                {getStatusBadge(post.status)}
                              </div>
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                {post.status === "production" && (
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => handleQuickStatusChange(post.post_id, "editing", post.title)}
                                    data-testid="production-to-editing-btn"
                                    className="text-xs"
                                  >
                                    <Film className="w-3 h-3 mr-1" />
                                    {isEs ? "A Edición" : "To Editing"}
                                  </Button>
                                )}
                                {post.status === "editing" && (
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => handleQuickStatusChange(post.post_id, "drafted", post.title)}
                                    data-testid="editing-to-drafted-btn"
                                    className="text-xs"
                                  >
                                    <Check className="w-3 h-3 mr-1" />
                                    {isEs ? "A Borrador" : "To Draft"}
                                  </Button>
                                )}
                              </div>
                              {post.scheduled_at && (
                                <div className="text-xs text-muted-foreground">
                                  <span className="block">{isEs ? "Publicar:" : "Publish:"}</span>
                                  {new Date(post.scheduled_at).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Editing Only Tab - Shows only items with status: editing, sorted by production_date descending */}
        <TabsContent value="editing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Film className="w-5 h-5" />
                {isEs ? "Solo Edición" : "Editing Only"}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {isEs 
                  ? "Contenido que está siendo editado, ordenado por fecha de producción (más reciente primero)"
                  : "Content being edited, sorted by production date (most recent first)"}
              </p>
            </CardHeader>
            <CardContent>
              {(() => {
                // Filter posts with status editing only
                const editingPosts = posts
                  .filter(p => p.status === "editing")
                  .sort((a, b) => {
                    // Sort by production_date descending
                    if (!a.production_date && !b.production_date) return 0;
                    if (!a.production_date) return 1;
                    if (!b.production_date) return -1;
                    return new Date(b.production_date) - new Date(a.production_date);
                  });
                
                if (editingPosts.length === 0) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      <Film className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>{isEs ? "No hay contenido en edición" : "No content in editing"}</p>
                    </div>
                  );
                }
                
                return (
                  <div className="space-y-2">
                    {editingPosts.map(post => (
                      <div 
                        key={post.post_id} 
                        className="p-4 border rounded-lg hover:bg-muted/30 cursor-pointer flex items-center gap-4"
                        onClick={() => openEditPost(post)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium truncate">{post.title}</p>
                            {postCommentCounts[post.post_id]?.unread > 0 && (
                              <span className="inline-flex items-center gap-0.5 flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500 text-white" data-testid="post-comment-badge">
                                <AtSign className="w-2.5 h-2.5" />
                                {postCommentCounts[post.post_id].unread}
                              </span>
                            )}
                            {postCommentCounts[post.post_id]?.comments > 0 && !postCommentCounts[post.post_id]?.unread && (
                              <span className="inline-flex items-center gap-0.5 flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                <AtSign className="w-2.5 h-2.5" />
                                {postCommentCounts[post.post_id].comments}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                            <span>{getAccountName(post.social_account_id)}</span>
                            <span>•</span>
                            <span>{getFormatBadge(post.format)}</span>
                            {post.production_date && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Video className="w-3 h-3" />
                                  {new Date(post.production_date + "T00:00:00").toLocaleDateString()}
                                </span>
                              </>
                            )}
                          </div>
                          {post.link_url && (
                            <a href={post.link_url.startsWith('http') ? post.link_url : `https://${post.link_url}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-1" title={post.link_url} data-testid="editing-post-link-url">
                              <ExternalLink className="w-3 h-3" />
                              {isEs ? "URL Fuente" : "Source URL"}
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleQuickStatusChange(post.post_id, "drafted", post.title)}
                            data-testid="editing-to-draft-btn"
                            className="text-xs"
                          >
                            <Check className="w-3 h-3 mr-1" />
                            {isEs ? "A Borrador" : "To Draft"}
                          </Button>
                        </div>
                        {post.scheduled_at && (
                          <div className="text-xs text-muted-foreground text-right">
                            <span className="block">{isEs ? "Publicar:" : "Publish:"}</span>
                            {new Date(post.scheduled_at).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Feed Tab */}
        <TabsContent value="feed">
          <FeedTab campaigns={campaigns} pillars={pillars} />
        </TabsContent>

        {/* Archived Tab */}
        <TabsContent value="archived">
          <Card>
            <CardHeader>
              <CardTitle>{isEs ? "Posts Archivados" : "Archived Posts"}</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const archivedPosts = posts.filter(p => p.status === "archived");
                const archivedIdeas = ideas.filter(i => i.status === "archived");
                if (archivedPosts.length === 0 && archivedIdeas.length === 0) {
                  return <p className="text-muted-foreground text-center py-8">{isEs ? "No hay elementos archivados" : "No archived items"}</p>;
                }
                return (
                  <div className="space-y-4">
                    {archivedPosts.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium mb-2">{isEs ? "Posts" : "Posts"} ({archivedPosts.length})</h3>
                        <div className="space-y-2">
                          {archivedPosts.map(post => {
                            const account = accounts.find(a => a.account_id === post.social_account_id);
                            const platformIcon = getPlatformIcon(account?.platform);
                            return (
                              <div key={post.post_id} className="flex items-center justify-between border rounded-lg p-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="text-lg">{platformIcon}</span>
                                  <div className="min-w-0">
                                    <p className="font-medium truncate">{post.title}</p>
                                    <p className="text-xs text-muted-foreground">{post.caption?.substring(0, 60)}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Button size="sm" variant="outline" onClick={() => { openEditPost(post); }}>
                                    <Edit className="w-3.5 h-3.5 mr-1" /> {isEs ? "Editar" : "Edit"}
                                  </Button>
                                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeletePost(post.post_id)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {archivedIdeas.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium mb-2">{isEs ? "Ideas Archivadas" : "Archived Ideas"} ({archivedIdeas.length})</h3>
                        <div className="space-y-2">
                          {archivedIdeas.map(idea => (
                            <div key={idea.idea_id} className="flex items-center justify-between border rounded-lg p-3">
                              <div className="min-w-0">
                                <p className="font-medium truncate">{idea.title}</p>
                                <p className="text-xs text-muted-foreground">{idea.description?.substring(0, 60)}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Button size="sm" variant="outline" onClick={() => { openEditIdea(idea); }}>
                                  <Edit className="w-3.5 h-3.5 mr-1" /> {isEs ? "Editar" : "Edit"}
                                </Button>
                                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeleteIdea(idea.idea_id)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metrics">
          <SocialMetricsSection />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Accounts */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">{isEs ? "Cuentas Sociales" : "Social Accounts"}</CardTitle>
                <Button size="sm" onClick={openNewAccount} data-testid="add-account-btn">
                  <Plus className="w-4 h-4 mr-1" />
                  {isEs ? "Agregar" : "Add"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Scope Filter Tabs */}
                <div className="flex border-b">
                  <button 
                    className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                      scopeFilter === "all" 
                        ? "border-primary text-primary" 
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setScopeFilter("all")}
                  >
                    {isEs ? "Todas" : "All"} ({accounts.length})
                  </button>
                  <button 
                    className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                      scopeFilter === "owned" 
                        ? "border-primary text-primary" 
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setScopeFilter("owned")}
                  >
                    {isEs ? "Mías" : "Mine"} ({accounts.filter(a => a._access_type !== "shared").length})
                  </button>
                  <button 
                    className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                      scopeFilter === "shared" 
                        ? "border-primary text-primary" 
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setScopeFilter("shared")}
                  >
                    {isEs ? "Compartidas" : "Shared"} ({accounts.filter(a => a._access_type === "shared").length})
                  </button>
                </div>

                {accounts.filter(a => 
                  scopeFilter === "all" || 
                  (scopeFilter === "owned" && a._access_type !== "shared") ||
                  (scopeFilter === "shared" && a._access_type === "shared")
                ).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {scopeFilter === "shared" 
                      ? (isEs ? "No hay cuentas compartidas contigo" : "No accounts shared with you")
                      : (isEs ? "No hay cuentas" : "No accounts")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {accounts
                      .filter(a => 
                        scopeFilter === "all" || 
                        (scopeFilter === "owned" && a._access_type !== "shared") ||
                        (scopeFilter === "shared" && a._access_type === "shared")
                      )
                      .map(account => {
                      const platform = getPlatformInfo(account.platform);
                      return (
                        <div key={account.account_id} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full ${platform.color} flex items-center justify-center`}>
                              <platform.icon className="w-4 h-4 text-white" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{account.handle}</p>
                              <div className="flex items-center gap-1">
                                <p className="text-xs text-muted-foreground">{platform.label}</p>
                                {account._access_type === "shared" && (
                                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                                    {isEs ? "de" : "from"} {account._shared_by}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {account._access_type === "shared" && (
                              <Badge variant="secondary" className="text-[10px]">
                                {account._role === "social_contributor" ? (isEs ? "Editar" : "Edit") : (isEs ? "Ver" : "View")}
                              </Badge>
                            )}
                            <Badge variant={account.status === "active" ? "default" : "secondary"}>
                              {account.status}
                            </Badge>
                            {account._access_type !== "shared" && (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditAccount(account)} data-testid={`edit-account-${account.account_id}`}>
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteAccount(account)} data-testid={`delete-account-${account.account_id}`}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Content Pillars */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{isEs ? "Pilares de Contenido" : "Content Pillars"}</CardTitle>
                <Button size="sm" onClick={() => { setEditingPillar(null); setPillarForm({ name: "", description: "", what_is_it: "", why_it_matters: "", content_tags: [], weight_percentage: "", color: "", icon: "", platforms: [] }); setPillarTagInput(""); setPillarDialogOpen(true); }}>
                  <Plus className="w-4 h-4 mr-1" />
                  {isEs ? "Agregar" : "Add"}
                </Button>
              </CardHeader>
              <CardContent>
                {pillars.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isEs ? "No hay pilares configurados. Agrega pilares para organizar tu estrategia de contenido." : "No pillars configured. Add pillars to organize your content strategy."}</p>
                ) : (
                  <div className="space-y-4">
                    {pillars.map((pillar, idx) => {
                      const PILLAR_COLORS = ["#E8E0F0", "#D4EDDA", "#FFF3CD", "#D1ECF1", "#F8D7DA", "#E2E3E5"];
                      const PILLAR_ACCENTS = ["#7C3AED", "#10B981", "#F59E0B", "#0EA5E9", "#EF4444", "#6B7280"];
                      const bgColor = pillar.color || PILLAR_COLORS[idx % PILLAR_COLORS.length];
                      const accentColor = PILLAR_ACCENTS[idx % PILLAR_ACCENTS.length];
                      return (
                        <div key={pillar.pillar_id} className="rounded-xl p-5 relative group" style={{ backgroundColor: bgColor }} data-testid={`pillar-card-${pillar.pillar_id}`}>
                          {/* Header */}
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {pillar.icon && <span className="text-xl">{pillar.icon}</span>}
                              <div>
                                <h3 className="font-bold text-base text-gray-900">P{idx + 1} — {pillar.name}</h3>
                                {pillar.description && <p className="text-sm text-gray-600">{pillar.description}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {pillar.weight_percentage > 0 && (
                                <span className="text-sm font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: `${accentColor}20`, color: accentColor }}>
                                  {pillar.weight_percentage}%
                                </span>
                              )}
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditPillar(pillar)}>
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDeletePillar(pillar.pillar_id)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                          {/* Progress bar */}
                          {pillar.weight_percentage > 0 && (
                            <div className="w-1/3 h-1.5 rounded-full bg-black/10 mb-3">
                              <div className="h-1.5 rounded-full" style={{ width: `${Math.min(pillar.weight_percentage, 100)}%`, backgroundColor: accentColor }} />
                            </div>
                          )}
                          {/* Qué es / Por qué importa */}
                          {(pillar.what_is_it || pillar.why_it_matters) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                              {pillar.what_is_it && (
                                <div className="bg-gray-900/80 rounded-lg p-3">
                                  <span className="text-xs font-semibold text-emerald-400">{isEs ? "Qué es:" : "What it is:"}</span>
                                  <p className="text-sm text-gray-200 mt-1">{pillar.what_is_it}</p>
                                </div>
                              )}
                              {pillar.why_it_matters && (
                                <div className="bg-gray-900/80 rounded-lg p-3">
                                  <span className="text-xs font-semibold text-amber-400">{isEs ? "Por qué importa:" : "Why it matters:"}</span>
                                  <p className="text-sm text-gray-200 mt-1">{pillar.why_it_matters}</p>
                                </div>
                              )}
                            </div>
                          )}
                          {/* Content tags */}
                          {pillar.content_tags && pillar.content_tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {pillar.content_tags.map((tag, i) => (
                                <span key={i} className="text-xs px-3 py-1.5 rounded-full bg-white/70 text-gray-800 font-medium border border-gray-200">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Platform icons */}
                          {pillar.platforms && pillar.platforms.length > 0 && (
                            <div className="flex gap-1 mt-2">
                              {pillar.platforms.map(p => {
                                const opt = PLATFORM_OPTIONS.find(o => o.value === p);
                                const Icon = opt?.icon || Hash;
                                return <Icon key={p} className="w-3.5 h-3.5 text-gray-500" />;
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Audiences */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{isEs ? "Audiencias" : "Audiences"}</CardTitle>
                <Button size="sm" onClick={() => { setEditingAudience(null); setAudienceForm({ name: "", description: "", platforms: [], sub_audiences: [] }); setAudienceDialogOpen(true); }}>
                  <Plus className="w-4 h-4 mr-1" />
                  {isEs ? "Agregar" : "Add"}
                </Button>
              </CardHeader>
              <CardContent>
                {audiences.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isEs ? "No hay audiencias" : "No audiences"}</p>
                ) : (
                  <div className="space-y-2">
                    {audiences.map(audience => (
                      <div key={audience.audience_id} className="flex items-center justify-between p-2 bg-muted rounded-lg group">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{audience.name}</p>
                          {audience.description && (
                            <p className="text-xs text-muted-foreground">{audience.description}</p>
                          )}
                          {audience.sub_audiences && audience.sub_audiences.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {audience.sub_audiences.map(sub => (
                                <span key={sub.sub_id} className="inline-flex items-center text-[10px] px-1.5 py-0.5 bg-violet-50 text-violet-700 rounded border border-violet-200" title={sub.description || ""}>
                                  {sub.name}
                                </span>
                              ))}
                            </div>
                          )}
                          {audience.platforms && audience.platforms.length > 0 ? (
                            <div className="flex gap-1 mt-1">
                              {audience.platforms.map(p => {
                                const opt = PLATFORM_OPTIONS.find(o => o.value === p);
                                const Icon = opt?.icon || Hash;
                                return (
                                  <span key={p} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-background rounded border">
                                    <Icon className="w-3 h-3" />
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-[10px] text-muted-foreground mt-1">{isEs ? "Todas las plataformas" : "All platforms"}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditAudience(audience)}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDeleteAudience(audience.audience_id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Segments */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{isEs ? "Segmentos" : "Segments"}</CardTitle>
                <Button size="sm" onClick={() => { setEditingSegment(null); setSegmentForm({ name: "", description: "", platforms: [], pillar_ids: [] }); setSegmentDialogOpen(true); }}>
                  <Plus className="w-4 h-4 mr-1" />
                  {isEs ? "Agregar" : "Add"}
                </Button>
              </CardHeader>
              <CardContent>
                {segments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isEs ? "No hay segmentos" : "No segments"}</p>
                ) : (
                  <div className="space-y-2">
                    {segments.map(segment => (
                      <div key={segment.segment_id} className="flex items-center justify-between p-2 bg-muted rounded-lg group">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{segment.name}</p>
                          {segment.description && (
                            <p className="text-xs text-muted-foreground">{segment.description}</p>
                          )}
                          {segment.pillar_ids && segment.pillar_ids.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {segment.pillar_ids.map(pid => {
                                const pillar = pillars.find(p => p.pillar_id === pid);
                                return pillar ? (
                                  <span key={pid} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                                    {pillar.name}
                                  </span>
                                ) : null;
                              })}
                            </div>
                          )}
                          {segment.platforms && segment.platforms.length > 0 ? (
                            <div className="flex gap-1 mt-1">
                              {segment.platforms.map(p => {
                                const opt = PLATFORM_OPTIONS.find(o => o.value === p);
                                const Icon = opt?.icon || Hash;
                                return (
                                  <span key={p} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-background rounded border">
                                    <Icon className="w-3 h-3" />
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-[10px] text-muted-foreground mt-1">{isEs ? "Todas las plataformas" : "All platforms"}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditSegment(segment)}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDeleteSegment(segment.segment_id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Social Sharing Section - Organization Level */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-4">
              <Share2 className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">{isEs ? "Compartir Organización Completa" : "Share Full Organization"}</h3>
            </div>
            <SocialSharing selectedOrgId={selectedOrgId} />
          </div>

          {/* Account-Level Sharing Section */}
          <div className="mt-6">
            <AccountSharing accounts={accounts} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Post Dialog */}
      <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPost ? (isEs ? "Editar Post" : "Edit Post") : (isEs ? "Nuevo Post" : "New Post")}
            </DialogTitle>
          </DialogHeader>
          
          {/* Show who else is editing this post (Figma-style) */}
          {editingPost && entityViewers.length > 0 && (
            <EntityPresenceBar viewers={entityViewers} isEs={isEs} />
          )}

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Cuenta" : "Account"} *</label>
                <Select value={postForm.social_account_id} onValueChange={v => setPostForm({...postForm, social_account_id: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => (
                      <SelectItem key={a.account_id} value={a.account_id}>
                        {a.handle} ({a.platform})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Formato" : "Format"}</label>
                <Select value={postForm.format} onValueChange={v => setPostForm({...postForm, format: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMATS.map(f => (
                      <SelectItem key={f.value} value={f.value}>{isEs ? f.labelEs : f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Estado" : "Status"}</label>
                <Select value={postForm.status} onValueChange={v => setPostForm({...postForm, status: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{isEs ? s.labelEs : s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Fecha programada" : "Scheduled date"}</label>
                <Input
                  type="datetime-local"
                  value={postForm.scheduled_at}
                  onChange={e => setPostForm({...postForm, scheduled_at: e.target.value})}
                />
              </div>
            </div>

            {/* Production Date - shown when status is production or editing */}
            {(postForm.status === "production" || postForm.status === "editing") && (
              <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Video className="w-4 h-4 text-orange-600" />
                  {isEs ? "Fecha de Producción" : "Production Date"} *
                </label>
                <Input
                  type="date"
                  value={postForm.production_date}
                  onChange={e => setPostForm({...postForm, production_date: e.target.value})}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {isEs ? "Fecha en que se grabará/producirá el contenido" : "Date when content will be recorded/produced"}
                </p>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Campaña" : "Campaign"}</label>
                <Select value={postForm.campaign_id || "none"} onValueChange={v => setPostForm({...postForm, campaign_id: v === "none" ? "" : v})}>
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Sin campaña" : "No campaign"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin campaña" : "No campaign"}</SelectItem>
                    {campaigns.map(c => (
                      <SelectItem key={c.campaign_id} value={c.campaign_id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Pilar" : "Pillar"}</label>
                <Select value={postForm.pillar_id || "none"} onValueChange={v => setPostForm({...postForm, pillar_id: v === "none" ? "" : v})}>
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Sin pilar" : "No pillar"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin pilar" : "No pillar"}</SelectItem>
                    {pillars
                      .filter(p => {
                        // Filter pillars by selected account's platform
                        const selectedAccount = accounts.find(a => a.account_id === postForm.social_account_id);
                        const platform = selectedAccount?.platform;
                        // Show pillar if: no platforms set (global) OR platform matches
                        return !p.platforms || p.platforms.length === 0 || (platform && p.platforms.includes(platform));
                      })
                      .map(p => (
                        <SelectItem key={p.pillar_id} value={p.pillar_id}>{p.name}</SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Audience and Segment selectors */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Audiencia" : "Audience"}</label>
                <Select value={postForm.audience_id || "none"} onValueChange={v => setPostForm({...postForm, audience_id: v === "none" ? "" : v, sub_audience_id: ""})}>
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Sin audiencia" : "No audience"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin audiencia" : "No audience"}</SelectItem>
                    {audiences
                      .filter(a => {
                        const selectedAccount = accounts.find(acc => acc.account_id === postForm.social_account_id);
                        const platform = selectedAccount?.platform;
                        return !a.platforms || a.platforms.length === 0 || (platform && a.platforms.includes(platform));
                      })
                      .map(a => (
                        <SelectItem key={a.audience_id} value={a.audience_id}>{a.name}</SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Sub-Audiencia" : "Sub-Audience"}</label>
                <Select 
                  value={postForm.sub_audience_id || "none"} 
                  onValueChange={v => setPostForm({...postForm, sub_audience_id: v === "none" ? "" : v})}
                  disabled={!postForm.audience_id}
                >
                  <SelectTrigger data-testid="sub-audience-selector">
                    <SelectValue placeholder={isEs ? "Sin sub-audiencia" : "No sub-audience"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin sub-audiencia" : "No sub-audience"}</SelectItem>
                    {(audiences.find(a => a.audience_id === postForm.audience_id)?.sub_audiences || []).map(sa => (
                      <SelectItem key={sa.sub_id} value={sa.sub_id}>{sa.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Segmento" : "Segment"}</label>
              <Select value={postForm.segment_id || "none"} onValueChange={v => setPostForm({...postForm, segment_id: v === "none" ? "" : v})}>
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Sin segmento" : "No segment"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Sin segmento" : "No segment"}</SelectItem>
                  {segments
                    .filter(s => {
                      const selectedAccount = accounts.find(acc => acc.account_id === postForm.social_account_id);
                      const platform = selectedAccount?.platform;
                      return !s.platforms || s.platforms.length === 0 || (platform && s.platforms.includes(platform));
                    })
                    .map(s => (
                      <SelectItem key={s.segment_id} value={s.segment_id}>{s.name}</SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Título" : "Title"} *</label>
              <Input
                value={postForm.title}
                onChange={e => setPostForm({...postForm, title: e.target.value})}
                placeholder={isEs ? "Título del post" : "Post title"}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Hook</label>
              <Input
                value={postForm.hook}
                onChange={e => setPostForm({...postForm, hook: e.target.value})}
                placeholder={isEs ? "Gancho inicial" : "Opening hook"}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Caption</label>
              <textarea
                className="w-full min-h-[100px] p-2 border rounded-md text-sm"
                value={postForm.caption}
                onChange={e => setPostForm({...postForm, caption: e.target.value})}
                placeholder={isEs ? "Texto del post..." : "Post caption..."}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">CTA</label>
              <Input
                value={postForm.cta}
                onChange={e => setPostForm({...postForm, cta: e.target.value})}
                placeholder={isEs ? "Llamada a la acción" : "Call to action"}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "URL Fuente (inspiración)" : "Source URL (inspiration)"}</label>
              <div className="flex items-center gap-2">
                <Input
                  value={postForm.link_url}
                  onChange={e => setPostForm({...postForm, link_url: e.target.value})}
                  placeholder="https://..."
                  className="flex-1"
                />
                {postForm.link_url && (
                  <a href={postForm.link_url.startsWith('http') ? postForm.link_url : `https://${postForm.link_url}`} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-blue-500 hover:text-blue-700 transition-colors" data-testid="post-link-url-open">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Notas" : "Notes"}</label>
              <Input
                value={postForm.notes}
                onChange={e => setPostForm({...postForm, notes: e.target.value})}
                placeholder={isEs ? "Notas internas" : "Internal notes"}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Contenido / Script" : "Content / Script"}</label>
              <p className="text-xs text-muted-foreground mb-1">{isEs ? "Texto de carrusel, guión de reel, checklist interno" : "Carousel text, reel script, internal checklist"}</p>
              <RichTextEditor
                value={postForm.content_body}
                onChange={val => setPostForm({...postForm, content_body: val})}
                placeholder={isEs ? "Escribe el contenido de cada slide, guión del reel..." : "Write content for each slide, reel script..."}
                minHeight="150px"
                showAttachments={false}
              />
            </div>
            
            {/* Comments Section - only show when editing */}
            {editingPost && (
              <div className="border-t pt-4 mt-4">
                <CommentsSection 
                  key={editingPost.post_id}
                  entityType="social_post" 
                  entityId={editingPost.post_id}
                  orgId={selectedOrgId}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setPostDialogOpen(false); setEditingPost(null); leaveEntity(); }} disabled={postSaving}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSavePost} disabled={!postForm.social_account_id || !postForm.title || postSaving}>
              {postSaving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account Dialog */}
      <Dialog open={accountDialogOpen} onOpenChange={(open) => { setAccountDialogOpen(open); if (!open) setEditingAccount(null); }}>
        <DialogContent data-testid="account-dialog">
          <DialogHeader>
            <DialogTitle>{editingAccount ? (isEs ? "Editar Cuenta" : "Edit Account") : (isEs ? "Nueva Cuenta" : "New Account")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{isEs ? "Plataforma" : "Platform"}</label>
              <Select value={accountForm.platform} onValueChange={v => setAccountForm({...accountForm, platform: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Handle / Username</label>
              <Input
                value={accountForm.handle}
                onChange={e => setAccountForm({...accountForm, handle: e.target.value})}
                placeholder="@username"
                data-testid="account-handle-input"
              />
            </div>
            {editingAccount && (
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={accountForm.status} onValueChange={v => setAccountForm({...accountForm, status: v})}>
                  <SelectTrigger data-testid="account-status-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{isEs ? "Activa" : "Active"}</SelectItem>
                    <SelectItem value="paused">{isEs ? "Pausada" : "Paused"}</SelectItem>
                    <SelectItem value="inactive">{isEs ? "Inactiva" : "Inactive"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAccountDialogOpen(false); setEditingAccount(null); }} disabled={accountSaving}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveAccount} disabled={!accountForm.handle || accountSaving} data-testid="save-account-btn">
              {accountSaving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {editingAccount ? (isEs ? "Actualizar" : "Update") : (isEs ? "Guardar" : "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pillar Dialog */}
      <Dialog open={pillarDialogOpen} onOpenChange={(open) => { setPillarDialogOpen(open); if (!open) setEditingPillar(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPillar ? (isEs ? "Editar Pilar" : "Edit Pillar") : (isEs ? "Nuevo Pilar" : "New Pillar")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-sm font-medium">{isEs ? "Nombre" : "Name"}</label>
                <Input
                  value={pillarForm.name}
                  onChange={e => setPillarForm({...pillarForm, name: e.target.value})}
                  placeholder={isEs ? "Ej: Food porn, BTS, Social proof" : "E.g., Food porn, BTS, Social proof"}
                  data-testid="pillar-name-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Icono (emoji)" : "Icon (emoji)"}</label>
                <Input
                  value={pillarForm.icon}
                  onChange={e => setPillarForm({...pillarForm, icon: e.target.value})}
                  placeholder="🍽️"
                  className="text-center text-lg"
                  maxLength={4}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Peso %" : "Weight %"}</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={pillarForm.weight_percentage}
                  onChange={e => setPillarForm({...pillarForm, weight_percentage: e.target.value})}
                  placeholder="40"
                  data-testid="pillar-weight-input"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Subtítulo / Objetivo" : "Subtitle / Objective"}</label>
              <Input
                value={pillarForm.description}
                onChange={e => setPillarForm({...pillarForm, description: e.target.value})}
                placeholder={isEs ? "Lo que para el pulgar y genera deseo" : "What stops the scroll and creates desire"}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "¿Qué es?" : "What is it?"}</label>
              <textarea
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={pillarForm.what_is_it}
                onChange={e => setPillarForm({...pillarForm, what_is_it: e.target.value})}
                placeholder={isEs ? "Platos, buffets, montajes fotografiados de manera impactante..." : "Dishes, buffets, table setups photographed beautifully..."}
                rows={3}
                data-testid="pillar-what-is-it"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "¿Por qué importa?" : "Why does it matter?"}</label>
              <textarea
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={pillarForm.why_it_matters}
                onChange={e => setPillarForm({...pillarForm, why_it_matters: e.target.value})}
                placeholder={isEs ? "La comida bien presentada genera deseo universal..." : "Well-presented food generates universal desire..."}
                rows={3}
                data-testid="pillar-why-matters"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Tags de Tipos de Contenido" : "Content Type Tags"}</label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={pillarTagInput}
                  onChange={e => setPillarTagInput(e.target.value)}
                  placeholder={isEs ? "Ej: Reel visual, Foto HD..." : "E.g., Visual reel, HD Photo..."}
                  onKeyDown={e => {
                    if (e.key === "Enter" && pillarTagInput.trim()) {
                      e.preventDefault();
                      setPillarForm({...pillarForm, content_tags: [...(pillarForm.content_tags || []), pillarTagInput.trim()]});
                      setPillarTagInput("");
                    }
                  }}
                  data-testid="pillar-tag-input"
                />
                <Button type="button" size="sm" variant="outline" onClick={() => {
                  if (pillarTagInput.trim()) {
                    setPillarForm({...pillarForm, content_tags: [...(pillarForm.content_tags || []), pillarTagInput.trim()]});
                    setPillarTagInput("");
                  }
                }}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {pillarForm.content_tags && pillarForm.content_tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {pillarForm.content_tags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="gap-1 cursor-pointer" onClick={() => setPillarForm({...pillarForm, content_tags: pillarForm.content_tags.filter((_, j) => j !== i)})}>
                      {tag}
                      <span className="text-xs ml-0.5">x</span>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                {isEs ? "Plataformas" : "Platforms"}
                <span className="text-xs text-muted-foreground ml-2">
                  ({isEs ? "vacío = todas" : "empty = all"})
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                {PLATFORM_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const isSelected = pillarForm.platforms?.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => togglePillarPlatform(opt.value)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        isSelected 
                          ? "bg-primary text-primary-foreground border-primary" 
                          : "bg-muted hover:bg-muted/80 border-transparent"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPillarDialogOpen(false)} disabled={pillarSaving}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSavePillar} disabled={!pillarForm.name || pillarSaving} data-testid="pillar-save-btn">
              {pillarSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audience Dialog */}
      <Dialog open={audienceDialogOpen} onOpenChange={(open) => { setAudienceDialogOpen(open); if (!open) setEditingAudience(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAudience ? (isEs ? "Editar Audiencia" : "Edit Audience") : (isEs ? "Nueva Audiencia" : "New Audience")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{isEs ? "Nombre" : "Name"}</label>
              <Input
                value={audienceForm.name}
                onChange={e => setAudienceForm({...audienceForm, name: e.target.value})}
                placeholder={isEs ? "Ej: Millennials, Empresarios, Mamás" : "E.g., Millennials, Business Owners, Moms"}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Descripción" : "Description"}</label>
              <Input
                value={audienceForm.description}
                onChange={e => setAudienceForm({...audienceForm, description: e.target.value})}
                placeholder={isEs ? "Descripción opcional" : "Optional description"}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                {isEs ? "Plataformas" : "Platforms"}
                <span className="text-xs text-muted-foreground ml-2">
                  ({isEs ? "vacío = todas" : "empty = all"})
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                {PLATFORM_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const isSelected = audienceForm.platforms?.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleAudiencePlatform(opt.value)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        isSelected 
                          ? "bg-primary text-primary-foreground border-primary" 
                          : "bg-muted hover:bg-muted/80 border-transparent"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                {isEs ? "Audiencias Granulares" : "Granular Audiences"}
                <span className="text-xs text-muted-foreground ml-2">
                  ({isEs ? "perfiles específicos dentro de esta audiencia" : "specific profiles within this audience"})
                </span>
              </label>
              <div className="space-y-2">
                {(audienceForm.sub_audiences || []).map((sub, idx) => (
                  <div key={sub.sub_id || idx} className="flex items-start gap-2 p-2 border rounded-lg bg-muted/50">
                    <div className="flex-1 space-y-1">
                      <Input
                        value={sub.name}
                        onChange={e => {
                          const updated = [...audienceForm.sub_audiences];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          setAudienceForm({ ...audienceForm, sub_audiences: updated });
                        }}
                        placeholder={isEs ? "Nombre del perfil" : "Profile name"}
                        className="h-8 text-sm"
                      />
                      <Input
                        value={sub.description || ""}
                        onChange={e => {
                          const updated = [...audienceForm.sub_audiences];
                          updated[idx] = { ...updated[idx], description: e.target.value };
                          setAudienceForm({ ...audienceForm, sub_audiences: updated });
                        }}
                        placeholder={isEs ? "Descripción (opcional)" : "Description (optional)"}
                        className="h-8 text-sm"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 shrink-0"
                      onClick={() => {
                        setAudienceForm({
                          ...audienceForm,
                          sub_audiences: audienceForm.sub_audiences.filter((_, i) => i !== idx)
                        });
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setAudienceForm({
                      ...audienceForm,
                      sub_audiences: [
                        ...(audienceForm.sub_audiences || []),
                        { sub_id: `sub_${Date.now().toString(36)}`, name: "", description: "" }
                      ]
                    });
                  }}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  {isEs ? "Agregar perfil granular" : "Add granular profile"}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAudienceDialogOpen(false)} disabled={audienceSaving}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveAudience} disabled={!audienceForm.name || audienceSaving}>
              {audienceSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Segment Dialog */}
      <Dialog open={segmentDialogOpen} onOpenChange={(open) => { setSegmentDialogOpen(open); if (!open) setEditingSegment(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSegment ? (isEs ? "Editar Segmento" : "Edit Segment") : (isEs ? "Nuevo Segmento" : "New Segment")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{isEs ? "Nombre" : "Name"}</label>
              <Input
                value={segmentForm.name}
                onChange={e => setSegmentForm({...segmentForm, name: e.target.value})}
                placeholder={isEs ? "Ej: Promociones, Lanzamientos, Noticias" : "E.g., Promotions, Launches, News"}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Descripción" : "Description"}</label>
              <Input
                value={segmentForm.description}
                onChange={e => setSegmentForm({...segmentForm, description: e.target.value})}
                placeholder={isEs ? "Descripción opcional" : "Optional description"}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                {isEs ? "Plataformas" : "Platforms"}
                <span className="text-xs text-muted-foreground ml-2">
                  ({isEs ? "vacío = todas" : "empty = all"})
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                {PLATFORM_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const isSelected = segmentForm.platforms?.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleSegmentPlatform(opt.value)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        isSelected 
                          ? "bg-primary text-primary-foreground border-primary" 
                          : "bg-muted hover:bg-muted/80 border-transparent"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                {isEs ? "Pilares que alimentan este segmento" : "Pillars feeding this segment"}
              </label>
              {pillars.length === 0 ? (
                <p className="text-xs text-muted-foreground">{isEs ? "No hay pilares creados" : "No pillars created"}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {pillars.map(pillar => {
                    const isSelected = segmentForm.pillar_ids?.includes(pillar.pillar_id);
                    return (
                      <button
                        key={pillar.pillar_id}
                        type="button"
                        onClick={() => {
                          setSegmentForm(prev => {
                            const ids = prev.pillar_ids || [];
                            return {
                              ...prev,
                              pillar_ids: isSelected ? ids.filter(id => id !== pillar.pillar_id) : [...ids, pillar.pillar_id]
                            };
                          });
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                          isSelected 
                            ? "bg-primary text-primary-foreground border-primary" 
                            : "bg-muted hover:bg-muted/80 border-transparent"
                        }`}
                      >
                        {pillar.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSegmentDialogOpen(false)} disabled={segmentSaving}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveSegment} disabled={!segmentForm.name || segmentSaving}>
              {segmentSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Idea Dialog */}
      <Dialog open={ideaDialogOpen} onOpenChange={setIdeaDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingIdea ? (isEs ? "Editar Idea" : "Edit Idea") : (isEs ? "Nueva Idea" : "New Idea")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{isEs ? "Título" : "Title"} *</label>
              <Input
                value={ideaForm.title}
                onChange={e => setIdeaForm({...ideaForm, title: e.target.value})}
                placeholder={isEs ? "Título de la idea" : "Idea title"}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Descripción" : "Description"}</label>
              <textarea
                className="w-full min-h-[80px] p-2 border rounded-md text-sm"
                value={ideaForm.description}
                onChange={e => setIdeaForm({...ideaForm, description: e.target.value})}
                placeholder={isEs ? "Descripción o notas..." : "Description or notes..."}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "URL Fuente (inspiración)" : "Source URL (inspiration)"}</label>
              <div className="flex items-center gap-2">
                <Input
                  value={ideaForm.source_url}
                  onChange={e => setIdeaForm({...ideaForm, source_url: e.target.value})}
                  placeholder="https://..."
                  className="flex-1"
                />
                {ideaForm.source_url && (
                  <a href={ideaForm.source_url.startsWith('http') ? ideaForm.source_url : `https://${ideaForm.source_url}`} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-blue-500 hover:text-blue-700 transition-colors" data-testid="idea-link-url-open">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{isEs ? "Pilar" : "Pillar"}</label>
                <Select value={ideaForm.pillar_id || "none"} onValueChange={v => setIdeaForm({...ideaForm, pillar_id: v === "none" ? "" : v})}>
                  <SelectTrigger data-testid="idea-pillar-select">
                    <SelectValue placeholder={isEs ? "Sin pilar" : "No pillar"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin pilar" : "No pillar"}</SelectItem>
                    {pillars.map(p => (
                      <SelectItem key={p.pillar_id} value={p.pillar_id}>{p.icon || ""} {p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Segmento" : "Segment"}</label>
                <Select value={ideaForm.segment_id || "none"} onValueChange={v => setIdeaForm({...ideaForm, segment_id: v === "none" ? "" : v})}>
                  <SelectTrigger data-testid="idea-segment-select">
                    <SelectValue placeholder={isEs ? "Sin segmento" : "No segment"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin segmento" : "No segment"}</SelectItem>
                    {segments.map(s => (
                      <SelectItem key={s.segment_id} value={s.segment_id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Audiencia" : "Audience"}</label>
                <Select value={ideaForm.audience_id || "none"} onValueChange={v => setIdeaForm({...ideaForm, audience_id: v === "none" ? "" : v})}>
                  <SelectTrigger data-testid="idea-audience-select">
                    <SelectValue placeholder={isEs ? "Sin audiencia" : "No audience"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin audiencia" : "No audience"}</SelectItem>
                    {audiences.map(a => (
                      <SelectItem key={a.audience_id} value={a.audience_id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Cuenta" : "Account"}</label>
                <Select value={ideaForm.social_account_id || "none"} onValueChange={v => setIdeaForm({...ideaForm, social_account_id: v === "none" ? "" : v})}>
                  <SelectTrigger data-testid="idea-account-select">
                    <SelectValue placeholder={isEs ? "Sin cuenta" : "No account"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin cuenta" : "No account"}</SelectItem>
                    {accounts.map(a => (
                      <SelectItem key={a.account_id} value={a.account_id}>{a.handle} ({a.platform})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Tags</label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  placeholder={isEs ? "Agregar tag..." : "Add tag..."}
                />
                <Button type="button" variant="outline" onClick={addTag}>+</Button>
              </div>
              {ideaForm.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {ideaForm.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => removeTag(tag)}>
                      {tag} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Estado" : "Status"}</label>
              <Select value={ideaForm.status} onValueChange={v => setIdeaForm({...ideaForm, status: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IDEA_STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{isEs ? s.labelEs : s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Contenido / Script" : "Content / Script"}</label>
              <p className="text-xs text-muted-foreground mb-1">{isEs ? "Notas detalladas, guiones, checklist" : "Detailed notes, scripts, checklist"}</p>
              <RichTextEditor
                value={ideaForm.content_body}
                onChange={val => setIdeaForm({...ideaForm, content_body: val})}
                placeholder={isEs ? "Escribe notas detalladas, guiones, checklist..." : "Write detailed notes, scripts, checklist..."}
                minHeight="120px"
                showAttachments={false}
              />
            </div>
            
            {/* Comments Section - only show when editing */}
            {editingIdea && (
              <div className="border-t pt-4 mt-4">
                <CommentsSection 
                  key={editingIdea.idea_id}
                  entityType="idea" 
                  entityId={editingIdea.idea_id}
                  orgId={selectedOrgId}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIdeaDialogOpen(false); setEditingIdea(null); }} disabled={ideaSaving}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveIdea} disabled={!ideaForm.title || ideaSaving}>
              {ideaSaving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert Idea to Post Dialog */}
      <Dialog open={convertIdeaDialogOpen} onOpenChange={setConvertIdeaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Convertir Idea a Post" : "Convert Idea to Post"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isEs 
                ? `Selecciona la cuenta y el estado para crear un post a partir de "${ideaToConvert?.title}"`
                : `Select the account and status to create a post from "${ideaToConvert?.title}"`}
            </p>
            {ideaToConvert?.source_url && (
              <div className="p-2 bg-muted/50 rounded text-xs">
                <span className="font-medium">{isEs ? "URL Fuente:" : "Source URL:"}</span>{" "}
                <a href={ideaToConvert.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">{ideaToConvert.source_url}</a>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">{isEs ? "Cuenta" : "Account"}</label>
              <Select value={convertTargetAccount} onValueChange={setConvertTargetAccount}>
                <SelectTrigger data-testid="convert-account-select">
                  <SelectValue placeholder={isEs ? "Seleccionar cuenta..." : "Select account..."} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map(a => (
                    <SelectItem key={a.account_id} value={a.account_id}>
                      {a.handle} ({a.platform})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Estado del post" : "Post status"}</label>
              <Select value={convertTargetStatus} onValueChange={setConvertTargetStatus}>
                <SelectTrigger data-testid="convert-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.filter(s => !["idea", "posted", "archived"].includes(s.value)).map(s => (
                    <SelectItem key={s.value} value={s.value}>{isEs ? s.labelEs : s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConvertIdeaDialogOpen(false); setIdeaToConvert(null); setConvertTargetAccount(""); setConvertTargetStatus("production"); }}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={() => handleConvertIdea(convertTargetAccount)} disabled={!convertTargetAccount || convertingSaving} data-testid="convert-confirm-btn">
              {convertingSaving ? (isEs ? "Creando..." : "Creating...") : (isEs ? "Crear Post" : "Create Post")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Studio Editor */}
      <StudioEditor
        isOpen={studioOpen}
        onClose={() => setStudioOpen(false)}
        initialAssets={studioAssets}
        campaignId={null}
        onSave={(assets) => {
          console.log("Saved assets:", assets);
          setStudioOpen(false);
        }}
      />

      {/* Quick Status Change Dialog (asks for production date) */}
      <Dialog open={quickStatusDialog.open} onOpenChange={(open) => !open && setQuickStatusDialog({ open: false, postId: null, targetStatus: null, postTitle: "" })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {isEs ? "Fecha de Producción" : "Production Date"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {isEs 
                ? `Mover "${quickStatusDialog.postTitle}" a ${quickStatusDialog.targetStatus === "production" ? "Producción" : "Edición"}`
                : `Move "${quickStatusDialog.postTitle}" to ${quickStatusDialog.targetStatus === "production" ? "Production" : "Editing"}`}
            </p>
            <div>
              <label className="text-sm font-medium">{isEs ? "Fecha de producción" : "Production date"}</label>
              <Input 
                type="date" 
                value={quickProductionDate} 
                onChange={e => setQuickProductionDate(e.target.value)}
                data-testid="quick-production-date-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickStatusDialog({ open: false, postId: null, targetStatus: null, postTitle: "" })}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={confirmQuickStatusChange} data-testid="confirm-quick-status-btn">
              {isEs ? "Confirmar" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

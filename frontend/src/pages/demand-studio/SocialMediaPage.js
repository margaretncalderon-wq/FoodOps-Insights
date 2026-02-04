import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
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
  Plus, Calendar, List, BarChart3, Hash, Instagram, 
  Loader2, Play, Copy, Archive, Check, Settings,
  ChevronLeft, ChevronRight, Linkedin, Youtube
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

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
  { value: "drafted", label: "Drafted", labelEs: "Borrador", color: "bg-yellow-100 text-yellow-800" },
  { value: "scheduled", label: "Scheduled", labelEs: "Programado", color: "bg-blue-100 text-blue-800" },
  { value: "posted", label: "Posted", labelEs: "Publicado", color: "bg-green-100 text-green-800" },
  { value: "archived", label: "Archived", labelEs: "Archivado", color: "bg-gray-100 text-gray-600" },
];

export default function SocialMediaPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState("overview");
  
  // Data
  const [stats, setStats] = useState({});
  const [posts, setPosts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [pillars, setPillars] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [insights, setInsights] = useState({});
  
  // Filters
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterFormat, setFilterFormat] = useState("all");
  const [filterCampaign, setFilterCampaign] = useState("all");
  
  // Calendar
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [calendarPosts, setCalendarPosts] = useState([]);
  
  // Dialogs
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [pillarDialogOpen, setPillarDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  
  // Forms
  const [postForm, setPostForm] = useState({
    social_account_id: "",
    campaign_id: "",
    pillar_id: "",
    format: "post",
    status: "idea",
    title: "",
    caption: "",
    hook: "",
    cta: "",
    scheduled_at: "",
    link_url: "",
    notes: ""
  });
  
  const [accountForm, setAccountForm] = useState({
    platform: "instagram",
    handle: "",
    status: "active"
  });
  
  const [pillarForm, setPillarForm] = useState({
    name: "",
    description: ""
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeView === "calendar") {
      fetchCalendarPosts();
    }
  }, [activeView, calendarMonth]);

  const fetchData = async () => {
    try {
      const [statsRes, postsRes, accountsRes, pillarsRes, campaignsRes, insightsRes] = await Promise.all([
        axios.get(`${API}/api/demand-studio/social/stats`, { withCredentials: true }),
        axios.get(`${API}/api/demand-studio/social/posts`, { withCredentials: true }),
        axios.get(`${API}/api/demand-studio/social/accounts`, { withCredentials: true }),
        axios.get(`${API}/api/demand-studio/social/pillars`, { withCredentials: true }),
        axios.get(`${API}/api/demand-studio/campaigns`, { withCredentials: true }),
        axios.get(`${API}/api/demand-studio/social/insights`, { withCredentials: true }),
      ]);
      
      setStats(statsRes.data);
      setPosts(postsRes.data);
      setAccounts(accountsRes.data);
      setPillars(pillarsRes.data);
      setCampaigns(campaignsRes.data);
      setInsights(insightsRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendarPosts = async () => {
    const startDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).toISOString();
    const endDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).toISOString();
    
    try {
      const response = await axios.get(`${API}/api/demand-studio/social/calendar?start_date=${startDate}&end_date=${endDate}`, { withCredentials: true });
      setCalendarPosts(response.data);
    } catch (error) {
      console.error("Error fetching calendar posts:", error);
    }
  };

  const handleSavePost = async () => {
    try {
      const payload = { ...postForm };
      if (!payload.campaign_id) delete payload.campaign_id;
      if (!payload.pillar_id) delete payload.pillar_id;
      
      if (editingPost) {
        await axios.put(`${API}/api/demand-studio/social/posts/${editingPost.post_id}`, payload, { withCredentials: true });
      } else {
        await axios.post(`${API}/api/demand-studio/social/posts`, payload, { withCredentials: true });
      }
      setPostDialogOpen(false);
      setEditingPost(null);
      resetPostForm();
      fetchData();
    } catch (error) {
      console.error("Error saving post:", error);
    }
  };

  const handleDeletePost = async (postId) => {
    if (!window.confirm(isEs ? "¿Eliminar este post?" : "Delete this post?")) return;
    try {
      await axios.delete(`${API}/api/demand-studio/social/posts/${postId}`, { withCredentials: true });
      fetchData();
    } catch (error) {
      console.error("Error deleting post:", error);
    }
  };

  const handleMarkAsPosted = async (postId) => {
    try {
      await axios.post(`${API}/api/demand-studio/social/posts/${postId}/mark-posted`, {}, { withCredentials: true });
      fetchData();
    } catch (error) {
      console.error("Error marking as posted:", error);
    }
  };

  const handleDuplicatePost = async (postId) => {
    try {
      await axios.post(`${API}/api/demand-studio/social/posts/${postId}/duplicate`, {}, { withCredentials: true });
      fetchData();
    } catch (error) {
      console.error("Error duplicating post:", error);
    }
  };

  const handleSaveAccount = async () => {
    try {
      await axios.post(`${API}/api/demand-studio/social/accounts`, accountForm, { withCredentials: true });
      setAccountDialogOpen(false);
      setAccountForm({ platform: "instagram", handle: "", status: "active" });
      fetchData();
    } catch (error) {
      console.error("Error saving account:", error);
    }
  };

  const handleSavePillar = async () => {
    try {
      await axios.post(`${API}/api/demand-studio/social/pillars`, pillarForm, { withCredentials: true });
      setPillarDialogOpen(false);
      setPillarForm({ name: "", description: "" });
      fetchData();
    } catch (error) {
      console.error("Error saving pillar:", error);
    }
  };

  const openEditPost = (post) => {
    setEditingPost(post);
    setPostForm({
      social_account_id: post.social_account_id,
      campaign_id: post.campaign_id || "",
      pillar_id: post.pillar_id || "",
      format: post.format,
      status: post.status,
      title: post.title,
      caption: post.caption || "",
      hook: post.hook || "",
      cta: post.cta || "",
      scheduled_at: post.scheduled_at || "",
      link_url: post.link_url || "",
      notes: post.notes || ""
    });
    setPostDialogOpen(true);
  };

  const resetPostForm = () => {
    setPostForm({
      social_account_id: accounts[0]?.account_id || "",
      campaign_id: "",
      pillar_id: "",
      format: "post",
      status: "idea",
      title: "",
      caption: "",
      hook: "",
      cta: "",
      scheduled_at: "",
      link_url: "",
      notes: ""
    });
  };

  const getStatusBadge = (status) => {
    const s = STATUSES.find(st => st.value === status);
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
    if (filterAccount !== "all" && post.social_account_id !== filterAccount) return false;
    if (filterStatus !== "all" && post.status !== filterStatus) return false;
    if (filterFormat !== "all" && post.format !== filterFormat) return false;
    if (filterCampaign !== "all" && post.campaign_id !== filterCampaign) return false;
    return true;
  });

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
    return calendarPosts.filter(p => {
      const scheduledDate = p.scheduled_at?.substring(0, 10);
      const postedDate = p.posted_at?.substring(0, 10);
      return scheduledDate === dateStr || postedDate === dateStr;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="social-media-page">
      {/* View Tabs */}
      <Tabs value={activeView} onValueChange={setActiveView}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              {isEs ? "Resumen" : "Overview"}
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-2">
              <Calendar className="w-4 h-4" />
              {isEs ? "Calendario" : "Calendar"}
            </TabsTrigger>
            <TabsTrigger value="queue" className="gap-2">
              <List className="w-4 h-4" />
              {isEs ? "Cola" : "Queue"}
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="w-4 h-4" />
              {isEs ? "Config" : "Settings"}
            </TabsTrigger>
          </TabsList>
          
          <Button onClick={() => { resetPostForm(); setPostDialogOpen(true); }} data-testid="new-post-button">
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Nuevo Post" : "New Post"}
          </Button>
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
                    <Hash className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.activeAccounts || 0}</p>
                    <p className="text-xs text-muted-foreground">
                      {isEs ? "Cuentas activas" : "Active accounts"}
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
                      {isEs ? "Posts con campaña" : "Campaign-linked posts"}
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
        </TabsContent>

        {/* Calendar Tab */}
        <TabsContent value="calendar" className="space-y-4">
          <div className="flex items-center justify-between">
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
          </div>
          
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-7 gap-1">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
                {getDaysInMonth().map((day, idx) => {
                  const dayPosts = getPostsForDay(day);
                  return (
                    <div
                      key={idx}
                      className={`min-h-[80px] p-1 border rounded ${day ? 'bg-background' : 'bg-muted/30'}`}
                    >
                      {day && (
                        <>
                          <span className="text-xs font-medium">{day}</span>
                          <div className="space-y-1 mt-1">
                            {dayPosts.slice(0, 3).map(post => (
                              <div
                                key={post.post_id}
                                className={`text-xs p-1 rounded truncate cursor-pointer ${
                                  post.status === 'posted' ? 'bg-green-100' : 'bg-blue-100'
                                }`}
                                onClick={() => openEditPost(post)}
                              >
                                {post.title}
                              </div>
                            ))}
                            {dayPosts.length > 3 && (
                              <span className="text-xs text-muted-foreground">+{dayPosts.length - 3} more</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
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
                    {a.handle} ({a.platform})
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
                      <th className="text-left p-3 text-sm font-medium">{isEs ? "Campaña" : "Campaign"}</th>
                      <th className="text-right p-3 text-sm font-medium">{isEs ? "Acciones" : "Actions"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPosts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-muted-foreground">
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
                          <td className="p-3 text-sm font-medium max-w-[200px] truncate">{post.title}</td>
                          <td className="p-3 text-sm">
                            {post.campaign_id ? campaigns.find(c => c.campaign_id === post.campaign_id)?.name || "-" : "-"}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1">
                              {post.status !== "posted" && (
                                <Button variant="ghost" size="icon" onClick={() => handleMarkAsPosted(post.post_id)} title={isEs ? "Marcar publicado" : "Mark posted"}>
                                  <Check className="w-4 h-4 text-green-500" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" onClick={() => handleDuplicatePost(post.post_id)} title={isEs ? "Duplicar" : "Duplicate"}>
                                <Copy className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => openEditPost(post)} title={isEs ? "Editar" : "Edit"}>
                                <Settings className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeletePost(post.post_id)} title={isEs ? "Eliminar" : "Delete"}>
                                <Archive className="w-4 h-4 text-red-500" />
                              </Button>
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

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Accounts */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{isEs ? "Cuentas Sociales" : "Social Accounts"}</CardTitle>
                <Button size="sm" onClick={() => setAccountDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  {isEs ? "Agregar" : "Add"}
                </Button>
              </CardHeader>
              <CardContent>
                {accounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isEs ? "No hay cuentas" : "No accounts"}</p>
                ) : (
                  <div className="space-y-2">
                    {accounts.map(account => {
                      const platform = getPlatformInfo(account.platform);
                      return (
                        <div key={account.account_id} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full ${platform.color} flex items-center justify-center`}>
                              <platform.icon className="w-4 h-4 text-white" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{account.handle}</p>
                              <p className="text-xs text-muted-foreground">{platform.label}</p>
                            </div>
                          </div>
                          <Badge variant={account.status === "active" ? "default" : "secondary"}>
                            {account.status}
                          </Badge>
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
                <Button size="sm" onClick={() => setPillarDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  {isEs ? "Agregar" : "Add"}
                </Button>
              </CardHeader>
              <CardContent>
                {pillars.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isEs ? "No hay pilares" : "No pillars"}</p>
                ) : (
                  <div className="space-y-2">
                    {pillars.map(pillar => (
                      <div key={pillar.pillar_id} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                        <div>
                          <p className="text-sm font-medium">{pillar.name}</p>
                          {pillar.description && (
                            <p className="text-xs text-muted-foreground">{pillar.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
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
                    {pillars.map(p => (
                      <SelectItem key={p.pillar_id} value={p.pillar_id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Título" : "Title"} *</label>
              <Input
                value postForm.title}
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
              <label className="text-sm font-medium">Link URL</label>
              <Input
                value={postForm.link_url}
                onChange={e => setPostForm({...postForm, link_url: e.target.value})}
                placeholder="https://..."
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Notas" : "Notes"}</label>
              <Input
                value={postForm.notes}
                onChange={e => setPostForm({...postForm, notes: e.target.value})}
                placeholder={isEs ? "Notas internas" : "Internal notes"}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setPostDialogOpen(false); setEditingPost(null); }}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSavePost} disabled={!postForm.social_account_id || !postForm.title}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account Dialog */}
      <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Nueva Cuenta" : "New Account"}</DialogTitle>
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
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveAccount} disabled={!accountForm.handle}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pillar Dialog */}
      <Dialog open={pillarDialogOpen} onOpenChange={setPillarDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Nuevo Pilar" : "New Pillar"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{isEs ? "Nombre" : "Name"}</label>
              <Input
                value={pillarForm.name}
                onChange={e => setPillarForm({...pillarForm, name: e.target.value})}
                placeholder={isEs ? "Ej: Educación, Ventas, BTS" : "E.g., Education, Sales, BTS"}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Descripción" : "Description"}</label>
              <Input
                value={pillarForm.description}
                onChange={e => setPillarForm({...pillarForm, description: e.target.value})}
                placeholder={isEs ? "Descripción opcional" : "Optional description"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPillarDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSavePillar} disabled={!pillarForm.name}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

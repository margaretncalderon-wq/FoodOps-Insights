// components/demand-studio/FeedTab.js - Instagram Feed Preview with Phone Mockup
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { 
  Grid3X3, Eye, Calendar, Clock, ExternalLink, Instagram,
  Loader2, RefreshCw, Link2, Edit, Wand2, Image as ImageIcon,
  Play, CheckCircle, AlertCircle, Smartphone, LayoutGrid, Upload
} from "lucide-react";
import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";

export default function FeedTab({ campaigns = [], pillars = [] }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("planned"); // published, planned, mixed
  const [previewMode, setPreviewMode] = useState("phone"); // phone, grid
  const [plannedPosts, setPlannedPosts] = useState([]);
  const [publishedMedia, setPublishedMedia] = useState([]);
  const [mixedFeed, setMixedFeed] = useState([]);
  const [igConnected, setIgConnected] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [flagsRes, connectionRes] = await Promise.all([
        axios.get(`${API}/api/studio/feature-flags`, { withCredentials: true }).catch(() => ({ data: {} })),
        axios.get(`${API}/api/studio/instagram/connection`, { withCredentials: true }).catch(() => ({ data: { connected: false } }))
      ]);
      
      setIgConnected(connectionRes.data.connected);
      
      if (viewMode === "planned" || viewMode === "mixed") {
        const plannedRes = await axios.get(`${API}/api/studio/feed/planned?limit=50`, { withCredentials: true });
        setPlannedPosts(plannedRes.data || []);
      }
      
      if ((viewMode === "published" || viewMode === "mixed") && connectionRes.data.connected) {
        const publishedRes = await axios.get(`${API}/api/studio/instagram/media`, { withCredentials: true });
        setPublishedMedia(publishedRes.data || []);
      }
      
      if (viewMode === "mixed") {
        const mixedRes = await axios.get(`${API}/api/studio/feed/mixed?limit=50`, { withCredentials: true });
        setMixedFeed(mixedRes.data || []);
      }
    } catch (error) {
      console.error("Error fetching feed data:", error);
    } finally {
      setLoading(false);
    }
  }, [viewMode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getStatusBadge = (status) => {
    const map = {
      posted: { label: isEs ? "Publicado" : "Published", cls: "bg-green-100 text-green-800" },
      scheduled: { label: isEs ? "Programado" : "Scheduled", cls: "bg-blue-100 text-blue-800" },
      ready: { label: isEs ? "Listo" : "Ready", cls: "bg-emerald-100 text-emerald-800" },
      editing: { label: isEs ? "Edición" : "Editing", cls: "bg-orange-100 text-orange-800" },
      production: { label: isEs ? "Producción" : "Production", cls: "bg-amber-100 text-amber-800" },
      calendar: { label: isEs ? "Calendarizado" : "Scheduled", cls: "bg-sky-100 text-sky-800" },
      idea: { label: "Idea", cls: "bg-purple-100 text-purple-800" },
      drafted: { label: isEs ? "Borrador" : "Draft", cls: "bg-yellow-100 text-yellow-800" },
    };
    const c = map[status] || { label: status, cls: "bg-gray-100 text-gray-800" };
    return <Badge className={c.cls}>{c.label}</Badge>;
  };

  const openItemDrawer = (item) => { setSelectedItem(item); setDrawerOpen(true); };

  const getCurrentFeed = () => {
    if (viewMode === "published") return publishedMedia;
    if (viewMode === "planned") return plannedPosts;
    return mixedFeed;
  };

  const getThumbnail = (item) => item.thumbnail_url || item.media_url || item.media_assets?.[0]?.original_url;

  const renderGridItem = (item, index) => {
    const isPublished = item.feed_type === "published" || item.ig_media_id;
    const thumbnail = getThumbnail(item);
    const title = item.title || item.caption?.substring(0, 50) || "Post";
    const date = item.scheduled_at || item.timestamp || item.posted_at || item.created_at;
    const status = item.status || (isPublished ? "posted" : "drafted");
    
    return (
      <div
        key={item.post_id || item.cache_id || item.ig_media_id || index}
        className="aspect-square relative group cursor-pointer overflow-hidden rounded-lg bg-muted"
        onClick={() => openItemDrawer(item)}
        data-testid="feed-grid-item"
      >
        {thumbnail ? (
          <img
            src={thumbnail.startsWith("/") ? `${API}${thumbnail}` : thumbnail}
            alt={title}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
            <ImageIcon className="w-8 h-8 text-gray-300 mb-1" />
            <span className="text-[9px] text-gray-400 px-2 text-center truncate w-full">{title}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
          <div className="flex justify-between items-start">
            {getStatusBadge(status)}
            {isPublished && <Instagram className="w-4 h-4 text-white" />}
          </div>
          <div className="text-white text-xs">
            <p className="font-medium truncate">{title}</p>
            {date && <p className="text-white/70 text-[10px] mt-0.5">{formatDateOnly(date, language)}</p>}
          </div>
        </div>
        {(item.type === "video" || item.media_type === "VIDEO" || item.format === "reel") && (
          <div className="absolute top-2 right-2"><Play className="w-5 h-5 text-white drop-shadow" /></div>
        )}
      </div>
    );
  };

  // Phone mockup grid item (Instagram style - tighter, no rounded corners, no overlay by default)
  const renderPhoneGridItem = (item, index) => {
    const thumbnail = getThumbnail(item);
    const title = item.title || "Post";
    const hasImage = !!thumbnail;
    
    return (
      <div
        key={item.post_id || item.cache_id || item.ig_media_id || index}
        className="aspect-square relative cursor-pointer overflow-hidden group"
        onClick={() => openItemDrawer(item)}
        data-testid="feed-phone-item"
      >
        {hasImage ? (
          <img
            src={thumbnail.startsWith("/") ? `${API}${thumbnail}` : thumbnail}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center" style={{ backgroundColor: '#f5f5f5' }}>
            <Upload className="w-5 h-5 text-gray-300 mb-1" />
            <span className="text-[8px] text-gray-400 px-1 text-center leading-tight max-h-[30px] overflow-hidden">{title}</span>
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Eye className="w-5 h-5 text-white" />
        </div>
        {(item.format === "reel" || item.media_type === "VIDEO") && (
          <div className="absolute top-1 right-1"><Play className="w-3 h-3 text-white drop-shadow" /></div>
        )}
        {item.format === "carousel" && (
          <div className="absolute top-1 right-1"><LayoutGrid className="w-3 h-3 text-white drop-shadow" /></div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const feed = getCurrentFeed();
  const postsWithImages = feed.filter(p => getThumbnail(p));
  const postsWithoutImages = feed.filter(p => !getThumbnail(p));

  return (
    <div className="space-y-4" data-testid="feed-tab">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Tabs value={viewMode} onValueChange={setViewMode}>
            <TabsList>
              <TabsTrigger value="planned" className="gap-1 text-xs">
                <Clock className="w-3 h-3" />
                {isEs ? "Planeado" : "Planned"}
              </TabsTrigger>
              <TabsTrigger value="published" className="gap-1 text-xs" disabled={!igConnected}>
                <CheckCircle className="w-3 h-3" />
                {isEs ? "Publicado" : "Published"}
              </TabsTrigger>
              <TabsTrigger value="mixed" className="gap-1 text-xs">
                <Grid3X3 className="w-3 h-3" />
                {isEs ? "Mixto" : "Mixed"}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          {/* Preview Mode */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <button onClick={() => setPreviewMode("phone")}
              className={`text-xs px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${previewMode === "phone" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
              data-testid="feed-preview-phone">
              <Smartphone className="w-3 h-3" /> {isEs ? "Preview" : "Preview"}
            </button>
            <button onClick={() => setPreviewMode("grid")}
              className={`text-xs px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${previewMode === "grid" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
              data-testid="feed-preview-grid">
              <Grid3X3 className="w-3 h-3" /> Grid
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {feed.length} posts ({postsWithImages.length} {isEs ? "con arte" : "with art"}, {postsWithoutImages.length} {isEs ? "sin arte" : "without"})
          </span>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-1" />
            {isEs ? "Actualizar" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Instagram Connection CTA */}
      {!igConnected && viewMode === "published" && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Instagram className="w-12 h-12 mx-auto text-pink-500 mb-4" />
            <h3 className="font-semibold mb-2">{isEs ? "Conecta tu Instagram" : "Connect your Instagram"}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {isEs ? "Para ver tus posts publicados, conecta tu cuenta" : "Connect your account to see published posts"}
            </p>
            <Button onClick={() => window.location.href = "/demand-studio/settings"}>
              <Link2 className="w-4 h-4 mr-2" /> {isEs ? "Ir a Configuración" : "Go to Settings"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Feed Content */}
      {feed.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Grid3X3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {viewMode === "planned" ? (isEs ? "No hay posts planeados" : "No planned posts")
                : viewMode === "published" ? (isEs ? "No hay posts publicados" : "No published posts")
                : (isEs ? "Feed vacío" : "Empty feed")}
            </p>
          </CardContent>
        </Card>
      ) : previewMode === "phone" ? (
        /* ===== PHONE MOCKUP PREVIEW ===== */
        <div className="flex justify-center">
          <div className="w-[375px] bg-white rounded-[2.5rem] shadow-2xl border-[8px] border-gray-800 overflow-hidden" data-testid="phone-mockup">
            {/* Phone status bar */}
            <div className="bg-white px-6 pt-2 pb-1 flex items-center justify-between text-[10px] text-gray-500 font-medium">
              <span>9:41</span>
              <div className="flex items-center gap-1">
                <div className="w-3.5 h-2 border border-gray-500 rounded-sm relative">
                  <div className="absolute inset-0.5 bg-gray-500 rounded-[1px]" style={{ width: '70%' }} />
                </div>
              </div>
            </div>
            
            {/* Instagram header */}
            <div className="bg-white px-4 py-2 border-b flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Instagram className="w-5 h-5" />
                <span className="font-semibold text-sm">Instagram</span>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </div>
            </div>

            {/* Profile header */}
            <div className="bg-white px-4 py-3 border-b">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center">
                    <Instagram className="w-7 h-7 text-gray-700" />
                  </div>
                </div>
                <div className="flex-1 flex justify-around text-center">
                  <div><p className="font-bold text-sm">{feed.length}</p><p className="text-[10px] text-gray-500">{isEs ? "Posts" : "Posts"}</p></div>
                  <div><p className="font-bold text-sm">--</p><p className="text-[10px] text-gray-500">{isEs ? "Seguidores" : "Followers"}</p></div>
                  <div><p className="font-bold text-sm">--</p><p className="text-[10px] text-gray-500">{isEs ? "Seguidos" : "Following"}</p></div>
                </div>
              </div>
              {/* Grid/Reel tabs */}
              <div className="flex border-t mt-2">
                <div className="flex-1 flex justify-center py-2 border-b-2 border-black">
                  <Grid3X3 className="w-5 h-5" />
                </div>
                <div className="flex-1 flex justify-center py-2 text-gray-400">
                  <Play className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Feed Grid (3 columns, Instagram style) */}
            <div className="bg-white max-h-[350px] overflow-y-auto">
              <div className="grid grid-cols-3 gap-[1px] bg-gray-100">
                {feed.map((item, index) => renderPhoneGridItem(item, index))}
              </div>
            </div>

            {/* Phone bottom bar */}
            <div className="bg-white border-t px-6 py-2 flex items-center justify-around">
              <svg className="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            </div>
          </div>

          {/* Legend next to phone */}
          <div className="ml-6 space-y-3 min-w-[200px]">
            <h4 className="text-sm font-semibold">{isEs ? "Resumen del Feed" : "Feed Summary"}</h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-green-500" />
                <span>{postsWithImages.length} {isEs ? "con arte" : "with art"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-gray-400" />
                <span className="text-muted-foreground">{postsWithoutImages.length} {isEs ? "sin arte (subir)" : "need art"}</span>
              </div>
            </div>
            {postsWithoutImages.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-orange-600 mb-2">{isEs ? "Posts sin arte:" : "Posts missing art:"}</p>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {postsWithoutImages.slice(0, 10).map(p => (
                    <button key={p.post_id} onClick={() => openItemDrawer(p)} className="text-xs text-left w-full px-2 py-1 rounded hover:bg-muted truncate flex items-center gap-1.5">
                      <AlertCircle className="w-3 h-3 text-orange-400 flex-shrink-0" />
                      <span className="truncate">{p.title || "Post"}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ===== STANDARD GRID VIEW ===== */
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {feed.map((item, index) => renderGridItem(item, index))}
        </div>
      )}

      {/* Item Detail Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>
              {selectedItem?.feed_type === "published" || selectedItem?.ig_media_id
                ? (isEs ? "Post Publicado" : "Published Post")
                : (isEs ? "Post Planeado" : "Planned Post")}
            </SheetTitle>
          </SheetHeader>
          
          {selectedItem && (
            <div className="mt-6 space-y-4">
              <div className="aspect-square w-full rounded-lg overflow-hidden bg-muted">
                {getThumbnail(selectedItem) ? (
                  <img
                    src={getThumbnail(selectedItem).startsWith("/") ? `${API}${getThumbnail(selectedItem)}` : getThumbnail(selectedItem)}
                    alt="" className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                    <Upload className="w-12 h-12 text-gray-300" />
                    <p className="text-sm text-muted-foreground">{isEs ? "Sin arte — sube una imagen" : "No art — upload an image"}</p>
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-between">
                {getStatusBadge(selectedItem.status || (selectedItem.ig_media_id ? "posted" : "drafted"))}
                <span className="text-sm text-muted-foreground">
                  {formatDateOnly(selectedItem.scheduled_at || selectedItem.timestamp || selectedItem.created_at, language)}
                </span>
              </div>
              
              {selectedItem.title && <h4 className="font-medium">{selectedItem.title}</h4>}
              
              {(selectedItem.caption || selectedItem.hook) && (
                <div>
                  <p className="text-sm font-medium mb-1">Caption</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedItem.caption || selectedItem.hook}
                  </p>
                </div>
              )}
              
              {selectedItem.campaign_id && (
                <Badge variant="outline">
                  {campaigns.find(c => c.campaign_id === selectedItem.campaign_id)?.name || "Campaign"}
                </Badge>
              )}
              
              <div className="flex gap-2 pt-4 border-t">
                {selectedItem.ig_media_id || selectedItem.permalink ? (
                  <Button variant="outline" className="flex-1" asChild>
                    <a href={selectedItem.permalink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 mr-2" /> {isEs ? "Ver en Instagram" : "View on Instagram"}
                    </a>
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" className="flex-1">
                      <Edit className="w-4 h-4 mr-2" /> {isEs ? "Editar" : "Edit"}
                    </Button>
                    <Button className="flex-1">
                      <Wand2 className="w-4 h-4 mr-2" /> {isEs ? "Abrir en Studio" : "Open in Studio"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// components/demand-studio/FeedTab.js - Instagram-like Feed Grid
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
  Play, CheckCircle, AlertCircle
} from "lucide-react";
import { API_BASE as API } from "../../utils/api";

export default function FeedTab({ campaigns = [], pillars = [] }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("planned"); // published, planned, mixed
  const [previewMode, setPreviewMode] = useState("original"); // original, styled
  const [plannedPosts, setPlannedPosts] = useState([]);
  const [publishedMedia, setPublishedMedia] = useState([]);
  const [mixedFeed, setMixedFeed] = useState([]);
  const [igConnected, setIgConnected] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch feature flags and connection status
      const [flagsRes, connectionRes] = await Promise.all([
        axios.get(`${API}/api/studio/feature-flags`, { withCredentials: true }).catch(() => ({ data: {} })),
        axios.get(`${API}/api/studio/instagram/connection`, { withCredentials: true }).catch(() => ({ data: { connected: false } }))
      ]);
      
      setIgConnected(connectionRes.data.connected);
      
      // Fetch appropriate data based on view mode
      if (viewMode === "planned" || viewMode === "mixed") {
        const plannedRes = await axios.get(`${API}/api/studio/feed/planned`, { withCredentials: true });
        setPlannedPosts(plannedRes.data || []);
      }
      
      if ((viewMode === "published" || viewMode === "mixed") && connectionRes.data.connected) {
        const publishedRes = await axios.get(`${API}/api/studio/instagram/media`, { withCredentials: true });
        setPublishedMedia(publishedRes.data || []);
      }
      
      if (viewMode === "mixed") {
        const mixedRes = await axios.get(`${API}/api/studio/feed/mixed`, { withCredentials: true });
        setMixedFeed(mixedRes.data || []);
      }
    } catch (error) {
      console.error("Error fetching feed data:", error);
    } finally {
      setLoading(false);
    }
  }, [viewMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getStatusBadge = (status) => {
    const statusConfig = {
      posted: { label: isEs ? "Publicado" : "Published", className: "bg-green-100 text-green-800" },
      scheduled: { label: isEs ? "Programado" : "Scheduled", className: "bg-blue-100 text-blue-800" },
      drafted: { label: isEs ? "Borrador" : "Draft", className: "bg-yellow-100 text-yellow-800" },
      idea: { label: "Idea", className: "bg-purple-100 text-purple-800" },
    };
    const config = statusConfig[status] || { label: status, className: "bg-gray-100 text-gray-800" };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const openItemDrawer = (item) => {
    setSelectedItem(item);
    setDrawerOpen(true);
  };

  const getCurrentFeed = () => {
    if (viewMode === "published") return publishedMedia;
    if (viewMode === "planned") return plannedPosts;
    return mixedFeed;
  };

  const renderFeedItem = (item, index) => {
    const isPublished = item.feed_type === "published" || item.ig_media_id;
    const thumbnail = item.thumbnail_url || item.media_url || item.media_assets?.[0]?.original_url;
    const title = item.title || item.caption?.substring(0, 50) || "Post";
    const date = item.scheduled_at || item.timestamp || item.posted_at || item.created_at;
    const status = item.status || (isPublished ? "posted" : "drafted");
    
    return (
      <div
        key={item.post_id || item.cache_id || item.ig_media_id || index}
        className="aspect-square relative group cursor-pointer overflow-hidden rounded-lg bg-muted"
        onClick={() => openItemDrawer(item)}
      >
        {/* Thumbnail */}
        {thumbnail ? (
          <img
            src={thumbnail.startsWith("/") ? `${API}${thumbnail}` : thumbnail}
            alt={title}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
            <ImageIcon className="w-10 h-10 text-gray-400" />
          </div>
        )}
        
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
          <div className="flex justify-between items-start">
            {getStatusBadge(status)}
            {isPublished && <Instagram className="w-4 h-4 text-white" />}
          </div>
          <div className="text-white text-xs">
            <p className="font-medium truncate">{title}</p>
            {date && (
              <p className="text-white/70 text-[10px] flex items-center gap-1 mt-1">
                <Calendar className="w-3 h-3" />
                {new Date(date).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        
        {/* Video indicator */}
        {(item.type === "video" || item.media_type === "VIDEO") && (
          <div className="absolute top-2 right-2">
            <Play className="w-5 h-5 text-white drop-shadow" />
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="feed-tab">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* View Mode Toggle */}
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
          
          {/* Preview Mode Toggle (only for planned) */}
          {viewMode !== "published" && (
            <Tabs value={previewMode} onValueChange={setPreviewMode}>
              <TabsList>
                <TabsTrigger value="original" className="gap-1 text-xs">
                  <ImageIcon className="w-3 h-3" />
                  Original
                </TabsTrigger>
                <TabsTrigger value="styled" className="gap-1 text-xs">
                  <Wand2 className="w-3 h-3" />
                  Styled
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
        
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="w-4 h-4 mr-1" />
          {isEs ? "Actualizar" : "Refresh"}
        </Button>
      </div>

      {/* Instagram Connection CTA */}
      {!igConnected && viewMode === "published" && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Instagram className="w-12 h-12 mx-auto text-pink-500 mb-4" />
            <h3 className="font-semibold mb-2">
              {isEs ? "Conecta tu Instagram" : "Connect your Instagram"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {isEs 
                ? "Para ver tus posts publicados, conecta tu cuenta de Instagram Business o Creator" 
                : "To see your published posts, connect your Instagram Business or Creator account"}
            </p>
            <Button onClick={() => window.location.href = "/demand-studio/settings"}>
              <Link2 className="w-4 h-4 mr-2" />
              {isEs ? "Ir a Configuración" : "Go to Settings"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Feed Grid */}
      {getCurrentFeed().length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Grid3X3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {viewMode === "planned"
                ? (isEs ? "No hay posts programados o en borrador" : "No scheduled or draft posts")
                : viewMode === "published"
                ? (isEs ? "No hay posts publicados en caché" : "No published posts in cache")
                : (isEs ? "El feed está vacío" : "Feed is empty")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {getCurrentFeed().map((item, index) => renderFeedItem(item, index))}
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
              {/* Preview Image */}
              <div className="aspect-square w-full rounded-lg overflow-hidden bg-muted">
                {(selectedItem.thumbnail_url || selectedItem.media_url || selectedItem.media_assets?.[0]?.original_url) ? (
                  <img
                    src={
                      (selectedItem.thumbnail_url || selectedItem.media_url || selectedItem.media_assets?.[0]?.original_url).startsWith("/")
                        ? `${API}${selectedItem.thumbnail_url || selectedItem.media_url || selectedItem.media_assets?.[0]?.original_url}`
                        : selectedItem.thumbnail_url || selectedItem.media_url || selectedItem.media_assets?.[0]?.original_url
                    }
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-16 h-16 text-gray-400" />
                  </div>
                )}
              </div>
              
              {/* Status and Date */}
              <div className="flex items-center justify-between">
                {getStatusBadge(selectedItem.status || (selectedItem.ig_media_id ? "posted" : "drafted"))}
                <span className="text-sm text-muted-foreground">
                  {new Date(selectedItem.scheduled_at || selectedItem.timestamp || selectedItem.created_at).toLocaleDateString()}
                </span>
              </div>
              
              {/* Title */}
              {selectedItem.title && (
                <div>
                  <h4 className="font-medium">{selectedItem.title}</h4>
                </div>
              )}
              
              {/* Caption */}
              {(selectedItem.caption || selectedItem.hook) && (
                <div>
                  <p className="text-sm font-medium mb-1">{isEs ? "Caption" : "Caption"}</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedItem.caption || selectedItem.hook}
                  </p>
                </div>
              )}
              
              {/* Campaign Badge */}
              {selectedItem.campaign_id && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {campaigns.find(c => c.campaign_id === selectedItem.campaign_id)?.name || "Campaign"}
                  </Badge>
                </div>
              )}
              
              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                {selectedItem.ig_media_id || selectedItem.permalink ? (
                  <Button variant="outline" className="flex-1" asChild>
                    <a href={selectedItem.permalink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      {isEs ? "Ver en Instagram" : "View on Instagram"}
                    </a>
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" className="flex-1">
                      <Edit className="w-4 h-4 mr-2" />
                      {isEs ? "Editar" : "Edit"}
                    </Button>
                    <Button className="flex-1">
                      <Wand2 className="w-4 h-4 mr-2" />
                      {isEs ? "Abrir en Studio" : "Open in Studio"}
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

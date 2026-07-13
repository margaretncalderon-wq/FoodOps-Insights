// components/demand-studio/ActivityFeed.js - Recent Activity Feed
import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Activity, Clock, FileEdit, CheckCircle, XCircle, PlusCircle, Instagram, Linkedin, Youtube, Hash, AtSign, RefreshCw } from "lucide-react";

import { KoraLoader } from "../KoraLoader";
const API = process.env.REACT_APP_BACKEND_URL;

export default function ActivityFeed({ accountId = null, orgId = null, limit = 10 }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchActivities = async () => {
    try {
      const params = new URLSearchParams();
      if (accountId) params.append("account_id", accountId);
      if (orgId) params.append("org_id", orgId);
      params.append("limit", limit);
      params.append("days", 7);
      
      const res = await axios.get(
        `${API}/api/activity-feed/recent?${params.toString()}`,
        { withCredentials: true }
      );
      setActivities(res.data || []);
    } catch (error) {
      console.error("Error fetching activities:", error);
      setActivities([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, [accountId, orgId]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchActivities();
  };

  const getPlatformIcon = (platform) => {
    switch (platform?.toLowerCase()) {
      case 'instagram': return <Instagram className="w-3 h-3 text-pink-500" />;
      case 'linkedin': return <Linkedin className="w-3 h-3 text-blue-600" />;
      case 'youtube': return <Youtube className="w-3 h-3 text-red-500" />;
      case 'tiktok': return <Hash className="w-3 h-3" />;
      default: return <AtSign className="w-3 h-3" />;
    }
  };

  const getActivityIcon = (type) => {
    switch (type) {
      case 'post_created':
        return <PlusCircle className="w-4 h-4 text-green-500" />;
      case 'post_edited':
        return <FileEdit className="w-4 h-4 text-blue-500" />;
      case 'post_approved':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'post_rejected':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'idea_created':
        return <PlusCircle className="w-4 h-4 text-purple-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  const getActivityLabel = (type) => {
    const labels = {
      post_created: isEs ? "Nuevo post" : "New post",
      post_edited: isEs ? "Post editado" : "Post edited",
      post_approved: isEs ? "Aprobado" : "Approved",
      post_rejected: isEs ? "Rechazado" : "Rejected",
      idea_created: isEs ? "Nueva idea" : "New idea"
    };
    return labels[type] || type;
  };

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
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
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4" />
            {isEs ? "Actividad Reciente" : "Recent Activity"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <KoraLoader size={24} />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="activity-feed">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4" />
            {isEs ? "Actividad Reciente" : "Recent Activity"}
          </CardTitle>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-8 w-8"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center text-muted-foreground py-6 text-sm">
            {isEs ? "Sin actividad reciente" : "No recent activity"}
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((activity, index) => (
              <div 
                key={`${activity.entity_id}-${index}`}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="mt-0.5">
                  {getActivityIcon(activity.activity_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">
                      {activity.user_name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {activity.description}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {activity.account && (
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1">
                        {getPlatformIcon(activity.account.platform)}
                        @{activity.account.handle}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTimeAgo(activity.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

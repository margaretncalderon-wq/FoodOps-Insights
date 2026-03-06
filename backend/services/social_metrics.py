# services/social_metrics.py - Social Media Metrics Service
"""
Service for fetching and storing social media metrics.
Supports: YouTube, Meta (Facebook/Instagram), TikTok
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
import uuid
import httpx


class YouTubeMetricsService:
    """YouTube Data API v3 integration"""
    
    BASE_URL = "https://www.googleapis.com/youtube/v3"
    
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.headers = {"Authorization": f"Bearer {access_token}"}
    
    async def get_channel_info(self) -> Dict[str, Any]:
        """Get authenticated user's channel info and basic stats"""
        async with httpx.AsyncClient() as client:
            # Get channel for authenticated user
            response = await client.get(
                f"{self.BASE_URL}/channels",
                params={
                    "part": "snippet,statistics,contentDetails",
                    "mine": "true"
                },
                headers=self.headers,
                timeout=30.0
            )
            
            if response.status_code != 200:
                return {"error": response.text, "status_code": response.status_code}
            
            data = response.json()
            if not data.get("items"):
                return {"error": "No channel found"}
            
            channel = data["items"][0]
            snippet = channel.get("snippet", {})
            stats = channel.get("statistics", {})
            
            return {
                "platform": "youtube",
                "platform_account_id": channel["id"],
                "account_name": snippet.get("title", ""),
                "profile_picture": snippet.get("thumbnails", {}).get("default", {}).get("url"),
                "description": snippet.get("description", ""),
                "custom_url": snippet.get("customUrl", ""),
                # Statistics
                "subscribers_count": int(stats.get("subscriberCount", 0)),
                "video_count": int(stats.get("videoCount", 0)),
                "view_count": int(stats.get("viewCount", 0)),
                "hidden_subscriber_count": stats.get("hiddenSubscriberCount", False)
            }
    
    async def get_channel_videos(self, max_results: int = 30) -> List[Dict[str, Any]]:
        """Get recent videos with statistics"""
        async with httpx.AsyncClient() as client:
            # First get channel's uploads playlist
            channel_response = await client.get(
                f"{self.BASE_URL}/channels",
                params={
                    "part": "contentDetails",
                    "mine": "true"
                },
                headers=self.headers,
                timeout=30.0
            )
            
            if channel_response.status_code != 200:
                return []
            
            channel_data = channel_response.json()
            if not channel_data.get("items"):
                return []
            
            uploads_playlist_id = channel_data["items"][0].get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads")
            if not uploads_playlist_id:
                return []
            
            # Get videos from uploads playlist
            playlist_response = await client.get(
                f"{self.BASE_URL}/playlistItems",
                params={
                    "part": "snippet,contentDetails",
                    "playlistId": uploads_playlist_id,
                    "maxResults": max_results
                },
                headers=self.headers,
                timeout=30.0
            )
            
            if playlist_response.status_code != 200:
                return []
            
            playlist_data = playlist_response.json()
            video_ids = [item["contentDetails"]["videoId"] for item in playlist_data.get("items", [])]
            
            if not video_ids:
                return []
            
            # Get video statistics
            videos_response = await client.get(
                f"{self.BASE_URL}/videos",
                params={
                    "part": "snippet,statistics,contentDetails",
                    "id": ",".join(video_ids)
                },
                headers=self.headers,
                timeout=30.0
            )
            
            if videos_response.status_code != 200:
                return []
            
            videos_data = videos_response.json()
            videos = []
            
            for video in videos_data.get("items", []):
                snippet = video.get("snippet", {})
                stats = video.get("statistics", {})
                
                videos.append({
                    "platform_post_id": video["id"],
                    "post_type": "video",
                    "title": snippet.get("title", ""),
                    "caption": snippet.get("description", "")[:500] if snippet.get("description") else None,
                    "thumbnail_url": snippet.get("thumbnails", {}).get("medium", {}).get("url"),
                    "permalink": f"https://www.youtube.com/watch?v={video['id']}",
                    "published_at": snippet.get("publishedAt"),
                    # Metrics
                    "video_views": int(stats.get("viewCount", 0)),
                    "likes": int(stats.get("likeCount", 0)),
                    "comments": int(stats.get("commentCount", 0)),
                    "shares": 0,  # Not available in YouTube API
                    "saves": 0,
                    "reach": int(stats.get("viewCount", 0)),  # Use views as reach approximation
                    "impressions": 0  # Would need Analytics API
                })
            
            return videos


class MetaMetricsService:
    """Meta Graph API integration for Facebook and Instagram"""
    
    BASE_URL = "https://graph.facebook.com/v18.0"
    
    def __init__(self, access_token: str):
        self.access_token = access_token
    
    async def get_instagram_account_info(self, ig_user_id: str) -> Dict[str, Any]:
        """Get Instagram Business account info and metrics"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/{ig_user_id}",
                params={
                    "fields": "id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website",
                    "access_token": self.access_token
                },
                timeout=30.0
            )
            
            if response.status_code != 200:
                return {"error": response.text, "status_code": response.status_code}
            
            data = response.json()
            
            return {
                "platform": "instagram",
                "platform_account_id": data.get("id"),
                "account_name": data.get("username", ""),
                "display_name": data.get("name", ""),
                "profile_picture": data.get("profile_picture_url"),
                "biography": data.get("biography"),
                "website": data.get("website"),
                # Statistics
                "followers_count": data.get("followers_count", 0),
                "following_count": data.get("follows_count", 0),
                "posts_count": data.get("media_count", 0)
            }
    
    async def get_instagram_insights(self, ig_user_id: str, period: str = "day", metrics: List[str] = None) -> Dict[str, Any]:
        """Get Instagram account insights (reach, impressions, etc.)"""
        if metrics is None:
            metrics = ["impressions", "reach", "profile_views", "website_clicks", "follower_count"]
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/{ig_user_id}/insights",
                params={
                    "metric": ",".join(metrics),
                    "period": period,
                    "access_token": self.access_token
                },
                timeout=30.0
            )
            
            if response.status_code != 200:
                return {"error": response.text}
            
            data = response.json()
            insights = {}
            
            for item in data.get("data", []):
                metric_name = item.get("name")
                values = item.get("values", [{}])
                if values:
                    insights[metric_name] = values[-1].get("value", 0)
            
            return insights
    
    async def get_instagram_media(self, ig_user_id: str, limit: int = 30) -> List[Dict[str, Any]]:
        """Get Instagram media with insights"""
        async with httpx.AsyncClient() as client:
            # Get media list
            media_response = await client.get(
                f"{self.BASE_URL}/{ig_user_id}/media",
                params={
                    "fields": "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
                    "limit": limit,
                    "access_token": self.access_token
                },
                timeout=30.0
            )
            
            if media_response.status_code != 200:
                return []
            
            media_data = media_response.json()
            posts = []
            
            for media in media_data.get("data", []):
                media_type = media.get("media_type", "").lower()
                post_type = "reel" if media_type == "video" else "carousel" if media_type == "carousel_album" else "post"
                
                post = {
                    "platform_post_id": media.get("id"),
                    "post_type": post_type,
                    "caption": media.get("caption", "")[:500] if media.get("caption") else None,
                    "thumbnail_url": media.get("thumbnail_url") or media.get("media_url"),
                    "permalink": media.get("permalink"),
                    "published_at": media.get("timestamp"),
                    # Basic metrics
                    "likes": media.get("like_count", 0),
                    "comments": media.get("comments_count", 0),
                    "shares": 0,
                    "saves": 0,
                    "reach": 0,
                    "impressions": 0,
                    "video_views": 0
                }
                
                # Try to get insights for this media
                try:
                    insights_response = await client.get(
                        f"{self.BASE_URL}/{media['id']}/insights",
                        params={
                            "metric": "reach,impressions,saved,shares,video_views" if post_type == "reel" else "reach,impressions,saved",
                            "access_token": self.access_token
                        },
                        timeout=10.0
                    )
                    
                    if insights_response.status_code == 200:
                        insights_data = insights_response.json()
                        for insight in insights_data.get("data", []):
                            name = insight.get("name")
                            values = insight.get("values", [{}])
                            if values and name:
                                if name == "reach":
                                    post["reach"] = values[0].get("value", 0)
                                elif name == "impressions":
                                    post["impressions"] = values[0].get("value", 0)
                                elif name == "saved":
                                    post["saves"] = values[0].get("value", 0)
                                elif name == "shares":
                                    post["shares"] = values[0].get("value", 0)
                                elif name == "video_views":
                                    post["video_views"] = values[0].get("value", 0)
                except Exception:
                    pass  # Individual post insights are not critical
                
                posts.append(post)
            
            return posts
    
    async def get_facebook_page_info(self, page_id: str) -> Dict[str, Any]:
        """Get Facebook Page info and metrics"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/{page_id}",
                params={
                    "fields": "id,name,username,picture,fan_count,followers_count,about,website",
                    "access_token": self.access_token
                },
                timeout=30.0
            )
            
            if response.status_code != 200:
                return {"error": response.text, "status_code": response.status_code}
            
            data = response.json()
            
            return {
                "platform": "facebook",
                "platform_account_id": data.get("id"),
                "account_name": data.get("username") or data.get("name", ""),
                "display_name": data.get("name", ""),
                "profile_picture": data.get("picture", {}).get("data", {}).get("url"),
                "about": data.get("about"),
                "website": data.get("website"),
                # Statistics
                "followers_count": data.get("followers_count", 0),
                "fans_count": data.get("fan_count", 0),
                "following_count": 0,
                "posts_count": 0
            }


class TikTokMetricsService:
    """TikTok Business API integration"""
    
    BASE_URL = "https://open.tiktokapis.com/v2"
    
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
    
    async def get_user_info(self) -> Dict[str, Any]:
        """Get TikTok user info"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/user/info/",
                params={
                    "fields": "open_id,union_id,avatar_url,avatar_url_100,display_name,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count"
                },
                headers=self.headers,
                timeout=30.0
            )
            
            if response.status_code != 200:
                return {"error": response.text, "status_code": response.status_code}
            
            data = response.json()
            user_data = data.get("data", {}).get("user", {})
            
            return {
                "platform": "tiktok",
                "platform_account_id": user_data.get("open_id"),
                "account_name": user_data.get("display_name", ""),
                "profile_picture": user_data.get("avatar_url_100") or user_data.get("avatar_url"),
                "biography": user_data.get("bio_description"),
                "profile_url": user_data.get("profile_deep_link"),
                "is_verified": user_data.get("is_verified", False),
                # Statistics
                "followers_count": user_data.get("follower_count", 0),
                "following_count": user_data.get("following_count", 0),
                "likes_count": user_data.get("likes_count", 0),
                "posts_count": user_data.get("video_count", 0)
            }
    
    async def get_videos(self, max_count: int = 20) -> List[Dict[str, Any]]:
        """Get user's videos with metrics"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.BASE_URL}/video/list/",
                params={
                    "fields": "id,title,video_description,duration,cover_image_url,embed_link,share_url,create_time,like_count,comment_count,share_count,view_count"
                },
                json={"max_count": max_count},
                headers=self.headers,
                timeout=30.0
            )
            
            if response.status_code != 200:
                return []
            
            data = response.json()
            videos = []
            
            for video in data.get("data", {}).get("videos", []):
                videos.append({
                    "platform_post_id": video.get("id"),
                    "post_type": "video",
                    "title": video.get("title", ""),
                    "caption": video.get("video_description", "")[:500] if video.get("video_description") else None,
                    "thumbnail_url": video.get("cover_image_url"),
                    "permalink": video.get("share_url"),
                    "published_at": video.get("create_time"),
                    "duration_seconds": video.get("duration", 0),
                    # Metrics
                    "video_views": video.get("view_count", 0),
                    "likes": video.get("like_count", 0),
                    "comments": video.get("comment_count", 0),
                    "shares": video.get("share_count", 0),
                    "saves": 0,  # Not available
                    "reach": video.get("view_count", 0),  # Use views as approximation
                    "impressions": 0
                })
            
            return videos


class SocialMetricsManager:
    """
    Manager class to handle all social metrics operations.
    Coordinates between different platform services and database.
    """
    
    def __init__(self, db, company_id: str, user_id: Optional[str] = None):
        self.db = db
        self.company_id = company_id
        self.user_id = user_id
    
    async def connect_youtube(self, access_token: str, refresh_token: Optional[str] = None, expires_at: Optional[datetime] = None) -> Dict[str, Any]:
        """Connect a YouTube channel"""
        service = YouTubeMetricsService(access_token)
        channel_info = await service.get_channel_info()
        
        if "error" in channel_info:
            return channel_info
        
        now = datetime.now(timezone.utc)
        connection_id = f"conn_{uuid.uuid4().hex[:12]}"
        
        connection_doc = {
            "connection_id": connection_id,
            "company_id": self.company_id,
            "platform": "youtube",
            "platform_account_id": channel_info["platform_account_id"],
            "account_name": channel_info["account_name"],
            "profile_picture": channel_info.get("profile_picture"),
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_expires_at": expires_at.isoformat() if expires_at else None,
            "scopes": ["youtube.readonly"],
            "status": "active",
            "last_sync_at": now.isoformat(),
            "followers_count": channel_info.get("subscribers_count", 0),
            "following_count": 0,
            "posts_count": channel_info.get("video_count", 0),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
        # Upsert - update if same platform_account_id exists
        await self.db.connected_social_accounts.update_one(
            {"company_id": self.company_id, "platform": "youtube", "platform_account_id": channel_info["platform_account_id"]},
            {"$set": connection_doc},
            upsert=True
        )
        
        connection_doc.pop("access_token", None)
        connection_doc.pop("refresh_token", None)
        
        return connection_doc
    
    async def sync_youtube_metrics(self, connection_id: str) -> Dict[str, Any]:
        """Sync metrics for a YouTube connection"""
        connection = await self.db.connected_social_accounts.find_one(
            {"connection_id": connection_id, "company_id": self.company_id},
            {"_id": 0}
        )
        
        if not connection:
            return {"error": "Connection not found"}
        
        service = YouTubeMetricsService(connection["access_token"])
        
        # Get channel info
        channel_info = await service.get_channel_info()
        if "error" in channel_info:
            await self.db.connected_social_accounts.update_one(
                {"connection_id": connection_id},
                {"$set": {"status": "error", "sync_error": str(channel_info.get("error"))}}
            )
            return channel_info
        
        # Get videos
        videos = await service.get_channel_videos(30)
        
        now = datetime.now(timezone.utc)
        today = now.strftime("%Y-%m-%d")
        
        # Save metrics snapshot
        snapshot_id = f"snap_{uuid.uuid4().hex[:12]}"
        snapshot_doc = {
            "snapshot_id": snapshot_id,
            "company_id": self.company_id,
            "connection_id": connection_id,
            "platform": "youtube",
            "snapshot_date": today,
            "followers_count": channel_info.get("subscribers_count", 0),
            "following_count": 0,
            "posts_count": channel_info.get("video_count", 0),
            "reach": channel_info.get("view_count", 0),
            "impressions": 0,
            "engagement_count": sum(v.get("likes", 0) + v.get("comments", 0) for v in videos),
            "engagement_rate": 0,
            "profile_views": 0,
            "website_clicks": 0,
            "source": "api",
            "created_at": now.isoformat()
        }
        
        # Upsert snapshot for today
        await self.db.social_metrics_snapshots.update_one(
            {"company_id": self.company_id, "connection_id": connection_id, "snapshot_date": today},
            {"$set": snapshot_doc},
            upsert=True
        )
        
        # Save video metrics
        for video in videos:
            post_metrics_id = f"pm_{uuid.uuid4().hex[:12]}"
            video_doc = {
                "post_metrics_id": post_metrics_id,
                "company_id": self.company_id,
                "connection_id": connection_id,
                "platform": "youtube",
                **video,
                "last_synced_at": now.isoformat(),
                "created_at": now.isoformat(),
                "updated_at": now.isoformat()
            }
            
            await self.db.social_post_metrics.update_one(
                {"company_id": self.company_id, "platform_post_id": video["platform_post_id"]},
                {"$set": video_doc},
                upsert=True
            )
        
        # Update connection
        await self.db.connected_social_accounts.update_one(
            {"connection_id": connection_id},
            {"$set": {
                "last_sync_at": now.isoformat(),
                "status": "active",
                "sync_error": None,
                "followers_count": channel_info.get("subscribers_count", 0),
                "posts_count": channel_info.get("video_count", 0)
            }}
        )
        
        return {
            "success": True,
            "snapshot_id": snapshot_id,
            "videos_synced": len(videos),
            "followers_count": channel_info.get("subscribers_count", 0)
        }
    
    async def get_dashboard_data(self) -> Dict[str, Any]:
        """Get aggregated social metrics for dashboard"""
        # Get all connections
        connections = await self.db.connected_social_accounts.find(
            {"company_id": self.company_id, "status": "active"},
            {"_id": 0, "access_token": 0, "refresh_token": 0}
        ).to_list(20)
        
        # Get manual entries for last 30 days
        thirty_days_ago = (datetime.now(timezone.utc) - __import__("datetime").timedelta(days=30)).strftime("%Y-%m-%d")
        manual_entries = await self.db.manual_social_metrics.find(
            {"company_id": self.company_id, "entry_date": {"$gte": thirty_days_ago}},
            {"_id": 0}
        ).sort("entry_date", -1).to_list(100)
        
        # Get recent snapshots
        snapshots = await self.db.social_metrics_snapshots.find(
            {"company_id": self.company_id, "snapshot_date": {"$gte": thirty_days_ago}},
            {"_id": 0}
        ).sort("snapshot_date", -1).to_list(200)
        
        # Calculate totals
        total_followers = sum(c.get("followers_count", 0) for c in connections)
        
        # Get top posts
        top_posts = await self.db.social_post_metrics.find(
            {"company_id": self.company_id},
            {"_id": 0}
        ).sort("reach", -1).limit(10).to_list(10)
        
        return {
            "connections": connections,
            "manual_entries": manual_entries[:10],
            "total_followers": total_followers,
            "total_connections": len(connections),
            "platforms": list(set(c["platform"] for c in connections)),
            "recent_snapshots": snapshots[:30],
            "top_posts": top_posts
        }
    
    async def add_manual_entry(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Add manual metrics entry"""
        now = datetime.now(timezone.utc)
        entry_id = f"manual_{uuid.uuid4().hex[:12]}"
        
        entry_doc = {
            "entry_id": entry_id,
            "company_id": self.company_id,
            **data,
            "created_by_user_id": self.user_id,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
        await self.db.manual_social_metrics.insert_one(entry_doc)
        entry_doc.pop("_id", None)
        
        return entry_doc

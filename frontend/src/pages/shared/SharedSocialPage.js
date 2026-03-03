// pages/shared/SharedSocialPage.js - External access to shared Social Media
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { 
  Lock, Loader2, Calendar, Lightbulb, FileText, AlertCircle,
  Instagram, Clock, Eye, PenLine, Image, Video
} from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

export default function SharedSocialPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isEs = language === "es";
  
  // Auth states
  const [loading, setLoading] = useState(true);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState(null);
  
  // Session states
  const [session, setSession] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  
  // Data states
  const [posts, setPosts] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [activeTab, setActiveTab] = useState("calendar");

  // Validate access on mount
  const validateAccess = useCallback(async (pwd = null) => {
    setValidating(true);
    setError(null);
    
    try {
      const res = await axios.post(`${API}/api/social-sharing/access/validate`, {
        share_token: token,
        password: pwd
      });
      
      setSession(res.data);
      setSessionToken(res.data.session_token);
      setNeedsPassword(false);
      
      // Store in sessionStorage for page refresh
      sessionStorage.setItem("shared_social_session", res.data.session_token);
      
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      
      if (status === 401 && detail === "Password required") {
        setNeedsPassword(true);
      } else if (status === 401 && detail === "Invalid password") {
        setError(isEs ? "Contraseña incorrecta" : "Invalid password");
      } else if (status === 404) {
        setError(isEs ? "Link inválido o expirado" : "Invalid or expired link");
      } else if (status === 410) {
        setError(isEs ? "Este link ha expirado" : "This link has expired");
      } else {
        setError(detail || (isEs ? "Error al validar acceso" : "Access validation error"));
      }
    } finally {
      setValidating(false);
      setLoading(false);
    }
  }, [token, isEs]);

  useEffect(() => {
    // Check if we have a stored session
    const storedSession = sessionStorage.getItem("shared_social_session");
    if (storedSession) {
      setSessionToken(storedSession);
      setLoading(false);
      // Re-validate the session
      axios.post(`${API}/api/social-sharing/access/validate`, {
        share_token: token,
        password: null
      }).then(res => {
        setSession(res.data);
      }).catch(() => {
        sessionStorage.removeItem("shared_social_session");
        validateAccess();
      });
    } else {
      validateAccess();
    }
  }, [token, validateAccess]);

  // Fetch data when session is valid
  const fetchData = useCallback(async () => {
    if (!sessionToken) return;
    
    setLoadingData(true);
    try {
      const [postsRes, ideasRes] = await Promise.all([
        axios.get(`${API}/api/social-sharing/external/social-posts?session_token=${sessionToken}`),
        axios.get(`${API}/api/social-sharing/external/ideas?session_token=${sessionToken}`)
      ]);
      
      setPosts(postsRes.data || []);
      setIdeas(ideasRes.data || []);
    } catch (err) {
      if (err.response?.status === 401) {
        // Session expired
        sessionStorage.removeItem("shared_social_session");
        setSessionToken(null);
        setSession(null);
        validateAccess();
      } else {
        toast.error(isEs ? "Error al cargar datos" : "Error loading data");
      }
    } finally {
      setLoadingData(false);
    }
  }, [sessionToken, isEs, validateAccess]);

  useEffect(() => {
    if (sessionToken) {
      fetchData();
    }
  }, [sessionToken, fetchData]);

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (!password.trim()) {
      toast.error(isEs ? "Ingresa la contraseña" : "Enter password");
      return;
    }
    validateAccess(password);
  };

  const getStatusBadge = (status) => {
    const statuses = {
      draft: { label: isEs ? "Borrador" : "Draft", variant: "secondary" },
      scheduled: { label: isEs ? "Programado" : "Scheduled", variant: "default" },
      published: { label: isEs ? "Publicado" : "Published", variant: "outline" },
      idea: { label: "Idea", variant: "secondary" }
    };
    const s = statuses[status] || { label: status, variant: "outline" };
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (error && !needsPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
              <h2 className="text-xl font-semibold">{isEs ? "Acceso Denegado" : "Access Denied"}</h2>
              <p className="text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={() => navigate("/")}>
                {isEs ? "Ir al inicio" : "Go to home"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Password required state
  if (needsPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>{isEs ? "Contenido Protegido" : "Protected Content"}</CardTitle>
            <CardDescription>
              {isEs 
                ? "Este contenido está protegido con contraseña" 
                : "This content is password protected"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>{isEs ? "Contraseña" : "Password"}</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoFocus
                />
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={validating}>
                {validating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Lock className="w-4 h-4 mr-2" />
                )}
                {isEs ? "Acceder" : "Access"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main content - authenticated
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white dark:bg-gray-950 border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {session?.organization?.logo_url ? (
                <img 
                  src={session.organization.logo_url} 
                  alt={session.organization.name}
                  className="w-10 h-10 rounded-lg object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Instagram className="w-5 h-5 text-white" />
                </div>
              )}
              <div>
                <h1 className="font-semibold">{session?.organization?.name || "Social Media"}</h1>
                <p className="text-xs text-muted-foreground">
                  {isEs ? "Compartido por" : "Shared by"}: {session?.shared_by || "Unknown"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={session?.permissions === "contributor" ? "default" : "secondary"}>
                {session?.permissions === "contributor" 
                  ? (isEs ? "Puede editar" : "Can edit") 
                  : (isEs ? "Solo ver" : "View only")}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="calendar" className="gap-2">
              <Calendar className="w-4 h-4" />
              {isEs ? "Calendario" : "Calendar"}
            </TabsTrigger>
            <TabsTrigger value="posts" className="gap-2">
              <FileText className="w-4 h-4" />
              Posts ({posts.length})
            </TabsTrigger>
            <TabsTrigger value="ideas" className="gap-2">
              <Lightbulb className="w-4 h-4" />
              {isEs ? "Ideas" : "Ideas"} ({ideas.length})
            </TabsTrigger>
          </TabsList>

          {loadingData ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Calendar Tab */}
              <TabsContent value="calendar">
                <Card>
                  <CardHeader>
                    <CardTitle>{isEs ? "Calendario de Contenido" : "Content Calendar"}</CardTitle>
                    <CardDescription>
                      {isEs ? "Posts programados y publicados" : "Scheduled and published posts"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {posts.filter(p => p.scheduled_at).length === 0 ? (
                      <p className="text-center py-8 text-muted-foreground">
                        {isEs ? "No hay posts programados" : "No scheduled posts"}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {posts.filter(p => p.scheduled_at).sort((a, b) => 
                          new Date(a.scheduled_at) - new Date(b.scheduled_at)
                        ).map((post) => (
                          <div key={post.post_id} className="p-4 border rounded-lg">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                {post.content_type === "video" ? (
                                  <Video className="w-5 h-5 text-muted-foreground" />
                                ) : (
                                  <Image className="w-5 h-5 text-muted-foreground" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm line-clamp-2">{post.caption || (isEs ? "Sin caption" : "No caption")}</p>
                                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {new Date(post.scheduled_at).toLocaleString()}
                                  </span>
                                  {post.platforms?.map(p => (
                                    <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                                  ))}
                                </div>
                              </div>
                              {getStatusBadge(post.status)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Posts Tab */}
              <TabsContent value="posts">
                <Card>
                  <CardHeader>
                    <CardTitle>{isEs ? "Todos los Posts" : "All Posts"}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {posts.length === 0 ? (
                      <p className="text-center py-8 text-muted-foreground">
                        {isEs ? "No hay posts" : "No posts"}
                      </p>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2">
                        {posts.map((post) => (
                          <div key={post.post_id} className="p-4 border rounded-lg">
                            <div className="flex items-start justify-between mb-2">
                              {getStatusBadge(post.status)}
                              <span className="text-xs text-muted-foreground">
                                {new Date(post.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm line-clamp-3">{post.caption || (isEs ? "Sin caption" : "No caption")}</p>
                            <div className="flex items-center gap-2 mt-3">
                              {post.platforms?.map(p => (
                                <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Ideas Tab */}
              <TabsContent value="ideas">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>{isEs ? "Ideas de Contenido" : "Content Ideas"}</CardTitle>
                        <CardDescription>
                          {isEs ? "Ideas para futuro contenido" : "Ideas for future content"}
                        </CardDescription>
                      </div>
                      {session?.permissions === "contributor" && (
                        <Button variant="outline" size="sm">
                          <PenLine className="w-4 h-4 mr-2" />
                          {isEs ? "Nueva Idea" : "New Idea"}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {ideas.length === 0 ? (
                      <p className="text-center py-8 text-muted-foreground">
                        {isEs ? "No hay ideas" : "No ideas"}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {ideas.map((idea) => (
                          <div key={idea.idea_id} className="p-4 border rounded-lg">
                            <h4 className="font-medium">{idea.title}</h4>
                            {idea.description && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {idea.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">{idea.content_type}</Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(idea.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </>
          )}
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t mt-8 py-4 text-center text-sm text-muted-foreground">
        <p>
          {isEs ? "Sesión expira en" : "Session expires in"} {session?.expires_in_hours || 8} {isEs ? "horas" : "hours"}
        </p>
      </footer>
    </div>
  );
}

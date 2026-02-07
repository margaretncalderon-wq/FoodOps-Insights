import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "../utils/api";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Target,
  Plus,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ChevronRight,
  Users,
  Calendar,
  ArrowRight,
  Zap,
  TrendingUp,
  Pause,
  Archive,
  CircleDot,
} from "lucide-react";
import { toast } from "sonner";

// Status config uses translation keys
const statusConfig = {
  planning: { 
    labelKey: "planning",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    icon: CircleDot 
  },
  in_progress: { 
    labelKey: "inProgress",
    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    icon: Zap 
  },
  blocked: { 
    labelKey: "blocked",
    color: "bg-red-500/20 text-red-400 border-red-500/30",
    icon: AlertTriangle 
  },
  live: { 
    labelKey: "live",
    color: "bg-green-500/20 text-green-400 border-green-500/30",
    icon: CheckCircle2 
  },
  archived: { 
    labelKey: "archived",
    color: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    icon: Archive 
  },
};

const impactConfig = {
  cost: { labelKey: "cost", color: "bg-emerald-500/20 text-emerald-400" },
  quality: { labelKey: "quality", color: "bg-purple-500/20 text-purple-400" },
  speed: { labelKey: "speed", color: "bg-orange-500/20 text-orange-400" },
  risk: { labelKey: "risk", color: "bg-red-500/20 text-red-400" },
};

const contextConfig = {
  organizational: { labelKey: "organizational" },
  event: { labelKey: "event" },
  department: { labelKey: "department" },
  personal: { labelKey: "personal" },
};

export default function ExecutionHubPage() {
  const navigate = useNavigate();
  const { language, t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState([]);
  const [usage, setUsage] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  
  const [newGoal, setNewGoal] = useState({
    title: "",
    objective: "",
    context_type: "organizational",
    impact_areas: [],
    target_date: "",
  });

  const fetchData = useCallback(async () => {
    try {
      const [goalsRes, usageRes] = await Promise.all([
        axios.get(`${API}/execution-hub/goals`, { withCredentials: true }),
        axios.get(`${API}/execution-hub/usage`, { withCredentials: true }),
      ]);
      setGoals(goalsRes.data || []);
      setUsage(usageRes.data);
    } catch (error) {
      console.error("Error fetching goals:", error);
      toast.error(t("errorLoadingGoals"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateGoal = async () => {
    if (!newGoal.title || !newGoal.objective) {
      toast.error(t("titleObjectiveRequired"));
      return;
    }

    setCreating(true);
    try {
      const payload = {
        ...newGoal,
        target_date: newGoal.target_date || null,
      };
      await axios.post(`${API}/execution-hub/goals`, payload, { withCredentials: true });
      toast.success(t("goalCreated"));
      setShowCreateDialog(false);
      setNewGoal({
        title: "",
        objective: "",
        context_type: "organizational",
        impact_areas: [],
        target_date: "",
      });
      fetchData();
    } catch (error) {
      const detail = error.response?.data?.detail || "";
      toast.error(detail || t("errorCreatingGoal"));
    } finally {
      setCreating(false);
    }
  };

  const toggleImpactArea = (area) => {
    setNewGoal(prev => ({
      ...prev,
      impact_areas: prev.impact_areas.includes(area)
        ? prev.impact_areas.filter(a => a !== area)
        : [...prev.impact_areas, area]
    }));
  };

  const filteredGoals = goals.filter(goal => {
    const matchesSearch = goal.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         goal.objective.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || goal.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const goalsByStatus = {
    active: filteredGoals.filter(g => ["planning", "in_progress"].includes(g.status)),
    blocked: filteredGoals.filter(g => g.status === "blocked"),
    completed: filteredGoals.filter(g => g.status === "live"),
    archived: filteredGoals.filter(g => g.status === "archived"),
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-[#AED768]" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6" data-testid="execution-hub-page">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Target className="w-7 h-7 text-[#AED768]" />
              {t("executionHub")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t("manageGoalsTrackProgress")}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {usage && (
              <div className="text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-lg">
                <span className="font-medium text-foreground">{usage.goals_created_this_month}</span>
                <span className="mx-1">/</span>
                <span>{usage.is_unlimited ? "∞" : usage.goals_limit}</span>
                <span className="ml-1">{t("goalsThisMonth")}</span>
              </div>
            )}
            <Button 
              onClick={() => setShowCreateDialog(true)}
              className="bg-[#AED768] hover:bg-[#9dc856] text-[#1F2937]"
              disabled={usage && !usage.can_create}
              data-testid="create-goal-btn"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("newGoal")}
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {t("active")}
                  </p>
                  <p className="text-2xl font-bold text-foreground">{goalsByStatus.active.length}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {isEs ? "Bloqueadas" : "Blocked"}
                  </p>
                  <p className="text-2xl font-bold text-foreground">{goalsByStatus.blocked.length}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {isEs ? "Completadas" : "Completed"}
                  </p>
                  <p className="text-2xl font-bold text-foreground">{goalsByStatus.completed.length}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {isEs ? "Este Mes" : "This Month"}
                  </p>
                  <p className="text-2xl font-bold text-foreground">{goals.length}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#AED768]/20 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-[#AED768]" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={isEs ? "Buscar metas..." : "Search goals..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-card border-border"
              data-testid="search-goals-input"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48 bg-card border-border" data-testid="status-filter">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder={isEs ? "Filtrar por estado" : "Filter by status"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
              <SelectItem value="planning">{isEs ? "Planificación" : "Planning"}</SelectItem>
              <SelectItem value="in_progress">{isEs ? "En Progreso" : "In Progress"}</SelectItem>
              <SelectItem value="blocked">{isEs ? "Bloqueado" : "Blocked"}</SelectItem>
              <SelectItem value="live">{isEs ? "Activo" : "Live"}</SelectItem>
              <SelectItem value="archived">{isEs ? "Archivado" : "Archived"}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Goals List */}
        {filteredGoals.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center">
              <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                {isEs ? "No hay metas" : "No goals yet"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {isEs 
                  ? "Crea tu primera meta de ejecución para comenzar" 
                  : "Create your first execution goal to get started"}
              </p>
              <Button 
                onClick={() => setShowCreateDialog(true)}
                className="bg-[#AED768] hover:bg-[#9dc856] text-[#1F2937]"
              >
                <Plus className="w-4 h-4 mr-2" />
                {isEs ? "Crear Meta" : "Create Goal"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredGoals.map((goal) => {
              const status = statusConfig[goal.status] || statusConfig.planning;
              const StatusIcon = status.icon;
              
              return (
                <Card 
                  key={goal.goal_id}
                  className="bg-card border-border hover:border-[#AED768]/50 transition-colors cursor-pointer group"
                  onClick={() => navigate(`/execution-hub/${goal.goal_id}`)}
                  data-testid={`goal-card-${goal.goal_id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={`${status.color} border text-xs`}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {isEs ? status.label : status.labelEn}
                          </Badge>
                          {goal.context_type && (
                            <span className="text-xs text-muted-foreground">
                              {isEs 
                                ? contextConfig[goal.context_type]?.label 
                                : contextConfig[goal.context_type]?.labelEn}
                            </span>
                          )}
                        </div>
                        
                        <h3 className="font-semibold text-foreground mb-1 truncate">
                          {goal.title}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {goal.objective}
                        </p>
                        
                        <div className="flex items-center gap-4 mt-3">
                          {goal.impact_areas?.length > 0 && (
                            <div className="flex items-center gap-1">
                              {goal.impact_areas.map(area => (
                                <Badge 
                                  key={area} 
                                  variant="outline" 
                                  className={`${impactConfig[area]?.color} text-xs border-0`}
                                >
                                  {isEs ? impactConfig[area]?.label : impactConfig[area]?.labelEn}
                                </Badge>
                              ))}
                            </div>
                          )}
                          
                          {goal.target_date && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              {new Date(goal.target_date).toLocaleDateString()}
                            </div>
                          )}
                          
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="w-3 h-3" />
                            {goal.owner_name}
                          </div>
                        </div>
                      </div>
                      
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-[#AED768] transition-colors flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Create Goal Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-[#AED768]" />
                {isEs ? "Nueva Meta de Ejecución" : "New Execution Goal"}
              </DialogTitle>
              <DialogDescription>
                {isEs 
                  ? "Define una nueva meta operativa para tu organización" 
                  : "Define a new operational goal for your organization"}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  {isEs ? "Título" : "Title"} *
                </label>
                <Input
                  value={newGoal.title}
                  onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                  placeholder={isEs ? "Ej: Reducir costos operativos Q1" : "Ex: Reduce operational costs Q1"}
                  data-testid="goal-title-input"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  {isEs ? "Objetivo" : "Objective"} *
                </label>
                <Textarea
                  value={newGoal.objective}
                  onChange={(e) => setNewGoal({ ...newGoal, objective: e.target.value })}
                  placeholder={isEs 
                    ? "Describe el objetivo específico y medible..." 
                    : "Describe the specific and measurable objective..."}
                  rows={3}
                  data-testid="goal-objective-input"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  {isEs ? "Contexto" : "Context"}
                </label>
                <Select 
                  value={newGoal.context_type} 
                  onValueChange={(v) => setNewGoal({ ...newGoal, context_type: v })}
                >
                  <SelectTrigger data-testid="goal-context-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="organizational">
                      {isEs ? "Organizacional" : "Organizational"}
                    </SelectItem>
                    <SelectItem value="event">
                      {isEs ? "Evento" : "Event"}
                    </SelectItem>
                    <SelectItem value="department">
                      {isEs ? "Departamento" : "Department"}
                    </SelectItem>
                    <SelectItem value="personal">
                      {isEs ? "Personal" : "Personal"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  {isEs ? "Áreas de Impacto" : "Impact Areas"}
                </label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(impactConfig).map(([key, config]) => (
                    <Badge
                      key={key}
                      variant="outline"
                      className={`cursor-pointer transition-all ${
                        newGoal.impact_areas.includes(key)
                          ? config.color + " border-current"
                          : "hover:bg-muted"
                      }`}
                      onClick={() => toggleImpactArea(key)}
                      data-testid={`impact-${key}`}
                    >
                      {isEs ? config.label : config.labelEn}
                    </Badge>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  {isEs ? "Fecha Objetivo" : "Target Date"}
                </label>
                <Input
                  type="date"
                  value={newGoal.target_date}
                  onChange={(e) => setNewGoal({ ...newGoal, target_date: e.target.value })}
                  data-testid="goal-target-date"
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                {isEs ? "Cancelar" : "Cancel"}
              </Button>
              <Button 
                onClick={handleCreateGoal}
                disabled={creating || !newGoal.title || !newGoal.objective}
                className="bg-[#AED768] hover:bg-[#9dc856] text-[#1F2937]"
                data-testid="submit-goal-btn"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                {isEs ? "Crear Meta" : "Create Goal"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

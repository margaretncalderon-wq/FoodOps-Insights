import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Textarea } from "../ui/textarea";
import { Progress } from "../ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
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
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  Search, RefreshCw, MoreHorizontal,
  Target, TrendingUp, Star, Award, Calendar,
  Plus, Eye, MessageSquare, BarChart3, Users,
  ChevronRight, Clock, CheckCircle2
} from "lucide-react";
import { toast } from "sonner";

import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";

const REVIEW_STATUS = {
  draft: { label: "Draft", labelEs: "Borrador", color: "bg-slate-100 text-slate-700" },
  pending_self: { label: "Pending Self-Review", labelEs: "Pendiente Auto-Evaluación", color: "bg-amber-100 text-amber-700" },
  pending_manager: { label: "Pending Manager", labelEs: "Pendiente Gerente", color: "bg-blue-100 text-blue-700" },
  completed: { label: "Completed", labelEs: "Completado", color: "bg-green-100 text-green-700" }
};

const REVIEW_PERIODS = {
  q1: { label: "Q1", labelEs: "T1" },
  q2: { label: "Q2", labelEs: "T2" },
  q3: { label: "Q3", labelEs: "T3" },
  q4: { label: "Q4", labelEs: "T4" },
  annual: { label: "Annual", labelEs: "Anual" },
  probation: { label: "Probation", labelEs: "Período de Prueba" }
};

const RATING_LABELS = {
  1: { label: "Needs Improvement", labelEs: "Necesita Mejorar", color: "text-red-600" },
  2: { label: "Below Expectations", labelEs: "Por Debajo de Expectativas", color: "text-orange-600" },
  3: { label: "Meets Expectations", labelEs: "Cumple Expectativas", color: "text-amber-600" },
  4: { label: "Exceeds Expectations", labelEs: "Supera Expectativas", color: "text-green-600" },
  5: { label: "Outstanding", labelEs: "Excepcional", color: "text-emerald-600" }
};

const DEFAULT_COMPETENCIES = [
  { key: "quality", label: "Quality of Work", labelEs: "Calidad del Trabajo" },
  { key: "productivity", label: "Productivity", labelEs: "Productividad" },
  { key: "teamwork", label: "Teamwork", labelEs: "Trabajo en Equipo" },
  { key: "communication", label: "Communication", labelEs: "Comunicación" },
  { key: "initiative", label: "Initiative", labelEs: "Iniciativa" },
  { key: "reliability", label: "Reliability", labelEs: "Confiabilidad" },
  { key: "adaptability", label: "Adaptability", labelEs: "Adaptabilidad" }
];

export function PerformanceSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [activeView, setActiveView] = useState("reviews"); // reviews, goals, feedback
  const [reviews, setReviews] = useState([]);
  const [goals, setGoals] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());
  
  // Dialogs
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState(null);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Review Form
  const [reviewForm, setReviewForm] = useState({
    employee_id: "",
    period: "annual",
    year: new Date().getFullYear(),
    ratings: {},
    self_assessment: "",
    manager_assessment: "",
    goals_achieved: "",
    areas_for_improvement: "",
    development_plan: "",
    overall_rating: 3
  });

  // Goal Form
  const [goalForm, setGoalForm] = useState({
    employee_id: "",
    title: "",
    description: "",
    target_date: "",
    progress: 0,
    status: "in_progress"
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [reviewsRes, goalsRes, empRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/performance/reviews?year=${yearFilter}${periodFilter !== 'all' ? `&period=${periodFilter}` : ''}`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/performance/goals`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/employees?status=active`, { withCredentials: true })
      ]);
      setReviews(reviewsRes.data || []);
      setGoals(goalsRes.data || []);
      setEmployees(empRes.data || []);
    } catch (err) {
      console.error("Error fetching performance data:", err);
      setReviews([]);
      setGoals([]);
    }
    setLoading(false);
  }, [yearFilter, periodFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveReview = async () => {
    if (!reviewForm.employee_id) {
      toast.error(isEs ? "Selecciona un empleado" : "Select an employee");
      return;
    }
    setSaving(true);
    try {
      if (selectedReview) {
        await axios.put(`${API}/api/people-ops/performance/reviews/${selectedReview.id}`, reviewForm, { withCredentials: true });
        toast.success(isEs ? "Evaluación actualizada" : "Review updated");
      } else {
        await axios.post(`${API}/api/people-ops/performance/reviews`, {
          ...reviewForm,
          status: "draft"
        }, { withCredentials: true });
        toast.success(isEs ? "Evaluación creada" : "Review created");
      }
      setReviewDialogOpen(false);
      resetReviewForm();
      fetchData();
    } catch (err) {
      toast.error(isEs ? "Error al guardar" : "Error saving");
    }
    setSaving(false);
  };

  const handleSaveGoal = async () => {
    if (!goalForm.employee_id || !goalForm.title) {
      toast.error(isEs ? "Completa los campos requeridos" : "Complete required fields");
      return;
    }
    setSaving(true);
    try {
      if (selectedGoal) {
        await axios.put(`${API}/api/people-ops/performance/goals/${selectedGoal.id}`, goalForm, { withCredentials: true });
        toast.success(isEs ? "Meta actualizada" : "Goal updated");
      } else {
        await axios.post(`${API}/api/people-ops/performance/goals`, goalForm, { withCredentials: true });
        toast.success(isEs ? "Meta creada" : "Goal created");
      }
      setGoalDialogOpen(false);
      resetGoalForm();
      fetchData();
    } catch (err) {
      toast.error(isEs ? "Error al guardar" : "Error saving");
    }
    setSaving(false);
  };

  const resetReviewForm = () => {
    setReviewForm({
      employee_id: "",
      period: "annual",
      year: new Date().getFullYear(),
      ratings: {},
      self_assessment: "",
      manager_assessment: "",
      goals_achieved: "",
      areas_for_improvement: "",
      development_plan: "",
      overall_rating: 3
    });
    setSelectedReview(null);
  };

  const resetGoalForm = () => {
    setGoalForm({
      employee_id: "",
      title: "",
      description: "",
      target_date: "",
      progress: 0,
      status: "in_progress"
    });
    setSelectedGoal(null);
  };

  const openEditReview = (review) => {
    setSelectedReview(review);
    setReviewForm({
      employee_id: review.employee_id || "",
      period: review.period || "annual",
      year: review.year || new Date().getFullYear(),
      ratings: review.ratings || {},
      self_assessment: review.self_assessment || "",
      manager_assessment: review.manager_assessment || "",
      goals_achieved: review.goals_achieved || "",
      areas_for_improvement: review.areas_for_improvement || "",
      development_plan: review.development_plan || "",
      overall_rating: review.overall_rating || 3
    });
    setReviewDialogOpen(true);
  };

  const openEditGoal = (goal) => {
    setSelectedGoal(goal);
    setGoalForm({
      employee_id: goal.employee_id || "",
      title: goal.title || "",
      description: goal.description || "",
      target_date: goal.target_date?.split("T")[0] || "",
      progress: goal.progress || 0,
      status: goal.status || "in_progress"
    });
    setGoalDialogOpen(true);
  };

  const getEmployeeName = (employeeId) => {
    const emp = employees.find(e => e.id === employeeId);
    return emp ? `${emp.first_name} ${emp.last_name}` : "Unknown";
  };

  const filteredReviews = reviews.filter(r =>
    getEmployeeName(r.employee_id).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredGoals = goals.filter(g =>
    getEmployeeName(g.employee_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
    g.title?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Stats
  const stats = {
    totalReviews: reviews.length,
    completedReviews: reviews.filter(r => r.status === "completed").length,
    pendingReviews: reviews.filter(r => r.status !== "completed").length,
    avgRating: reviews.length > 0 
      ? (reviews.reduce((sum, r) => sum + (r.overall_rating || 0), 0) / reviews.length).toFixed(1)
      : 0,
    activeGoals: goals.filter(g => g.status === "in_progress").length,
    completedGoals: goals.filter(g => g.status === "completed").length
  };

  const renderStars = (rating, editable = false, onChange = null) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={!editable}
            onClick={() => editable && onChange && onChange(star)}
            className={`${editable ? "cursor-pointer hover:scale-110" : "cursor-default"} transition-transform`}
          >
            <Star
              className={`w-5 h-5 ${star <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
            />
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6" data-testid="performance-section">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Evaluaciones" : "Reviews"}</p>
                <p className="text-2xl font-bold">{stats.totalReviews}</p>
                <p className="text-xs text-muted-foreground">
                  {stats.completedReviews} {isEs ? "completadas" : "completed"}
                </p>
              </div>
              <BarChart3 className="w-8 h-8 text-violet-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Rating Promedio" : "Avg Rating"}</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold">{stats.avgRating}</p>
                  <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                </div>
              </div>
              <Award className="w-8 h-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Metas Activas" : "Active Goals"}</p>
                <p className="text-2xl font-bold">{stats.activeGoals}</p>
              </div>
              <Target className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Metas Logradas" : "Goals Achieved"}</p>
                <p className="text-2xl font-bold">{stats.completedGoals}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Toggle and Actions */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex gap-2">
          <Button
            variant={activeView === "reviews" ? "default" : "outline"}
            onClick={() => setActiveView("reviews")}
            size="sm"
            data-testid="view-reviews-btn"
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            {isEs ? "Evaluaciones" : "Reviews"}
          </Button>
          <Button
            variant={activeView === "goals" ? "default" : "outline"}
            onClick={() => setActiveView("goals")}
            size="sm"
            data-testid="view-goals-btn"
          >
            <Target className="w-4 h-4 mr-2" />
            {isEs ? "Metas" : "Goals"}
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={isEs ? "Buscar..." : "Search..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-[180px]"
              data-testid="search-input"
            />
          </div>
          {activeView === "reviews" && (
            <>
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2025, 2024, 2023].map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
                  {Object.entries(REVIEW_PERIODS).map(([key, info]) => (
                    <SelectItem key={key} value={key}>{isEs ? info.labelEs : info.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <Button onClick={fetchData} variant="outline" size="icon" data-testid="refresh-btn">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {activeView === "reviews" && (
            <Button onClick={() => { resetReviewForm(); setReviewDialogOpen(true); }} data-testid="new-review-btn">
              <Plus className="w-4 h-4 mr-2" />
              {isEs ? "Nueva Evaluación" : "New Review"}
            </Button>
          )}
          {activeView === "goals" && (
            <Button onClick={() => { resetGoalForm(); setGoalDialogOpen(true); }} data-testid="new-goal-btn">
              <Plus className="w-4 h-4 mr-2" />
              {isEs ? "Nueva Meta" : "New Goal"}
            </Button>
          )}
        </div>
      </div>

      {/* Reviews View */}
      {activeView === "reviews" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isEs ? "Evaluaciones de Desempeño" : "Performance Reviews"}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredReviews.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{isEs ? "No hay evaluaciones" : "No reviews found"}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Empleado" : "Employee"}</TableHead>
                    <TableHead>{isEs ? "Período" : "Period"}</TableHead>
                    <TableHead>{isEs ? "Año" : "Year"}</TableHead>
                    <TableHead>{isEs ? "Rating" : "Rating"}</TableHead>
                    <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReviews.map((review) => {
                    const statusInfo = REVIEW_STATUS[review.status] || REVIEW_STATUS.draft;
                    const periodInfo = REVIEW_PERIODS[review.period] || { label: review.period, labelEs: review.period };
                    return (
                      <TableRow key={review.id} data-testid={`review-row-${review.id}`}>
                        <TableCell className="font-medium">{getEmployeeName(review.employee_id)}</TableCell>
                        <TableCell>{isEs ? periodInfo.labelEs : periodInfo.label}</TableCell>
                        <TableCell>{review.year}</TableCell>
                        <TableCell>{renderStars(review.overall_rating || 0)}</TableCell>
                        <TableCell>
                          <Badge className={statusInfo.color}>
                            {isEs ? statusInfo.labelEs : statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => openEditReview(review)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Goals View */}
      {activeView === "goals" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-full flex justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredGoals.length === 0 ? (
            <div className="col-span-full">
              <Card>
                <CardContent className="py-12 text-center">
                  <Target className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">{isEs ? "No hay metas" : "No goals found"}</p>
                </CardContent>
              </Card>
            </div>
          ) : (
            filteredGoals.map((goal) => {
              const employee = employees.find(e => e.id === goal.employee_id);
              return (
                <Card 
                  key={goal.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => openEditGoal(goal)}
                  data-testid={`goal-card-${goal.id}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-base">{goal.title}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {employee ? `${employee.first_name} ${employee.last_name}` : "Unknown"}
                        </p>
                      </div>
                      <Badge variant={goal.status === "completed" ? "default" : "secondary"}>
                        {goal.status === "completed" 
                          ? (isEs ? "Completada" : "Completed")
                          : (isEs ? "En Progreso" : "In Progress")
                        }
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {goal.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{goal.description}</p>
                      )}
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">{isEs ? "Progreso" : "Progress"}</span>
                          <span className="font-medium">{goal.progress || 0}%</span>
                        </div>
                        <Progress value={goal.progress || 0} className="h-2" />
                      </div>
                      {goal.target_date && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {isEs ? "Fecha meta" : "Target"}: {formatDateOnly(goal.target_date, language)}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedReview 
                ? (isEs ? "Editar Evaluación" : "Edit Review")
                : (isEs ? "Nueva Evaluación" : "New Review")
              }
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Empleado" : "Employee"} *</label>
                <Select 
                  value={reviewForm.employee_id} 
                  onValueChange={(v) => setReviewForm({ ...reviewForm, employee_id: v })}
                >
                  <SelectTrigger data-testid="review-employee-select">
                    <SelectValue placeholder={isEs ? "Seleccionar" : "Select"} />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Período" : "Period"}</label>
                <Select 
                  value={reviewForm.period} 
                  onValueChange={(v) => setReviewForm({ ...reviewForm, period: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(REVIEW_PERIODS).map(([key, info]) => (
                      <SelectItem key={key} value={key}>{isEs ? info.labelEs : info.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Año" : "Year"}</label>
                <Select 
                  value={reviewForm.year.toString()} 
                  onValueChange={(v) => setReviewForm({ ...reviewForm, year: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2025, 2024, 2023].map(year => (
                      <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Competency Ratings */}
            <div className="space-y-3">
              <label className="text-sm font-medium">{isEs ? "Calificación por Competencias" : "Competency Ratings"}</label>
              <div className="grid gap-3 p-4 border rounded-lg">
                {DEFAULT_COMPETENCIES.map((comp) => (
                  <div key={comp.key} className="flex items-center justify-between">
                    <span className="text-sm">{isEs ? comp.labelEs : comp.label}</span>
                    {renderStars(
                      reviewForm.ratings[comp.key] || 0,
                      true,
                      (rating) => setReviewForm({
                        ...reviewForm,
                        ratings: { ...reviewForm.ratings, [comp.key]: rating }
                      })
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Overall Rating */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{isEs ? "Calificación General" : "Overall Rating"}</label>
              <div className="flex items-center gap-4">
                {renderStars(
                  reviewForm.overall_rating,
                  true,
                  (rating) => setReviewForm({ ...reviewForm, overall_rating: rating })
                )}
                <span className={`text-sm font-medium ${RATING_LABELS[reviewForm.overall_rating]?.color}`}>
                  {isEs 
                    ? RATING_LABELS[reviewForm.overall_rating]?.labelEs 
                    : RATING_LABELS[reviewForm.overall_rating]?.label
                  }
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{isEs ? "Auto-Evaluación" : "Self Assessment"}</label>
              <Textarea
                value={reviewForm.self_assessment}
                onChange={(e) => setReviewForm({ ...reviewForm, self_assessment: e.target.value })}
                rows={3}
                placeholder={isEs ? "Comentarios del empleado..." : "Employee comments..."}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{isEs ? "Evaluación del Gerente" : "Manager Assessment"}</label>
              <Textarea
                value={reviewForm.manager_assessment}
                onChange={(e) => setReviewForm({ ...reviewForm, manager_assessment: e.target.value })}
                rows={3}
                placeholder={isEs ? "Comentarios del gerente..." : "Manager comments..."}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Metas Logradas" : "Goals Achieved"}</label>
                <Textarea
                  value={reviewForm.goals_achieved}
                  onChange={(e) => setReviewForm({ ...reviewForm, goals_achieved: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Áreas de Mejora" : "Areas for Improvement"}</label>
                <Textarea
                  value={reviewForm.areas_for_improvement}
                  onChange={(e) => setReviewForm({ ...reviewForm, areas_for_improvement: e.target.value })}
                  rows={2}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{isEs ? "Plan de Desarrollo" : "Development Plan"}</label>
              <Textarea
                value={reviewForm.development_plan}
                onChange={(e) => setReviewForm({ ...reviewForm, development_plan: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveReview} disabled={saving} data-testid="save-review-btn">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Goal Dialog */}
      <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedGoal 
                ? (isEs ? "Editar Meta" : "Edit Goal")
                : (isEs ? "Nueva Meta" : "New Goal")
              }
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{isEs ? "Empleado" : "Employee"} *</label>
              <Select 
                value={goalForm.employee_id} 
                onValueChange={(v) => setGoalForm({ ...goalForm, employee_id: v })}
              >
                <SelectTrigger data-testid="goal-employee-select">
                  <SelectValue placeholder={isEs ? "Seleccionar" : "Select"} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{isEs ? "Título" : "Title"} *</label>
              <Input
                value={goalForm.title}
                onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
                placeholder={isEs ? "Ej: Mejorar tiempo de servicio" : "Ex: Improve service time"}
                data-testid="goal-title-input"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{isEs ? "Descripción" : "Description"}</label>
              <Textarea
                value={goalForm.description}
                onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Fecha Meta" : "Target Date"}</label>
                <Input
                  type="date"
                  value={goalForm.target_date}
                  onChange={(e) => setGoalForm({ ...goalForm, target_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Progreso" : "Progress"} (%)</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={goalForm.progress}
                  onChange={(e) => setGoalForm({ ...goalForm, progress: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            {selectedGoal && (
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Estado" : "Status"}</label>
                <Select 
                  value={goalForm.status} 
                  onValueChange={(v) => setGoalForm({ ...goalForm, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_progress">{isEs ? "En Progreso" : "In Progress"}</SelectItem>
                    <SelectItem value="completed">{isEs ? "Completada" : "Completed"}</SelectItem>
                    <SelectItem value="cancelled">{isEs ? "Cancelada" : "Cancelled"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoalDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveGoal} disabled={saving} data-testid="save-goal-btn">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

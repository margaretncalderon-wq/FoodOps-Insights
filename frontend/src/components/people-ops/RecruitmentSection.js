import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Textarea } from "../ui/textarea";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  UserPlus, Search, Briefcase, Calendar, RefreshCw, MoreHorizontal,
  FileText, Mail, Phone, Building2, MapPin, DollarSign, Clock,
  CheckCircle2, XCircle, Users, ArrowRight, Filter, Plus, Eye
} from "lucide-react";
import { toast } from "sonner";

import { API_BASE as API } from "../../utils/api";

const RECRUITMENT_STAGES = {
  new: { label: "New", labelEs: "Nuevo", color: "bg-slate-100 text-slate-700" },
  screening: { label: "Screening", labelEs: "Revisión", color: "bg-blue-100 text-blue-700" },
  interview: { label: "Interview", labelEs: "Entrevista", color: "bg-amber-100 text-amber-700" },
  assessment: { label: "Assessment", labelEs: "Evaluación", color: "bg-purple-100 text-purple-700" },
  offer: { label: "Offer", labelEs: "Oferta", color: "bg-emerald-100 text-emerald-700" },
  hired: { label: "Hired", labelEs: "Contratado", color: "bg-green-100 text-green-700" },
  rejected: { label: "Rejected", labelEs: "Rechazado", color: "bg-red-100 text-red-700" }
};

const JOB_STATUS = {
  open: { label: "Open", labelEs: "Abierta", color: "bg-emerald-100 text-emerald-700" },
  on_hold: { label: "On Hold", labelEs: "En Pausa", color: "bg-amber-100 text-amber-700" },
  closed: { label: "Closed", labelEs: "Cerrada", color: "bg-gray-100 text-gray-700" },
  filled: { label: "Filled", labelEs: "Cubierta", color: "bg-blue-100 text-blue-700" }
};

export function RecruitmentSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [activeView, setActiveView] = useState("jobs"); // jobs, candidates, pipeline
  const [jobPostings, setJobPostings] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [departments, setDepartments] = useState([]);
  
  // Job Dialog
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [saving, setSaving] = useState(false);
  const [jobForm, setJobForm] = useState({
    title: "",
    department: "",
    location: "",
    employment_type: "full_time",
    salary_min: "",
    salary_max: "",
    description: "",
    requirements: "",
    status: "open"
  });

  // Candidate Dialog
  const [candidateDialogOpen, setCandidateDialogOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [candidateForm, setCandidateForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    job_posting_id: "",
    source: "",
    resume_url: "",
    notes: "",
    stage: "new"
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [jobsRes, candidatesRes, deptRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/recruitment/jobs?status=${statusFilter}`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/recruitment/candidates`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/reference/departments`, { withCredentials: true })
      ]);
      setJobPostings(jobsRes.data || []);
      setCandidates(candidatesRes.data || []);
      setDepartments(deptRes.data || []);
    } catch (err) {
      console.error("Error fetching recruitment data:", err);
      // Initialize with empty arrays on error
      setJobPostings([]);
      setCandidates([]);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveJob = async () => {
    setSaving(true);
    try {
      if (selectedJob) {
        await axios.put(`${API}/api/people-ops/recruitment/jobs/${selectedJob.id}`, jobForm, { withCredentials: true });
        toast.success(isEs ? "Vacante actualizada" : "Job posting updated");
      } else {
        await axios.post(`${API}/api/people-ops/recruitment/jobs`, jobForm, { withCredentials: true });
        toast.success(isEs ? "Vacante creada" : "Job posting created");
      }
      setJobDialogOpen(false);
      resetJobForm();
      fetchData();
    } catch (err) {
      toast.error(isEs ? "Error al guardar" : "Error saving");
    }
    setSaving(false);
  };

  const handleSaveCandidate = async () => {
    setSaving(true);
    try {
      if (selectedCandidate) {
        await axios.put(`${API}/api/people-ops/recruitment/candidates/${selectedCandidate.id}`, candidateForm, { withCredentials: true });
        toast.success(isEs ? "Candidato actualizado" : "Candidate updated");
      } else {
        await axios.post(`${API}/api/people-ops/recruitment/candidates`, candidateForm, { withCredentials: true });
        toast.success(isEs ? "Candidato agregado" : "Candidate added");
      }
      setCandidateDialogOpen(false);
      resetCandidateForm();
      fetchData();
    } catch (err) {
      toast.error(isEs ? "Error al guardar" : "Error saving");
    }
    setSaving(false);
  };

  const updateCandidateStage = async (candidateId, newStage) => {
    try {
      await axios.patch(`${API}/api/people-ops/recruitment/candidates/${candidateId}/stage`, 
        { stage: newStage }, 
        { withCredentials: true }
      );
      toast.success(isEs ? "Etapa actualizada" : "Stage updated");
      fetchData();
    } catch (err) {
      toast.error(isEs ? "Error al actualizar" : "Error updating");
    }
  };

  const resetJobForm = () => {
    setJobForm({
      title: "",
      department: "",
      location: "",
      employment_type: "full_time",
      salary_min: "",
      salary_max: "",
      description: "",
      requirements: "",
      status: "open"
    });
    setSelectedJob(null);
  };

  const resetCandidateForm = () => {
    setCandidateForm({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      job_posting_id: "",
      source: "",
      resume_url: "",
      notes: "",
      stage: "new"
    });
    setSelectedCandidate(null);
  };

  const openEditJob = (job) => {
    setSelectedJob(job);
    setJobForm({
      title: job.title || "",
      department: job.department || "",
      location: job.location || "",
      employment_type: job.employment_type || "full_time",
      salary_min: job.salary_min || "",
      salary_max: job.salary_max || "",
      description: job.description || "",
      requirements: job.requirements || "",
      status: job.status || "open"
    });
    setJobDialogOpen(true);
  };

  const filteredJobs = jobPostings.filter(job =>
    job.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.department?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCandidates = candidates.filter(c =>
    `${c.first_name} ${c.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Stats
  const stats = {
    openJobs: jobPostings.filter(j => j.status === "open").length,
    totalCandidates: candidates.length,
    inPipeline: candidates.filter(c => !["hired", "rejected"].includes(c.stage)).length,
    hiredThisMonth: candidates.filter(c => {
      if (c.stage !== "hired") return false;
      const hiredDate = new Date(c.updated_at);
      const now = new Date();
      return hiredDate.getMonth() === now.getMonth() && hiredDate.getFullYear() === now.getFullYear();
    }).length
  };

  return (
    <div className="space-y-6" data-testid="recruitment-section">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Vacantes Abiertas" : "Open Positions"}</p>
                <p className="text-2xl font-bold">{stats.openJobs}</p>
              </div>
              <Briefcase className="w-8 h-8 text-emerald-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Total Candidatos" : "Total Candidates"}</p>
                <p className="text-2xl font-bold">{stats.totalCandidates}</p>
              </div>
              <Users className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "En Pipeline" : "In Pipeline"}</p>
                <p className="text-2xl font-bold">{stats.inPipeline}</p>
              </div>
              <ArrowRight className="w-8 h-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Contratados (Mes)" : "Hired (Month)"}</p>
                <p className="text-2xl font-bold">{stats.hiredThisMonth}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Toggle and Actions */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex gap-2">
          <Button
            variant={activeView === "jobs" ? "default" : "outline"}
            onClick={() => setActiveView("jobs")}
            size="sm"
            data-testid="view-jobs-btn"
          >
            <Briefcase className="w-4 h-4 mr-2" />
            {isEs ? "Vacantes" : "Job Postings"}
          </Button>
          <Button
            variant={activeView === "candidates" ? "default" : "outline"}
            onClick={() => setActiveView("candidates")}
            size="sm"
            data-testid="view-candidates-btn"
          >
            <Users className="w-4 h-4 mr-2" />
            {isEs ? "Candidatos" : "Candidates"}
          </Button>
          <Button
            variant={activeView === "pipeline" ? "default" : "outline"}
            onClick={() => setActiveView("pipeline")}
            size="sm"
            data-testid="view-pipeline-btn"
          >
            <ArrowRight className="w-4 h-4 mr-2" />
            Pipeline
          </Button>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={isEs ? "Buscar..." : "Search..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-[200px]"
              data-testid="search-input"
            />
          </div>
          <Button onClick={fetchData} variant="outline" size="icon" data-testid="refresh-btn">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {activeView === "jobs" && (
            <Button onClick={() => { resetJobForm(); setJobDialogOpen(true); }} data-testid="new-job-btn">
              <Plus className="w-4 h-4 mr-2" />
              {isEs ? "Nueva Vacante" : "New Job"}
            </Button>
          )}
          {activeView === "candidates" && (
            <Button onClick={() => { resetCandidateForm(); setCandidateDialogOpen(true); }} data-testid="new-candidate-btn">
              <UserPlus className="w-4 h-4 mr-2" />
              {isEs ? "Agregar Candidato" : "Add Candidate"}
            </Button>
          )}
        </div>
      </div>

      {/* Jobs View */}
      {activeView === "jobs" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg">{isEs ? "Vacantes" : "Job Postings"}</CardTitle>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]" data-testid="status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">{isEs ? "Abiertas" : "Open"}</SelectItem>
                  <SelectItem value="on_hold">{isEs ? "En Pausa" : "On Hold"}</SelectItem>
                  <SelectItem value="closed">{isEs ? "Cerradas" : "Closed"}</SelectItem>
                  <SelectItem value="all">{isEs ? "Todas" : "All"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{isEs ? "No hay vacantes" : "No job postings"}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Título" : "Title"}</TableHead>
                    <TableHead>{isEs ? "Departamento" : "Department"}</TableHead>
                    <TableHead>{isEs ? "Ubicación" : "Location"}</TableHead>
                    <TableHead>{isEs ? "Candidatos" : "Candidates"}</TableHead>
                    <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((job) => {
                    const jobCandidates = candidates.filter(c => c.job_posting_id === job.id);
                    const statusInfo = JOB_STATUS[job.status] || JOB_STATUS.open;
                    return (
                      <TableRow key={job.id} data-testid={`job-row-${job.id}`}>
                        <TableCell className="font-medium">{job.title}</TableCell>
                        <TableCell>{job.department || "-"}</TableCell>
                        <TableCell>{job.location || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{jobCandidates.length}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={statusInfo.color}>
                            {isEs ? statusInfo.labelEs : statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditJob(job)}>
                                <Eye className="w-4 h-4 mr-2" />
                                {isEs ? "Ver/Editar" : "View/Edit"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      {/* Candidates View */}
      {activeView === "candidates" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isEs ? "Candidatos" : "Candidates"}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{isEs ? "No hay candidatos" : "No candidates"}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Nombre" : "Name"}</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>{isEs ? "Vacante" : "Job"}</TableHead>
                    <TableHead>{isEs ? "Fuente" : "Source"}</TableHead>
                    <TableHead>{isEs ? "Etapa" : "Stage"}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCandidates.map((candidate) => {
                    const job = jobPostings.find(j => j.id === candidate.job_posting_id);
                    const stageInfo = RECRUITMENT_STAGES[candidate.stage] || RECRUITMENT_STAGES.new;
                    return (
                      <TableRow key={candidate.id} data-testid={`candidate-row-${candidate.id}`}>
                        <TableCell className="font-medium">
                          {candidate.first_name} {candidate.last_name}
                        </TableCell>
                        <TableCell>{candidate.email}</TableCell>
                        <TableCell>{job?.title || "-"}</TableCell>
                        <TableCell>{candidate.source || "-"}</TableCell>
                        <TableCell>
                          <Badge className={stageInfo.color}>
                            {isEs ? stageInfo.labelEs : stageInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => {
                                setSelectedCandidate(candidate);
                                setCandidateForm({
                                  first_name: candidate.first_name || "",
                                  last_name: candidate.last_name || "",
                                  email: candidate.email || "",
                                  phone: candidate.phone || "",
                                  job_posting_id: candidate.job_posting_id || "",
                                  source: candidate.source || "",
                                  resume_url: candidate.resume_url || "",
                                  notes: candidate.notes || "",
                                  stage: candidate.stage || "new"
                                });
                                setCandidateDialogOpen(true);
                              }}>
                                <Eye className="w-4 h-4 mr-2" />
                                {isEs ? "Ver/Editar" : "View/Edit"}
                              </DropdownMenuItem>
                              {candidate.stage !== "hired" && candidate.stage !== "rejected" && (
                                <>
                                  <DropdownMenuItem onClick={() => updateCandidateStage(candidate.id, "hired")}>
                                    <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                                    {isEs ? "Marcar Contratado" : "Mark Hired"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => updateCandidateStage(candidate.id, "rejected")}>
                                    <XCircle className="w-4 h-4 mr-2 text-red-600" />
                                    {isEs ? "Rechazar" : "Reject"}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      {/* Pipeline View - Kanban Style */}
      {activeView === "pipeline" && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4" data-testid="pipeline-view">
          {Object.entries(RECRUITMENT_STAGES)
            .filter(([key]) => !["hired", "rejected"].includes(key))
            .map(([stageKey, stageInfo]) => {
              const stageCandidates = candidates.filter(c => c.stage === stageKey);
              return (
                <Card key={stageKey} className="min-h-[300px]">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <Badge className={stageInfo.color}>
                        {isEs ? stageInfo.labelEs : stageInfo.label}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{stageCandidates.length}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {stageCandidates.map((candidate) => {
                      const job = jobPostings.find(j => j.id === candidate.job_posting_id);
                      return (
                        <div 
                          key={candidate.id}
                          className="p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow cursor-pointer"
                          onClick={() => {
                            setSelectedCandidate(candidate);
                            setCandidateForm({
                              first_name: candidate.first_name || "",
                              last_name: candidate.last_name || "",
                              email: candidate.email || "",
                              phone: candidate.phone || "",
                              job_posting_id: candidate.job_posting_id || "",
                              source: candidate.source || "",
                              resume_url: candidate.resume_url || "",
                              notes: candidate.notes || "",
                              stage: candidate.stage || "new"
                            });
                            setCandidateDialogOpen(true);
                          }}
                        >
                          <p className="font-medium text-sm">
                            {candidate.first_name} {candidate.last_name}
                          </p>
                          {job && (
                            <p className="text-xs text-muted-foreground mt-1">{job.title}</p>
                          )}
                        </div>
                      );
                    })}
                    {stageCandidates.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        {isEs ? "Sin candidatos" : "No candidates"}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}

      {/* Job Posting Dialog */}
      <Dialog open={jobDialogOpen} onOpenChange={setJobDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedJob 
                ? (isEs ? "Editar Vacante" : "Edit Job Posting")
                : (isEs ? "Nueva Vacante" : "New Job Posting")
              }
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Título del Puesto" : "Job Title"} *</label>
                <Input
                  value={jobForm.title}
                  onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                  placeholder={isEs ? "Ej: Chef Ejecutivo" : "Ex: Executive Chef"}
                  data-testid="job-title-input"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Departamento" : "Department"}</label>
                <Select value={jobForm.department} onValueChange={(v) => setJobForm({ ...jobForm, department: v })}>
                  <SelectTrigger data-testid="job-department-select">
                    <SelectValue placeholder={isEs ? "Seleccionar" : "Select"} />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Ubicación" : "Location"}</label>
                <Input
                  value={jobForm.location}
                  onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })}
                  placeholder={isEs ? "Ej: CDMX" : "Ex: Mexico City"}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Tipo de Empleo" : "Employment Type"}</label>
                <Select value={jobForm.employment_type} onValueChange={(v) => setJobForm({ ...jobForm, employment_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">{isEs ? "Tiempo Completo" : "Full Time"}</SelectItem>
                    <SelectItem value="part_time">{isEs ? "Medio Tiempo" : "Part Time"}</SelectItem>
                    <SelectItem value="contract">{isEs ? "Contrato" : "Contract"}</SelectItem>
                    <SelectItem value="freelance">Freelance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Salario Mínimo" : "Min Salary"}</label>
                <Input
                  type="number"
                  value={jobForm.salary_min}
                  onChange={(e) => setJobForm({ ...jobForm, salary_min: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Salario Máximo" : "Max Salary"}</label>
                <Input
                  type="number"
                  value={jobForm.salary_max}
                  onChange={(e) => setJobForm({ ...jobForm, salary_max: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{isEs ? "Descripción" : "Description"}</label>
              <Textarea
                value={jobForm.description}
                onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                rows={3}
                placeholder={isEs ? "Descripción del puesto..." : "Job description..."}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{isEs ? "Requisitos" : "Requirements"}</label>
              <Textarea
                value={jobForm.requirements}
                onChange={(e) => setJobForm({ ...jobForm, requirements: e.target.value })}
                rows={3}
                placeholder={isEs ? "Requisitos del puesto..." : "Job requirements..."}
              />
            </div>
            {selectedJob && (
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Estado" : "Status"}</label>
                <Select value={jobForm.status} onValueChange={(v) => setJobForm({ ...jobForm, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">{isEs ? "Abierta" : "Open"}</SelectItem>
                    <SelectItem value="on_hold">{isEs ? "En Pausa" : "On Hold"}</SelectItem>
                    <SelectItem value="closed">{isEs ? "Cerrada" : "Closed"}</SelectItem>
                    <SelectItem value="filled">{isEs ? "Cubierta" : "Filled"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJobDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveJob} disabled={saving || !jobForm.title} data-testid="save-job-btn">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Candidate Dialog */}
      <Dialog open={candidateDialogOpen} onOpenChange={setCandidateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCandidate 
                ? (isEs ? "Editar Candidato" : "Edit Candidate")
                : (isEs ? "Agregar Candidato" : "Add Candidate")
              }
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Nombre" : "First Name"} *</label>
                <Input
                  value={candidateForm.first_name}
                  onChange={(e) => setCandidateForm({ ...candidateForm, first_name: e.target.value })}
                  data-testid="candidate-firstname-input"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Apellido" : "Last Name"} *</label>
                <Input
                  value={candidateForm.last_name}
                  onChange={(e) => setCandidateForm({ ...candidateForm, last_name: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email *</label>
                <Input
                  type="email"
                  value={candidateForm.email}
                  onChange={(e) => setCandidateForm({ ...candidateForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Teléfono" : "Phone"}</label>
                <Input
                  value={candidateForm.phone}
                  onChange={(e) => setCandidateForm({ ...candidateForm, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Vacante" : "Job Posting"}</label>
                <Select 
                  value={candidateForm.job_posting_id} 
                  onValueChange={(v) => setCandidateForm({ ...candidateForm, job_posting_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Seleccionar vacante" : "Select job"} />
                  </SelectTrigger>
                  <SelectContent>
                    {jobPostings.filter(j => j.status === "open").map((job) => (
                      <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Fuente" : "Source"}</label>
                <Select 
                  value={candidateForm.source} 
                  onValueChange={(v) => setCandidateForm({ ...candidateForm, source: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Seleccionar" : "Select"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="indeed">Indeed</SelectItem>
                    <SelectItem value="referral">{isEs ? "Referido" : "Referral"}</SelectItem>
                    <SelectItem value="website">{isEs ? "Sitio Web" : "Website"}</SelectItem>
                    <SelectItem value="other">{isEs ? "Otro" : "Other"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {selectedCandidate && (
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Etapa" : "Stage"}</label>
                <Select 
                  value={candidateForm.stage} 
                  onValueChange={(v) => setCandidateForm({ ...candidateForm, stage: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RECRUITMENT_STAGES).map(([key, info]) => (
                      <SelectItem key={key} value={key}>
                        {isEs ? info.labelEs : info.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">{isEs ? "URL del CV" : "Resume URL"}</label>
              <Input
                value={candidateForm.resume_url}
                onChange={(e) => setCandidateForm({ ...candidateForm, resume_url: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{isEs ? "Notas" : "Notes"}</label>
              <Textarea
                value={candidateForm.notes}
                onChange={(e) => setCandidateForm({ ...candidateForm, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCandidateDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button 
              onClick={handleSaveCandidate} 
              disabled={saving || !candidateForm.first_name || !candidateForm.last_name || !candidateForm.email}
              data-testid="save-candidate-btn"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

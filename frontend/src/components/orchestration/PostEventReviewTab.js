import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTerminology } from "../../hooks/useTerminology";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { 
  Save, RefreshCw, Star, Plus, Trash2, Lock,
  ThumbsUp, ThumbsDown, AlertTriangle, Lightbulb, MessageSquare
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import { KoraLoader } from "../KoraLoader";

export default function PostEventReviewTab({ eventId, eventStatus }) {
  const { language } = useLanguage();
  const { term } = useTerminology();
  const isEs = language === "es";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState({
    what_worked: [],
    what_failed: [],
    deviations: [],
    learnings: [],
    client_feedback: "",
    team_feedback: "",
    rating: null,
    is_locked: false
  });
  const [newWorked, setNewWorked] = useState("");
  const [newFailed, setNewFailed] = useState("");
  const [newLearning, setNewLearning] = useState("");
  const [newDeviation, setNewDeviation] = useState({ planned: "", actual: "", reason: "" });

  const fetchReview = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/orchestration/review/${eventId}`, { withCredentials: true });
      setReview(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { fetchReview(); }, [fetchReview]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/api/orchestration/review/${eventId}`, { event_id: eventId, ...review }, { withCredentials: true });
      toast.success(isEs ? "Revisión guardada" : "Review saved");
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al guardar" : "Failed to save"));
    }
    setSaving(false);
  };

  const handleLock = async () => {
    if (!window.confirm(isEs 
      ? "¿Bloquear la revisión? No podrá ser editada después." 
      : "Lock the review? It cannot be edited after."
    )) return;
    
    try {
      await axios.post(`${API}/api/orchestration/review/${eventId}/lock`, {}, { withCredentials: true });
      setReview({ ...review, is_locked: true });
      toast.success(isEs ? "Revisión bloqueada" : "Review locked");
    } catch (err) {
      toast.error(isEs ? "Error al bloquear" : "Failed to lock");
    }
  };

  const addWorked = () => {
    if (!newWorked.trim()) return;
    setReview({ ...review, what_worked: [...review.what_worked, newWorked.trim()] });
    setNewWorked("");
  };

  const removeWorked = (index) => {
    setReview({ ...review, what_worked: review.what_worked.filter((_, i) => i !== index) });
  };

  const addFailed = () => {
    if (!newFailed.trim()) return;
    setReview({ ...review, what_failed: [...review.what_failed, newFailed.trim()] });
    setNewFailed("");
  };

  const removeFailed = (index) => {
    setReview({ ...review, what_failed: review.what_failed.filter((_, i) => i !== index) });
  };

  const addLearning = () => {
    if (!newLearning.trim()) return;
    setReview({ ...review, learnings: [...review.learnings, newLearning.trim()] });
    setNewLearning("");
  };

  const removeLearning = (index) => {
    setReview({ ...review, learnings: review.learnings.filter((_, i) => i !== index) });
  };

  const addDeviation = () => {
    if (!newDeviation.planned || !newDeviation.actual) return;
    setReview({ ...review, deviations: [...review.deviations, { ...newDeviation, id: Date.now() }] });
    setNewDeviation({ planned: "", actual: "", reason: "" });
  };

  const removeDeviation = (index) => {
    setReview({ ...review, deviations: review.deviations.filter((_, i) => i !== index) });
  };

  if (loading) return <div className="flex items-center justify-center h-64"><KoraLoader size={48} /></div>;

  const isEventCompleted = eventStatus === "Won" || eventStatus === "Lost";

  return (
    <div className="space-y-6" data-testid="post-event-review-tab">
      {/* Status Banner */}
      {!isEventCompleted && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-yellow-700">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">
                {isEs 
                  ? `La revisión post-${term("events", "entity_singular").toLowerCase()} estará disponible cuando el ${term("events", "entity_singular").toLowerCase()} se marque como ganado o perdido.`
                  : `Post-${term("events", "entity_singular").toLowerCase()} review will be available when the ${term("events", "entity_singular").toLowerCase()} is marked as won or lost.`}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {review.is_locked && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-blue-700">
              <Lock className="w-4 h-4" />
              <span className="text-sm">
                {isEs 
                  ? "Esta revisión está bloqueada y no puede ser modificada."
                  : "This review is locked and cannot be modified."}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rating */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5" />
            {isEs ? "Calificación General" : "Overall Rating"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => !review.is_locked && setReview({ ...review, rating: star })}
                disabled={review.is_locked}
                className={`p-1 transition-colors ${review.is_locked ? "cursor-not-allowed" : "cursor-pointer"}`}
              >
                <Star 
                  className={`w-8 h-8 ${
                    review.rating >= star 
                      ? "fill-yellow-400 text-yellow-400" 
                      : "text-gray-300"
                  }`}
                />
              </button>
            ))}
            {review.rating && (
              <span className="ml-2 text-lg font-medium">{review.rating}/5</span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* What Worked */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <ThumbsUp className="w-5 h-5" />
              {isEs ? "Lo que funcionó" : "What Worked"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!review.is_locked && (
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newWorked}
                  onChange={(e) => setNewWorked(e.target.value)}
                  placeholder={isEs ? "Agregar éxito..." : "Add success..."}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  onKeyDown={(e) => e.key === "Enter" && addWorked()}
                />
                <Button variant="outline" onClick={addWorked}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            )}
            <div className="space-y-2">
              {review.what_worked.map((item, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
                  <ThumbsUp className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span className="flex-1 text-sm">{item}</span>
                  {!review.is_locked && (
                    <button onClick={() => removeWorked(index)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {review.what_worked.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {isEs ? "Sin éxitos registrados" : "No successes recorded"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* What Failed */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <ThumbsDown className="w-5 h-5" />
              {isEs ? "Lo que falló" : "What Failed"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!review.is_locked && (
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newFailed}
                  onChange={(e) => setNewFailed(e.target.value)}
                  placeholder={isEs ? "Agregar fallo..." : "Add failure..."}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  onKeyDown={(e) => e.key === "Enter" && addFailed()}
                />
                <Button variant="outline" onClick={addFailed}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            )}
            <div className="space-y-2">
              {review.what_failed.map((item, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-red-50 rounded-lg">
                  <ThumbsDown className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="flex-1 text-sm">{item}</span>
                  {!review.is_locked && (
                    <button onClick={() => removeFailed(index)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {review.what_failed.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {isEs ? "Sin fallos registrados" : "No failures recorded"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Deviations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            {isEs ? "Desviaciones" : "Deviations"}
          </CardTitle>
          <CardDescription>
            {isEs ? "Diferencias entre lo planificado y lo ejecutado" : "Differences between planned and executed"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!review.is_locked && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
              <input
                type="text"
                value={newDeviation.planned}
                onChange={(e) => setNewDeviation({ ...newDeviation, planned: e.target.value })}
                placeholder={isEs ? "Lo planificado..." : "What was planned..."}
                className="px-3 py-2 border rounded-lg text-sm"
              />
              <input
                type="text"
                value={newDeviation.actual}
                onChange={(e) => setNewDeviation({ ...newDeviation, actual: e.target.value })}
                placeholder={isEs ? "Lo que pasó..." : "What happened..."}
                className="px-3 py-2 border rounded-lg text-sm"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newDeviation.reason}
                  onChange={(e) => setNewDeviation({ ...newDeviation, reason: e.target.value })}
                  placeholder={isEs ? "Razón..." : "Reason..."}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm"
                />
                <Button variant="outline" onClick={addDeviation}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {review.deviations.map((dev, index) => (
              <div key={dev.id || index} className="p-3 border rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm">
                      <span className="font-medium text-blue-600">{isEs ? "Planificado" : "Planned"}:</span> {dev.planned}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium text-orange-600">{isEs ? "Actual" : "Actual"}:</span> {dev.actual}
                    </p>
                    {dev.reason && (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">{isEs ? "Razón" : "Reason"}:</span> {dev.reason}
                      </p>
                    )}
                  </div>
                  {!review.is_locked && (
                    <button onClick={() => removeDeviation(index)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {review.deviations.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {isEs ? "Sin desviaciones registradas" : "No deviations recorded"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Learnings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-500" />
            {isEs ? "Aprendizajes" : "Learnings"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!review.is_locked && (
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newLearning}
                onChange={(e) => setNewLearning(e.target.value)}
                placeholder={isEs ? "Agregar aprendizaje..." : "Add learning..."}
                className="flex-1 px-3 py-2 border rounded-lg text-sm"
                onKeyDown={(e) => e.key === "Enter" && addLearning()}
              />
              <Button variant="outline" onClick={addLearning}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          )}
          <div className="space-y-2">
            {review.learnings.map((item, index) => (
              <div key={index} className="flex items-center gap-2 p-2 bg-yellow-50 rounded-lg">
                <Lightbulb className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                <span className="flex-1 text-sm">{item}</span>
                {!review.is_locked && (
                  <button onClick={() => removeLearning(index)} className="text-red-500 hover:text-red-700">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {review.learnings.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {isEs ? "Sin aprendizajes registrados" : "No learnings recorded"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Feedback */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              {isEs ? "Feedback del Cliente" : "Client Feedback"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={review.client_feedback || ""}
              onChange={(e) => setReview({ ...review, client_feedback: e.target.value })}
              placeholder={isEs ? "Comentarios del cliente..." : "Client comments..."}
              rows={4}
              disabled={review.is_locked}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              {isEs ? "Feedback del Equipo" : "Team Feedback"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={review.team_feedback || ""}
              onChange={(e) => setReview({ ...review, team_feedback: e.target.value })}
              placeholder={isEs ? "Comentarios del equipo..." : "Team comments..."}
              rows={4}
              disabled={review.is_locked}
            />
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      {!review.is_locked && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleLock} className="gap-2">
            <Lock className="w-4 h-4" />
            {isEs ? "Bloquear Revisión" : "Lock Review"}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEs ? "Guardar Revisión" : "Save Review"}
          </Button>
        </div>
      )}
    </div>
  );
}

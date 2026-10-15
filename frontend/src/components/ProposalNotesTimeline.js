import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { API } from "../utils/api";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Paperclip, Pin, MoreVertical, Trash2, Edit3, Send, Smile, Download, X,
  MessageSquare, Phone, Mail, Users, FileText, Zap, HelpCircle, CheckCircle2, RotateCcw,
} from "lucide-react";

const CATEGORY_META = {
  approval_question: { es: "Pregunta de aprobación", en: "Approval question", icon: HelpCircle, color: "bg-orange-100 text-orange-800 border-orange-200" },
  change_request:  { es: "Cambio",         en: "Change",          icon: Edit3,          color: "bg-blue-100 text-blue-700 border-blue-200" },
  client_request:  { es: "Solicitud",      en: "Request",         icon: MessageSquare,  color: "bg-amber-100 text-amber-800 border-amber-200" },
  internal:        { es: "Interna",        en: "Internal",        icon: FileText,       color: "bg-slate-100 text-slate-700 border-slate-200" },
  meeting:         { es: "Reunión",        en: "Meeting",         icon: Users,          color: "bg-purple-100 text-purple-700 border-purple-200" },
  call:            { es: "Llamada",        en: "Call",            icon: Phone,          color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  email:           { es: "Email",          en: "Email",           icon: Mail,           color: "bg-teal-100 text-teal-700 border-teal-200" },
  system:          { es: "Sistema",        en: "System",          icon: Zap,            color: "bg-red-100 text-red-700 border-red-200" },
};

const EMOJIS = ["👍", "✅", "⚠️", "❤️", "👀", "🚨"];

function formatRelative(iso, language) {
  if (!iso) return "";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return language === "es" ? "hace unos segundos" : "just now";
  if (mins < 60) return language === "es" ? `hace ${mins} min` : `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return language === "es" ? `hace ${hrs} h` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return language === "es" ? `hace ${days} d` : `${days}d ago`;
  return d.toLocaleDateString(language === "es" ? "es-DO" : "en-US", { month: "short", day: "numeric", year: "numeric" });
}

function groupReactions(reactions) {
  const groups = {};
  (reactions || []).forEach((r) => {
    if (!groups[r.emoji]) groups[r.emoji] = { emoji: r.emoji, count: 0, names: [], userIds: [] };
    groups[r.emoji].count += 1;
    groups[r.emoji].names.push(r.name || "Alguien");
    groups[r.emoji].userIds.push(r.user_id);
  });
  return Object.values(groups);
}

export default function ProposalNotesTimeline({ proposalId, language = "es", currentUserId, onCountChange, orderItems = [], composeSignal = 0, onOpenQuestionsChange }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("internal");
  const [visibility, setVisibility] = useState("internal_only");
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const fileInputRef = useRef(null);
  const composerRef = useRef(null);
  const textareaRef = useRef(null);
  const isQuestion = category === "approval_question";
  const openQuestions = notes.filter((n) => n.category === "approval_question" && !n.resolved).length;

  useEffect(() => {
    if (!composeSignal) return;
    setCategory("approval_question");
    setVisibility("internal_only");
    setTimeout(() => {
      composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      textareaRef.current?.focus();
    }, 150);
  }, [composeSignal]);

  useEffect(() => {
    if (!loading && onOpenQuestionsChange) onOpenQuestionsChange(openQuestions);
  }, [openQuestions, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchNotes = useCallback(async () => {
    if (!proposalId) return;
    try {
      const r = await axios.get(`${API}/proposals/${proposalId}/notes`, { withCredentials: true });
      setNotes(r.data?.notes || []);
      if (onCountChange) onCountChange(r.data?.count || 0);
    } catch {
      toast.error(language === "es" ? "Error al cargar bitácora" : "Failed to load notes");
    } finally {
      setLoading(false);
    }
  }, [proposalId, language, onCountChange]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const handleFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded = [];
      for (const f of files) {
        if (f.size > 15 * 1024 * 1024) {
          toast.error(language === "es" ? `${f.name} excede 15MB` : `${f.name} exceeds 15MB`);
          continue;
        }
        const form = new FormData();
        form.append("file", f);
        const r = await axios.post(
          `${API}/proposals/${proposalId}/notes/attachments`,
          form,
          { withCredentials: true, headers: { "Content-Type": "multipart/form-data" } },
        );
        uploaded.push(r.data);
      }
      setPendingAttachments((prev) => [...prev, ...uploaded]);
    } catch (e) {
      toast.error(e?.response?.data?.detail || (language === "es" ? "Error al subir archivo" : "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  const removePending = (id) => setPendingAttachments((prev) => prev.filter((a) => a.attachment_id !== id));

  const postNote = async () => {
    if (!body.trim()) return;
    setPosting(true);
    try {
      await axios.post(
        `${API}/proposals/${proposalId}/notes`,
        {
          body: body.trim(),
          category,
          visibility,
          attachment_ids: pendingAttachments.map((a) => a.attachment_id),
        },
        { withCredentials: true },
      );
      setBody("");
      setPendingAttachments([]);
      setCategory("internal");
      setVisibility("internal_only");
      await fetchNotes();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (language === "es" ? "Error al publicar nota" : "Failed to post note"));
    } finally {
      setPosting(false);
    }
  };

  const saveEdit = async (noteId) => {
    if (!editBody.trim()) return;
    try {
      await axios.put(
        `${API}/proposals/${proposalId}/notes/${noteId}`,
        { body: editBody.trim() },
        { withCredentials: true },
      );
      setEditingId(null);
      setEditBody("");
      await fetchNotes();
    } catch {
      toast.error(language === "es" ? "Error al guardar" : "Save failed");
    }
  };

  const deleteNote = async (noteId) => {
    if (!window.confirm(language === "es" ? "¿Eliminar esta nota?" : "Delete this note?")) return;
    try {
      await axios.delete(`${API}/proposals/${proposalId}/notes/${noteId}`, { withCredentials: true });
      await fetchNotes();
    } catch {
      toast.error(language === "es" ? "Error al eliminar" : "Delete failed");
    }
  };

  const togglePin = async (noteId) => {
    try {
      await axios.post(`${API}/proposals/${proposalId}/notes/${noteId}/pin`, {}, { withCredentials: true });
      await fetchNotes();
    } catch {
      toast.error(language === "es" ? "Error al fijar" : "Pin failed");
    }
  };

  const toggleResolved = async (noteId) => {
    try {
      const r = await axios.post(`${API}/proposals/${proposalId}/notes/${noteId}/resolve`, {}, { withCredentials: true });
      toast.success(r.data?.resolved
        ? (language === "es" ? "Pregunta resuelta" : "Question resolved")
        : (language === "es" ? "Pregunta reabierta" : "Question reopened"));
      await fetchNotes();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    }
  };

  const toggleReaction = async (noteId, emoji) => {
    try {
      await axios.post(
        `${API}/proposals/${proposalId}/notes/${noteId}/reactions`,
        { emoji },
        { withCredentials: true },
      );
      await fetchNotes();
    } catch {
      toast.error(language === "es" ? "Error" : "Error");
    }
  };

  const downloadAttachment = async (att) => {
    try {
      const r = await axios.get(
        `${API}/proposals/${proposalId}/notes/attachments/${att.attachment_id}`,
        { withCredentials: true, responseType: "blob" },
      );
      const url = URL.createObjectURL(r.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = att.original_filename || "attachment";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      toast.error(language === "es" ? "Error al descargar" : "Download failed");
    }
  };

  const filteredNotes = notes.filter((n) =>
    filterCategory === "all"
    || (filterCategory === "open_questions" ? n.category === "approval_question" && !n.resolved : n.category === filterCategory));

  return (
    <div className="space-y-4" data-testid="proposal-notes-timeline">
      {/* Composer */}
      <div ref={composerRef} className={`border rounded-xl p-4 bg-gradient-to-br to-white transition-colors ${isQuestion ? "from-orange-50 border-orange-200" : "from-slate-50"}`} data-testid="note-composer">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Select value={category} onValueChange={(v) => { setCategory(v); if (v === "approval_question") setVisibility("internal_only"); }}>
            <SelectTrigger className="w-52 h-8 text-xs" data-testid="note-category-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_META).filter(([k]) => k !== "system").map(([key, meta]) => {
                const Icon = meta.icon;
                return (
                  <SelectItem key={key} value={key}>
                    <span className="inline-flex items-center gap-1.5"><Icon className="w-3 h-3" /> {language === "es" ? meta.es : meta.en}</span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Select value={visibility} onValueChange={setVisibility} disabled={isQuestion}>
            <SelectTrigger className="w-44 h-8 text-xs" data-testid="note-visibility-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="internal_only">🔒 {language === "es" ? "Solo interno" : "Internal only"}</SelectItem>
              <SelectItem value="share_with_client">👥 {language === "es" ? "Visible al cliente" : "Visible to client"}</SelectItem>
            </SelectContent>
          </Select>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(Array.from(e.target.files || []))}
            data-testid="note-file-input"
          />
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Paperclip className="w-3.5 h-3.5" />
            {uploading ? (language === "es" ? "Subiendo…" : "Uploading…") : (language === "es" ? "Adjuntar" : "Attach")}
          </Button>
        </div>

        {isQuestion && (
          <p className="text-xs text-orange-800 mb-2" data-testid="note-question-hint">
            {language === "es"
              ? "Pregunta interna para tu equipo. Mientras esté abierta, la propuesta queda como \"Datos incompletos\" y se te avisará antes de aprobar."
              : "Internal question for your team. While open, the proposal is flagged \"Incomplete data\" and you'll be warned before approving."}
          </p>
        )}
        <Textarea
          ref={textareaRef}
          data-testid="note-body-input"
          placeholder={isQuestion
            ? (language === "es" ? "¿Qué necesitas confirmar antes de aprobar? Usa @nombre para dirigirla a alguien…" : "What do you need to confirm before approving? Use @name to direct it…")
            : (language === "es" ? "Escribe una nota. Usa @nombre para mencionar a tu equipo…" : "Write a note. Use @name to mention your team…")}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="resize-none"
        />

        {pendingAttachments.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mt-2" data-testid="pending-attachments">
            {pendingAttachments.map((a) => (
              <Badge key={a.attachment_id} variant="secondary" className="gap-1">
                <Paperclip className="w-3 h-3" /> {a.original_filename}
                <button type="button" onClick={() => removePending(a.attachment_id)} className="ml-1 hover:text-red-600">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-3">
          <Button
            type="button"
            size="sm"
            onClick={postNote}
            disabled={!body.trim() || posting}
            data-testid="note-post-btn"
            className="gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            {posting
              ? (language === "es" ? "Publicando…" : "Posting…")
              : isQuestion
                ? (language === "es" ? "Preguntar" : "Ask")
                : (language === "es" ? "Publicar" : "Post")}
          </Button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant={filterCategory === "all" ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => setFilterCategory("all")}
          data-testid="filter-all"
        >
          {language === "es" ? "Todas" : "All"} ({notes.length})
        </Badge>
        {openQuestions > 0 && (
          <Badge
            variant={filterCategory === "open_questions" ? "default" : "outline"}
            className="cursor-pointer gap-1 border-orange-300 text-orange-800"
            onClick={() => setFilterCategory("open_questions")}
            data-testid="filter-open-questions"
          >
            <HelpCircle className="w-3 h-3" />
            {language === "es" ? "Abiertas" : "Open"} ({openQuestions})
          </Badge>
        )}
        {Object.entries(CATEGORY_META).map(([key, meta]) => {
          const count = notes.filter((n) => n.category === key).length;
          if (!count) return null;
          const Icon = meta.icon;
          return (
            <Badge
              key={key}
              variant={filterCategory === key ? "default" : "outline"}
              className="cursor-pointer gap-1"
              onClick={() => setFilterCategory(key)}
              data-testid={`filter-${key}`}
            >
              <Icon className="w-3 h-3" />
              {language === "es" ? meta.es : meta.en} ({count})
            </Badge>
          );
        })}
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="text-center py-8 text-sm text-muted-foreground">{language === "es" ? "Cargando…" : "Loading…"}</div>
      ) : filteredNotes.length === 0 ? (
        <div className="text-center py-10 border-2 border-dashed rounded-xl text-muted-foreground">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{language === "es" ? "Aún no hay notas. Agrega la primera arriba." : "No notes yet. Add the first above."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotes.map((n) => {
            const meta = CATEGORY_META[n.category] || CATEGORY_META.internal;
            const Icon = meta.icon;
            const isAuthor = n.author_id === currentUserId;
            const isSystem = n.author_id === "system" || n.is_system;
            const reactionGroups = groupReactions(n.reactions);
            const isEditing = editingId === n.note_id;
            const linkedItems = (n.linked_item_ids || [])
              .map((id) => orderItems.find((oi) => oi.item_id === id))
              .filter(Boolean);

            return (
              <div
                key={n.note_id}
                className={`border rounded-xl p-4 ${n.pinned ? "ring-1 ring-amber-300 bg-amber-50/30" : n.category === "approval_question" && !n.resolved ? "border-orange-300 bg-orange-50/40" : "bg-white"}`}
                data-testid={`note-${n.note_id}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={`gap-1 border ${meta.color}`}>
                      <Icon className="w-3 h-3" /> {language === "es" ? meta.es : meta.en}
                    </Badge>
                    {n.visibility === "share_with_client" && (
                      <Badge variant="secondary" className="text-xs">👥 {language === "es" ? "Cliente ve esto" : "Client sees this"}</Badge>
                    )}
                    {n.category === "approval_question" && (
                      n.resolved ? (
                        <Badge variant="outline" className="gap-1 text-xs border-emerald-300 bg-emerald-50 text-emerald-700" data-testid={`note-resolved-badge-${n.note_id}`}>
                          <CheckCircle2 className="w-3 h-3" />
                          {language === "es" ? "Resuelta" : "Resolved"}{n.resolved_by?.name ? ` · ${n.resolved_by.name}` : ""}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs border-orange-300 bg-orange-100 text-orange-800" data-testid={`note-open-badge-${n.note_id}`}>
                          {language === "es" ? "Abierta" : "Open"}
                        </Badge>
                      )
                    )}
                    {n.pinned && <Pin className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />}
                    <span className="text-xs text-muted-foreground">
                      <strong className={isSystem ? "text-red-700" : ""}>{n.author_name}</strong> · {formatRelative(n.created_at, language)}
                      {n.edited_at && <span className="italic ml-1">({language === "es" ? "editado" : "edited"})</span>}
                    </span>
                  </div>
                  {!isSystem && (
                    <div className="flex items-center gap-1">
                    {n.category === "approval_question" && (
                      <Button
                        variant={n.resolved ? "ghost" : "outline"}
                        size="sm"
                        className={`h-7 text-xs gap-1 ${n.resolved ? "text-muted-foreground" : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"}`}
                        onClick={() => toggleResolved(n.note_id)}
                        data-testid={`note-resolve-btn-${n.note_id}`}
                      >
                        {n.resolved ? <RotateCcw className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                        {n.resolved ? (language === "es" ? "Reabrir" : "Reopen") : (language === "es" ? "Marcar resuelta" : "Mark resolved")}
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`note-menu-${n.note_id}`}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => togglePin(n.note_id)}>
                          <Pin className="w-3.5 h-3.5 mr-2" />{n.pinned ? (language === "es" ? "Desfijar" : "Unpin") : (language === "es" ? "Fijar" : "Pin")}
                        </DropdownMenuItem>
                        {isAuthor && (
                          <>
                            <DropdownMenuItem onClick={() => { setEditingId(n.note_id); setEditBody(n.body); }}>
                              <Edit3 className="w-3.5 h-3.5 mr-2" />{language === "es" ? "Editar" : "Edit"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deleteNote(n.note_id)} className="text-red-600">
                              <Trash2 className="w-3.5 h-3.5 mr-2" />{language === "es" ? "Eliminar" : "Delete"}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={3} className="text-sm resize-none" />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditBody(""); }}>
                        {language === "es" ? "Cancelar" : "Cancel"}
                      </Button>
                      <Button size="sm" onClick={() => saveEdit(n.note_id)}>
                        {language === "es" ? "Guardar" : "Save"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {n.body.split(/(@[A-Za-z0-9._-]+)/g).map((part, i) =>
                        part.startsWith("@") ? (
                          <span key={i} className="text-blue-600 font-medium bg-blue-50 px-1 rounded">{part}</span>
                        ) : (
                          <span key={i}>{part}</span>
                        )
                      )}
                    </p>

                    {linkedItems.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {linkedItems.map((it) => (
                          <Badge key={it.item_id} variant="outline" className="text-xs">🔗 {it.description}</Badge>
                        ))}
                      </div>
                    )}

                    {(n.attachments || []).length > 0 && (
                      <div className="mt-3 space-y-1">
                        {n.attachments.map((att) => (
                          <button
                            key={att.attachment_id}
                            type="button"
                            onClick={() => downloadAttachment(att)}
                            className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                            data-testid={`attachment-${att.attachment_id}`}
                          >
                            <Download className="w-3 h-3" />
                            {att.original_filename}
                            <span className="text-muted-foreground">({(att.size / 1024).toFixed(0)} KB)</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex items-center gap-1 flex-wrap">
                      {reactionGroups.map((g) => (
                        <button
                          key={g.emoji}
                          type="button"
                          onClick={() => toggleReaction(n.note_id, g.emoji)}
                          title={g.names.join(", ")}
                          className={`text-xs px-2 py-0.5 rounded-full border transition ${
                            g.userIds.includes(currentUserId) ? "bg-blue-50 border-blue-300" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {g.emoji} {g.count}
                        </button>
                      ))}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="text-xs px-2 py-0.5 rounded-full border border-dashed hover:bg-slate-50 text-muted-foreground">
                            <Smile className="w-3 h-3 inline" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="flex gap-1 p-1 min-w-0">
                          {EMOJIS.map((e) => (
                            <button
                              key={e}
                              type="button"
                              onClick={() => toggleReaction(n.note_id, e)}
                              className="text-lg hover:bg-slate-100 rounded p-1 cursor-pointer"
                            >
                              {e}
                            </button>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

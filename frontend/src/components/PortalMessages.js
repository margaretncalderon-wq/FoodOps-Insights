import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API } from "../utils/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { MessageSquare, Send, Download } from "lucide-react";

const fmt = (iso) => (iso ? new Date(iso).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" }) : "");

// Client-facing thread: notes shared by the team + client replies.
export const PortalMessages = ({ eventId, defaultName = "", companyName = "" }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [name, setName] = useState(() => localStorage.getItem("kora_portal_name") || defaultName);
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const load = async () => {
    try {
      const r = await axios.get(`${API}/portal/event/${eventId}/messages`);
      setMessages(r.data?.messages || []);
    } catch { /* empty thread */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);

  const send = async () => {
    if (!body.trim() || !name.trim()) {
      toast.error("Escribe tu nombre y tu mensaje");
      return;
    }
    setSending(true);
    try {
      const r = await axios.post(`${API}/portal/event/${eventId}/messages`, { body: body.trim(), name: name.trim() });
      localStorage.setItem("kora_portal_name", name.trim());
      setMessages((m) => [...m, r.data]);
      setBody("");
      toast.success("Mensaje enviado");
    } catch {
      toast.error("No se pudo enviar el mensaje");
    } finally { setSending(false); }
  };

  const openAttachment = (att) => {
    window.open(`${API}/portal/event/${eventId}/messages/attachments/${att.attachment_id}`, "_blank");
  };

  return (
    <Card data-testid="portal-messages">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Mensajes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1" data-testid="portal-messages-list">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Cargando…</p>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="portal-messages-empty">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Aún no hay mensajes. Escríbenos si tienes alguna pregunta o solicitud.</p>
            </div>
          ) : messages.map((m) => (
            <div key={m.note_id} className={`flex ${m.is_client ? "justify-end" : "justify-start"}`} data-testid={`portal-message-${m.note_id}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${m.is_client ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"}`}>
                <p className={`text-xs mb-1 ${m.is_client ? "opacity-80" : "text-muted-foreground"}`}>
                  <strong>{m.is_client ? m.author_name : (companyName || m.author_name)}</strong> · {fmt(m.created_at)}
                </p>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.body}</p>
                {(m.attachments || []).map((att) => (
                  <button key={att.attachment_id} type="button" onClick={() => openAttachment(att)}
                    className="mt-2 flex items-center gap-1.5 text-xs underline underline-offset-2"
                    data-testid={`portal-attachment-${att.attachment_id}`}>
                    <Download className="w-3 h-3" /> {att.original_filename}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="border-t pt-4 space-y-2">
          <Input placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" data-testid="portal-message-name-input" />
          <Textarea placeholder="Escribe tu mensaje o solicitud…" value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="resize-none" data-testid="portal-message-body-input" />
          <div className="flex justify-end">
            <Button onClick={send} disabled={sending || !body.trim()} className="gap-1.5" data-testid="portal-message-send-btn">
              <Send className="w-4 h-4" /> {sending ? "Enviando…" : "Enviar"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

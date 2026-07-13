import { useState, useRef } from "react";
import { Button } from "./button";
import { Paperclip, X, FileText, Image, Film } from "lucide-react";
import { KoraLoader } from "../KoraLoader";
import axios from "axios";
import { API } from "../../utils/api";

const FILE_ICONS = {
  image: Image,
  video: Film,
  default: FileText,
};

function getFileType(contentType) {
  if (contentType?.startsWith("image/")) return "image";
  if (contentType?.startsWith("video/")) return "video";
  return "default";
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function NoteAttachments({ attachments = [], onAttachmentsChange, readOnly = false }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    const newAttachments = [...attachments];

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await axios.post(`${API}/api/execution-hub/upload-attachment`, formData, {
          withCredentials: true,
          headers: { "Content-Type": "multipart/form-data" },
        });
        newAttachments.push({
          file_url: res.data.file_url,
          filename: res.data.filename,
          content_type: res.data.content_type,
          size: res.data.size,
          is_image: res.data.is_image,
        });
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }

    onAttachmentsChange(newAttachments);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeAttachment = (idx) => {
    const updated = attachments.filter((_, i) => i !== idx);
    onAttachmentsChange(updated);
  };

  if (readOnly && attachments.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Upload Button */}
      {!readOnly && (
        <div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            data-testid="attach-file-btn"
          >
            {uploading ? <KoraLoader size={14} /> : <Paperclip className="w-3.5 h-3.5" />}
            {uploading ? "Subiendo..." : "Adjuntar archivo"}
          </Button>
        </div>
      )}

      {/* Attachment List */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((att, idx) => {
            const type = getFileType(att.content_type);
            const Icon = FILE_ICONS[type];
            const fullUrl = att.file_url?.startsWith("http") ? att.file_url : `${API}${att.file_url}`;

            return (
              <div key={idx} className="relative group">
                {att.is_image ? (
                  <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="block">
                    <img
                      src={fullUrl}
                      alt={att.filename}
                      className="h-20 w-20 object-cover rounded-lg border border-border hover:border-primary/50 transition-colors"
                    />
                  </a>
                ) : (
                  <a
                    href={fullUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors max-w-[200px]"
                  >
                    <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="text-xs truncate">{att.filename}</span>
                    {att.size && <span className="text-[10px] text-muted-foreground shrink-0">{formatFileSize(att.size)}</span>}
                  </a>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    data-testid={`remove-attachment-${idx}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

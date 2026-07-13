// components/shared/CommentsSection.js - Comments with @mentions like Notion
import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { MessageSquare, Send, MoreVertical, Edit2, Trash2, Reply, Smile, AtSign, Check, X } from "lucide-react";
import { KoraLoader } from "../KoraLoader";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const API = process.env.REACT_APP_BACKEND_URL;

const REACTION_EMOJIS = ["👍", "❤️", "😊", "🎉", "👏", "🔥"];

export default function CommentsSection({ entityType, entityId, orgId = null, className = "" }) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const isEs = language === "es";
  
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);
  const [editingComment, setEditingComment] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  
  // Mentions
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionUsers, setMentionUsers] = useState([]);
  const [selectedMentions, setSelectedMentions] = useState([]);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const textareaRef = useRef(null);
  
  const fetchComments = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      let url = `${API}/api/comments/${entityType}/${entityId}`;
      if (orgId) url += `?org_id=${orgId}`;
      const res = await axios.get(url, { withCredentials: true });
      setComments(res.data || []);
    } catch (error) {
      console.error("Error fetching comments:", error);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, orgId]);
  
  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Clear stale comments when entity changes
  useEffect(() => {
    setComments([]);
    setReplyingTo(null);
    setEditingComment(null);
  }, [entityId]);
  
  const fetchMentionUsers = async (search) => {
    try {
      let url = `${API}/api/comments/mentions/users?search=${search || ""}`;
      if (orgId) {
        url += `&org_id=${orgId}`;
      }
      const res = await axios.get(url, { withCredentials: true });
      setMentionUsers(res.data || []);
    } catch (error) {
      console.error("Error fetching mentionable users:", error);
    }
  };
  
  const handleTextChange = (e, isEdit = false) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    
    if (isEdit) {
      setEditContent(value);
    } else {
      setNewComment(value);
    }
    
    // Detect @ mention
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      // Check if there's no space after @
      if (!textAfterAt.includes(" ")) {
        setMentionSearch(textAfterAt);
        setShowMentions(true);
        fetchMentionUsers(textAfterAt);
        
        // Position the mentions dropdown
        if (textareaRef.current) {
          const rect = textareaRef.current.getBoundingClientRect();
          setMentionPosition({ 
            top: rect.bottom + 5, 
            left: rect.left 
          });
        }
        return;
      }
    }
    setShowMentions(false);
  };
  
  const insertMention = (mentionUser, isEdit = false) => {
    const currentText = isEdit ? editContent : newComment;
    const cursorPos = textareaRef.current?.selectionStart || currentText.length;
    
    const textBeforeCursor = currentText.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    const textAfterCursor = currentText.substring(cursorPos);
    
    const newText = textBeforeCursor.substring(0, lastAtIndex) + 
                    `@${mentionUser.name || mentionUser.email} ` + 
                    textAfterCursor;
    
    if (isEdit) {
      setEditContent(newText);
    } else {
      setNewComment(newText);
      // Add to selected mentions
      if (!selectedMentions.find(m => m.user_id === mentionUser.user_id)) {
        setSelectedMentions([...selectedMentions, {
          user_id: mentionUser.user_id,
          user_name: mentionUser.name || mentionUser.email,
          user_email: mentionUser.email
        }]);
      }
    }
    
    setShowMentions(false);
  };
  
  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    
    setSending(true);
    try {
      let postUrl = `${API}/api/comments`;
      if (orgId) postUrl += `?org_id=${orgId}`;
      await axios.post(
        postUrl,
        {
          entity_type: entityType,
          entity_id: entityId,
          content: newComment,
          mentions: selectedMentions,
          parent_comment_id: replyingTo?.comment_id || null
        },
        { withCredentials: true }
      );
      
      setNewComment("");
      setSelectedMentions([]);
      setReplyingTo(null);
      fetchComments();
      toast.success(isEs ? "Comentario agregado" : "Comment added");
    } catch (error) {
      console.error("Error posting comment:", error);
      toast.error(isEs ? "Error al comentar" : "Error posting comment");
    } finally {
      setSending(false);
    }
  };
  
  const handleEdit = async () => {
    if (!editContent.trim() || !editingComment) return;
    
    setSending(true);
    try {
      await axios.put(
        `${API}/api/comments/${editingComment.comment_id}`,
        { content: editContent, mentions: [] },
        { withCredentials: true }
      );
      
      setEditingComment(null);
      setEditContent("");
      fetchComments();
      toast.success(isEs ? "Comentario actualizado" : "Comment updated");
    } catch (error) {
      console.error("Error updating comment:", error);
      toast.error(isEs ? "Error al actualizar" : "Error updating");
    } finally {
      setSending(false);
    }
  };
  
  const handleDelete = async (commentId) => {
    if (!window.confirm(isEs ? "¿Eliminar este comentario?" : "Delete this comment?")) {
      return;
    }
    
    try {
      await axios.delete(
        `${API}/api/comments/${commentId}`,
        { withCredentials: true }
      );
      fetchComments();
      toast.success(isEs ? "Comentario eliminado" : "Comment deleted");
    } catch (error) {
      console.error("Error deleting comment:", error);
      toast.error(isEs ? "Error al eliminar" : "Error deleting");
    }
  };
  
  const handleReaction = async (commentId, emoji) => {
    try {
      await axios.post(
        `${API}/api/comments/${commentId}/react?emoji=${encodeURIComponent(emoji)}`,
        {},
        { withCredentials: true }
      );
      fetchComments();
    } catch (error) {
      console.error("Error adding reaction:", error);
    }
  };
  
  const formatTime = (dateStr) => {
    try {
      return formatDistanceToNow(new Date(dateStr), {
        addSuffix: true,
        locale: isEs ? es : undefined
      });
    } catch {
      return dateStr;
    }
  };
  
  const getInitials = (name, email) => {
    if (name) {
      return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    }
    return email?.[0]?.toUpperCase() || "?";
  };
  
  // Group comments by parent (for threading)
  const topLevelComments = comments.filter(c => !c.parent_comment_id);
  const getReplies = (commentId) => comments.filter(c => c.parent_comment_id === commentId);
  
  const renderComment = (comment, isReply = false) => {
    const isAuthor = comment.author_id === user?.user_id;
    const replies = getReplies(comment.comment_id);
    const isEditing = editingComment?.comment_id === comment.comment_id;
    
    return (
      <div 
        key={comment.comment_id} 
        className={`group ${isReply ? "ml-8 border-l-2 border-muted pl-4" : ""}`}
        data-testid={`comment-${comment.comment_id}`}
      >
        <div className="flex gap-3 py-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={comment.author_picture} />
            <AvatarFallback className="text-xs">
              {getInitials(comment.author_name, comment.author_email)}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">{comment.author_name}</span>
              <span className="text-xs text-muted-foreground">
                {formatTime(comment.created_at)}
              </span>
              {comment.is_edited && (
                <Badge variant="outline" className="text-[10px] h-4">
                  {isEs ? "editado" : "edited"}
                </Badge>
              )}
            </div>
            
            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  ref={textareaRef}
                  value={editContent}
                  onChange={(e) => handleTextChange(e, true)}
                  className="min-h-[60px] text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleEdit} disabled={sending}>
                    {sending && <KoraLoader size={12} className="mr-1" />}
                    <Check className="w-3 h-3 mr-1" />
                    {isEs ? "Guardar" : "Save"}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => { setEditingComment(null); setEditContent(""); }}
                  >
                    <X className="w-3 h-3 mr-1" />
                    {isEs ? "Cancelar" : "Cancel"}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm whitespace-pre-wrap break-words">
                  {/* Highlight mentions */}
                  {comment.content.split(/(@\S+)/g).map((part, i) => {
                    if (part.startsWith("@")) {
                      return (
                        <span key={i} className="text-primary font-medium bg-primary/10 px-1 rounded">
                          {part}
                        </span>
                      );
                    }
                    return part;
                  })}
                </p>
                
                {/* Reactions */}
                {Object.keys(comment.reactions || {}).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Object.entries(comment.reactions).map(([emoji, users]) => (
                      <button
                        key={emoji}
                        onClick={() => handleReaction(comment.comment_id, emoji)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                          users.includes(user?.user_id)
                            ? "bg-primary/10 border-primary/30"
                            : "bg-muted hover:bg-muted/80"
                        }`}
                      >
                        {emoji} {users.length}
                      </button>
                    ))}
                  </div>
                )}
                
                {/* Actions */}
                <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-xs"
                    onClick={() => setReplyingTo(comment)}
                  >
                    <Reply className="w-3 h-3 mr-1" />
                    {isEs ? "Responder" : "Reply"}
                  </Button>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 px-1">
                        <Smile className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="flex gap-1 p-1">
                      {REACTION_EMOJIS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => handleReaction(comment.comment_id, emoji)}
                          className="hover:bg-muted p-1 rounded"
                        >
                          {emoji}
                        </button>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  
                  {isAuthor && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 px-1">
                          <MoreVertical className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => {
                          setEditingComment(comment);
                          setEditContent(comment.content);
                        }}>
                          <Edit2 className="w-3 h-3 mr-2" />
                          {isEs ? "Editar" : "Edit"}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-red-600"
                          onClick={() => handleDelete(comment.comment_id)}
                        >
                          <Trash2 className="w-3 h-3 mr-2" />
                          {isEs ? "Eliminar" : "Delete"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Replies */}
        {replies.length > 0 && (
          <div className="space-y-0">
            {replies.map(reply => renderComment(reply, true))}
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className={`space-y-4 ${className}`} data-testid="comments-section">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm font-medium">
        <MessageSquare className="w-4 h-4" />
        {isEs ? "Comentarios" : "Comments"}
        {comments.length > 0 && (
          <Badge variant="secondary" className="h-5 px-1.5">
            {comments.length}
          </Badge>
        )}
      </div>
      
      {/* Reply indicator */}
      {replyingTo && (
        <div className="flex items-center gap-2 p-2 bg-muted rounded-lg text-sm">
          <Reply className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {isEs ? "Respondiendo a" : "Replying to"}{" "}
            <span className="font-medium text-foreground">{replyingTo.author_name}</span>
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="ml-auto h-6"
            onClick={() => setReplyingTo(null)}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}
      
      {/* New comment input */}
      <div className="relative">
        <div className="flex gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={user?.picture} />
            <AvatarFallback className="text-xs">
              {getInitials(user?.name, user?.email)}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 space-y-2">
            <Textarea
              ref={textareaRef}
              value={newComment}
              onChange={(e) => handleTextChange(e, false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleSubmit();
                }
              }}
              placeholder={isEs ? "Escribe un comentario... usa @ para mencionar" : "Write a comment... use @ to mention"}
              className="min-h-[60px] text-sm resize-none"
              data-testid="comment-input"
            />
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <AtSign className="w-3 h-3" />
                {isEs ? "Usa @ para mencionar personas" : "Use @ to mention people"}
              </div>
              <Button 
                size="sm" 
                onClick={handleSubmit} 
                disabled={sending || !newComment.trim()}
                data-testid="submit-comment-btn"
              >
                {sending ? (
                  <KoraLoader size={16} />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
        
        {/* Mentions dropdown */}
        {showMentions && mentionUsers.length > 0 && (
          <div 
            className="absolute z-50 mt-1 w-64 bg-popover border rounded-lg shadow-lg overflow-hidden"
            style={{ top: "100%", left: "44px" }}
          >
            <div className="p-1 max-h-48 overflow-y-auto">
              {mentionUsers.map(mentionUser => (
                <button
                  key={mentionUser.user_id}
                  onClick={() => insertMention(mentionUser)}
                  className="w-full flex items-center gap-2 p-2 hover:bg-muted rounded-md text-left"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={mentionUser.picture} />
                    <AvatarFallback className="text-xs">
                      {getInitials(mentionUser.name, mentionUser.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {mentionUser.name || mentionUser.email}
                    </p>
                    {mentionUser.name && (
                      <p className="text-xs text-muted-foreground truncate">
                        {mentionUser.email}
                      </p>
                    )}
                  </div>
                  {mentionUser.role && (
                    <Badge variant="outline" className="text-[10px]">
                      {mentionUser.role}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Comments list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <KoraLoader size={24} />
        </div>
      ) : topLevelComments.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">
            {isEs ? "No hay comentarios aún" : "No comments yet"}
          </p>
          <p className="text-xs mt-1">
            {isEs ? "Sé el primero en comentar" : "Be the first to comment"}
          </p>
        </div>
      ) : (
        <div className="divide-y">
          {topLevelComments.map(comment => renderComment(comment))}
        </div>
      )}
    </div>
  );
}

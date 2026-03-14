import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "../ui/button";
import { 
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, 
  Link2, Highlighter, CheckSquare, Paperclip, AtSign, Smile
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

const EMOJIS = ["😊", "👍", "🎉", "✅", "❌", "⭐", "🔥", "💡", "📞", "📧", "📅", "💰"];

export default function RichTextEditor({ 
  value, 
  onChange, 
  placeholder = "Escribe aquí...",
  minHeight = "120px",
  showAttachments = true 
}) {
  const editorRef = useRef(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const isInitialized = useRef(false);

  useEffect(() => {
    if (editorRef.current && !isInitialized.current && value) {
      editorRef.current.innerHTML = value;
      isInitialized.current = true;
    }
  }, [value]);

  useEffect(() => {
    if (!value && editorRef.current) {
      editorRef.current.innerHTML = '';
      isInitialized.current = false;
    }
  }, [value]);

  const execCommand = (command, val = null) => {
    document.execCommand(command, false, val);
    editorRef.current?.focus();
    if (onChange && editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleInput = useCallback(() => {
    if (onChange && editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const insertEmoji = (emoji) => {
    execCommand('insertText', emoji);
    setShowEmojiPicker(false);
  };

  const handleLink = () => {
    const url = prompt("URL del enlace:");
    if (url) {
      execCommand('createLink', url);
    }
  };

  const insertChecklist = () => {
    const editor = editorRef.current;
    if (!editor) return;
    
    const checklistHtml = '<div class="checklist-item" style="display:flex;align-items:flex-start;gap:6px;margin:4px 0;"><input type="checkbox" style="margin-top:3px;cursor:pointer;accent-color:#2563eb;" onclick="this.parentElement.classList.toggle(\'checked\')"/><span contenteditable="true" style="flex:1;">Tarea...</span></div>';
    document.execCommand('insertHTML', false, checklistHtml);
    editor.focus();
    if (onChange) onChange(editor.innerHTML);
  };

  const handleClick = useCallback((e) => {
    if (e.target.type === 'checkbox') {
      const item = e.target.closest('.checklist-item');
      if (item) {
        item.classList.toggle('checked');
        const span = item.querySelector('span');
        if (span) {
          span.style.textDecoration = e.target.checked ? 'line-through' : 'none';
          span.style.opacity = e.target.checked ? '0.6' : '1';
        }
      }
      if (onChange && editorRef.current) {
        setTimeout(() => onChange(editorRef.current.innerHTML), 0);
      }
    }
  }, [onChange]);

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 p-1.5 border-b bg-muted/30 flex-wrap">
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => execCommand('bold')} title="Negrita">
          <Bold className="w-3.5 h-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => execCommand('italic')} title="Cursiva">
          <Italic className="w-3.5 h-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => execCommand('underline')} title="Subrayado">
          <Underline className="w-3.5 h-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => execCommand('strikeThrough')} title="Tachado">
          <Strikethrough className="w-3.5 h-3.5" />
        </Button>
        
        <div className="w-px h-5 bg-border mx-1" />
        
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => execCommand('insertUnorderedList')} title="Lista">
          <List className="w-3.5 h-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => execCommand('insertOrderedList')} title="Lista numerada">
          <ListOrdered className="w-3.5 h-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={insertChecklist} title="Checklist">
          <CheckSquare className="w-3.5 h-3.5" />
        </Button>
        
        <div className="w-px h-5 bg-border mx-1" />
        
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleLink} title="Insertar enlace">
          <Link2 className="w-3.5 h-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => execCommand('hiliteColor', '#fef08a')} title="Resaltar">
          <Highlighter className="w-3.5 h-3.5" />
        </Button>

        {showAttachments && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            
            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-50" title="Adjuntar archivo (próximamente)" disabled>
              <Paperclip className="w-3.5 h-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-50" title="Mencionar (próximamente)" disabled>
              <AtSign className="w-3.5 h-3.5" />
            </Button>
            
            <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" title="Emoji">
                  <Smile className="w-3.5 h-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" align="start">
                <div className="grid grid-cols-6 gap-1">
                  {EMOJIS.map(emoji => (
                    <button key={emoji} type="button" className="w-7 h-7 text-lg hover:bg-muted rounded" onClick={() => insertEmoji(emoji)}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>

      {/* Editor Area */}
      <div
        ref={editorRef}
        contentEditable
        dir="ltr"
        className="p-3 outline-none prose prose-sm max-w-none text-left"
        style={{ minHeight, direction: 'ltr', unicodeBidi: 'plaintext' }}
        onInput={handleInput}
        onClick={handleClick}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />

      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        [contenteditable] ul, [contenteditable] ol {
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        [contenteditable] a {
          color: #2563eb;
          text-decoration: underline;
        }
        .checklist-item.checked span {
          text-decoration: line-through;
          opacity: 0.6;
        }
      `}</style>
    </div>
  );
}

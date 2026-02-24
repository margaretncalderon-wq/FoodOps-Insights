import { useState, useRef, useEffect } from "react";
import { Button } from "../ui/button";
import { 
  Bold, Italic, Underline, List, ListOrdered, 
  Link2, Highlighter, Paperclip, AtSign, Smile
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

  // Initialize content only once when component mounts or value changes externally
  useEffect(() => {
    if (editorRef.current && !isInitialized.current && value) {
      editorRef.current.innerHTML = value;
      isInitialized.current = true;
    }
  }, [value]);

  // Reset initialization flag when value is cleared
  useEffect(() => {
    if (!value && editorRef.current) {
      editorRef.current.innerHTML = '';
      isInitialized.current = false;
    }
  }, [value]);

  const execCommand = (command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    // Trigger onChange with the new content
    if (onChange && editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleInput = () => {
    if (onChange && editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

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

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 p-1.5 border-b bg-muted/30 flex-wrap">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => execCommand('bold')}
          title="Negrita"
        >
          <Bold className="w-3.5 h-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => execCommand('italic')}
          title="Cursiva"
        >
          <Italic className="w-3.5 h-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => execCommand('underline')}
          title="Subrayado"
        >
          <Underline className="w-3.5 h-3.5" />
        </Button>
        
        <div className="w-px h-5 bg-border mx-1" />
        
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => execCommand('insertUnorderedList')}
          title="Lista"
        >
          <List className="w-3.5 h-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => execCommand('insertOrderedList')}
          title="Lista numerada"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </Button>
        
        <div className="w-px h-5 bg-border mx-1" />
        
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={handleLink}
          title="Insertar enlace"
        >
          <Link2 className="w-3.5 h-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => execCommand('hiliteColor', '#fef08a')}
          title="Resaltar"
        >
          <Highlighter className="w-3.5 h-3.5" />
        </Button>

        {showAttachments && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 opacity-50"
              title="Adjuntar archivo (próximamente)"
              disabled
            >
              <Paperclip className="w-3.5 h-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 opacity-50"
              title="Mencionar (próximamente)"
              disabled
            >
              <AtSign className="w-3.5 h-3.5" />
            </Button>
            
            <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  title="Emoji"
                >
                  <Smile className="w-3.5 h-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" align="start">
                <div className="grid grid-cols-6 gap-1">
                  {EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      className="w-7 h-7 text-lg hover:bg-muted rounded"
                      onClick={() => insertEmoji(emoji)}
                    >
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
      `}</style>
    </div>
  );
}

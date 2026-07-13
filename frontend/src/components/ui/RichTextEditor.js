import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "../ui/button";
import { 
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, 
  Link2, Highlighter, CheckSquare, Paperclip, AtSign, Smile, Type, ChevronDown
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

const EMOJIS = ["😊", "👍", "🎉", "✅", "❌", "⭐", "🔥", "💡", "📞", "📧", "📅", "💰"];

const HIGHLIGHT_COLORS = [
  { color: "#fef08a", label: "Amarillo" },
  { color: "#bbf7d0", label: "Verde" },
  { color: "#bfdbfe", label: "Azul" },
  { color: "#fecaca", label: "Rojo" },
  { color: "#e9d5ff", label: "Morado" },
  { color: "#fed7aa", label: "Naranja" },
  { color: "#fce7f3", label: "Rosa" },
  { color: "#d1d5db", label: "Gris" },
  { color: "transparent", label: "Quitar" },
];

const TEXT_COLORS = [
  { color: "#000000", label: "Negro" },
  { color: "#dc2626", label: "Rojo" },
  { color: "#ea580c", label: "Naranja" },
  { color: "#ca8a04", label: "Amarillo" },
  { color: "#16a34a", label: "Verde" },
  { color: "#2563eb", label: "Azul" },
  { color: "#7c3aed", label: "Morado" },
  { color: "#db2777", label: "Rosa" },
  { color: "#6b7280", label: "Gris" },
  { color: "remove", label: "Quitar" },
];

const FONT_SIZES = [
  { px: 12, label: "XS" },
  { px: 14, label: "S" },
  { px: 16, label: "M" },
  { px: 18, label: "L" },
  { px: 22, label: "XL" },
  { px: 28, label: "2XL" },
  { px: 36, label: "3XL" },
];

export default function RichTextEditor({ 
  value, 
  onChange, 
  placeholder = "Escribe aquí...",
  minHeight = "120px",
  showAttachments = true 
}) {
  const editorRef = useRef(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const [showFontSizePicker, setShowFontSizePicker] = useState(false);
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

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      
      // Let the browser handle Enter natively inside lists
      const node = sel.anchorNode;
      const parent = node?.nodeType === 3 ? node.parentElement : node;
      if (parent?.closest('ul') || parent?.closest('ol') || parent?.closest('.checklist-item')) {
        return;
      }
      
      e.preventDefault();
      // Insert a <br> + zero-width space so the cursor moves down
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const br = document.createElement('br');
      range.insertNode(br);
      // Add a second <br> if we're at the end (ensures visible new line)
      if (!br.nextSibling || (br.nextSibling.nodeType === 3 && br.nextSibling.textContent === '')) {
        const br2 = document.createElement('br');
        br.parentNode.insertBefore(br2, br.nextSibling);
      }
      // Move cursor after the <br>
      range.setStartAfter(br);
      range.setEndAfter(br);
      sel.removeAllRanges();
      sel.addRange(range);
      
      if (onChange && editorRef.current) {
        onChange(editorRef.current.innerHTML);
      }
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

  const applyHighlight = (color) => {
    if (color === 'transparent') {
      execCommand('removeFormat');
    } else {
      execCommand('hiliteColor', color);
    }
    setShowHighlightPicker(false);
  };

  const applyTextColor = (color) => {
    if (color === 'remove') {
      execCommand('removeFormat');
    } else {
      execCommand('foreColor', color);
    }
    setShowTextColorPicker(false);
  };

  // Wraps the current selection (or caret position) with a `<span style="font-size: Xpx">`
  // so users can pick an exact px value from the toolbar. Works for both:
  //  - a real selection → wraps the extracted contents
  //  - collapsed caret   → inserts an empty span with a zero-width space so
  //                         subsequent typing inherits the chosen size.
  const applyFontSize = (px) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      setShowFontSizePicker(false);
      return;
    }
    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.style.fontSize = `${px}px`;
    if (range.collapsed) {
      span.appendChild(document.createTextNode('\u200B'));
      range.insertNode(span);
      range.setStart(span.firstChild, 1);
      range.setEnd(span.firstChild, 1);
    } else {
      try {
        range.surroundContents(span);
      } catch (_e) {
        // Selection crosses element boundaries — fall back to extract + wrap
        const contents = range.extractContents();
        span.appendChild(contents);
        range.insertNode(span);
      }
    }
    sel.removeAllRanges();
    sel.addRange(range);
    if (onChange) onChange(editor.innerHTML);
    setShowFontSizePicker(false);
  };

  const insertChecklist = () => {
    const editor = editorRef.current;
    if (!editor) return;
    
    const checklistHtml = '<div class="checklist-item"><input type="checkbox" /><span contenteditable="true">Tarea...</span></div>';
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
    <div className="rte-wrapper border rounded-lg overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 p-1.5 border-b bg-muted/30 flex-wrap">
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => execCommand('bold')} title="Negrita" data-testid="rte-bold">
          <Bold className="w-3.5 h-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => execCommand('italic')} title="Cursiva" data-testid="rte-italic">
          <Italic className="w-3.5 h-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => execCommand('underline')} title="Subrayado" data-testid="rte-underline">
          <Underline className="w-3.5 h-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => execCommand('strikeThrough')} title="Tachado" data-testid="rte-strikethrough">
          <Strikethrough className="w-3.5 h-3.5" />
        </Button>
        
        <div className="w-px h-5 bg-border mx-1" />
        
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => execCommand('insertUnorderedList')} title="Lista" data-testid="rte-ul">
          <List className="w-3.5 h-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => execCommand('insertOrderedList')} title="Lista numerada" data-testid="rte-ol">
          <ListOrdered className="w-3.5 h-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={insertChecklist} title="Checklist" data-testid="rte-checklist">
          <CheckSquare className="w-3.5 h-3.5" />
        </Button>
        
        <div className="w-px h-5 bg-border mx-1" />
        
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleLink} title="Insertar enlace" data-testid="rte-link">
          <Link2 className="w-3.5 h-3.5" />
        </Button>
        
        <Popover open={showHighlightPicker} onOpenChange={setShowHighlightPicker}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" title="Resaltar" data-testid="rte-highlight">
              <Highlighter className="w-3.5 h-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start" side="bottom">
            <div className="grid grid-cols-3 gap-1.5">
              {HIGHLIGHT_COLORS.map(hc => (
                <button
                  key={hc.color}
                  type="button"
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:bg-muted/60 transition-colors"
                  onClick={() => applyHighlight(hc.color)}
                  data-testid={`rte-highlight-${hc.label.toLowerCase()}`}
                >
                  <span 
                    className="w-4 h-4 rounded-sm border border-border/60 shrink-0" 
                    style={{ backgroundColor: hc.color === 'transparent' ? '#fff' : hc.color }} 
                  />
                  <span>{hc.label}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Popover open={showTextColorPicker} onOpenChange={setShowTextColorPicker}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" title="Color de texto" data-testid="rte-text-color">
              <Type className="w-3.5 h-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start" side="bottom">
            <p className="text-xs font-medium text-muted-foreground mb-1.5 px-1">Color de texto</p>
            <div className="grid grid-cols-5 gap-1.5">
              {TEXT_COLORS.map(tc => (
                <button
                  key={tc.color}
                  type="button"
                  className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded text-xs hover:bg-muted/60 transition-colors"
                  onClick={() => applyTextColor(tc.color)}
                  data-testid={`rte-textcolor-${tc.label.toLowerCase()}`}
                >
                  <span 
                    className="w-5 h-5 rounded-full border border-border/60 shrink-0 flex items-center justify-center text-[10px] font-bold" 
                    style={{ 
                      color: tc.color === 'remove' ? '#6b7280' : tc.color,
                      backgroundColor: tc.color === 'remove' ? '#f3f4f6' : `${tc.color}15`
                    }} 
                  >
                    {tc.color === 'remove' ? '✕' : 'A'}
                  </span>
                  <span className="text-[10px] leading-none">{tc.label}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Font size picker */}
        <Popover open={showFontSizePicker} onOpenChange={setShowFontSizePicker}>
          <PopoverTrigger asChild>
            <Button
              type="button" variant="ghost" size="sm"
              className="h-7 px-1.5 gap-0.5"
              title="Tamaño de letra"
              data-testid="rte-font-size"
            >
              <span className="text-[10px] font-semibold leading-none">A</span>
              <span className="text-[13px] font-semibold leading-none">A</span>
              <ChevronDown className="w-2.5 h-2.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-1" align="start" side="bottom">
            <p className="text-[10px] font-medium text-muted-foreground mb-1 px-2 pt-1">Tamaño</p>
            <div className="flex flex-col min-w-[110px]">
              {FONT_SIZES.map(fs => (
                <button
                  key={fs.px}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFontSize(fs.px)}
                  data-testid={`rte-font-size-${fs.px}`}
                  className="flex items-baseline justify-between gap-3 px-2 py-1 rounded hover:bg-muted/60 text-left"
                >
                  <span style={{ fontSize: `${Math.min(fs.px, 22)}px` }}>{fs.label}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{fs.px}px</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

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
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" title="Emoji" data-testid="rte-emoji">
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
        className="rte-editor p-3 outline-none text-sm"
        style={{ minHeight, direction: 'ltr', textAlign: 'left' }}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        data-placeholder={placeholder}
        data-testid="rte-content-area"
        suppressContentEditableWarning
      />

      <style>{`
        .rte-editor:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
          display: block;
        }
        .rte-editor {
          line-height: 1.6;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .rte-editor ul {
          list-style-type: disc !important;
          padding-left: 1.5rem !important;
          margin: 0.4rem 0 !important;
        }
        .rte-editor ol {
          list-style-type: decimal !important;
          padding-left: 1.5rem !important;
          margin: 0.4rem 0 !important;
        }
        .rte-editor li {
          display: list-item !important;
          margin: 0.15rem 0;
        }
        .rte-editor a {
          color: #2563eb;
          text-decoration: underline;
        }
        .rte-editor .checklist-item {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          margin: 4px 0;
        }
        .rte-editor .checklist-item input[type="checkbox"] {
          margin-top: 3px;
          cursor: pointer;
          accent-color: #2563eb;
        }
        .rte-editor .checklist-item span {
          flex: 1;
        }
        .rte-editor .checklist-item.checked span {
          text-decoration: line-through;
          opacity: 0.6;
        }
      `}</style>
    </div>
  );
}

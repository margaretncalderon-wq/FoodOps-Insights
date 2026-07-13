// components/VisualLayoutEditor.js - Visual Layout Diagram for Room Setup
import { useState, useRef } from "react";
import axios from "axios";
import { API } from "../utils/api";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Image, Upload, Trash2, ZoomIn, ZoomOut, Maximize2, X, FileImage } from "lucide-react";
import { KoraLoader } from "./KoraLoader";
import { toast } from "sonner";

// Layout type visual representations (simple SVG icons)
const LAYOUT_VISUALS = {
  theater: (
    <svg viewBox="0 0 100 80" className="w-full h-full">
      {/* Stage */}
      <rect x="10" y="5" width="80" height="15" rx="2" fill="#3A4D3F" />
      <text x="50" y="14" textAnchor="middle" fill="white" fontSize="8">ESCENARIO</text>
      {/* Rows */}
      {[0, 1, 2, 3].map((row) => (
        <g key={row}>
          {[0, 1, 2, 3, 4, 5, 6].map((col) => (
            <rect
              key={col}
              x={15 + col * 11}
              y={28 + row * 13}
              width="8"
              height="8"
              rx="1"
              fill="#94a3b8"
            />
          ))}
        </g>
      ))}
    </svg>
  ),
  banquet: (
    <svg viewBox="0 0 100 80" className="w-full h-full">
      {/* Round tables */}
      {[
        { x: 25, y: 20 }, { x: 50, y: 20 }, { x: 75, y: 20 },
        { x: 25, y: 50 }, { x: 50, y: 50 }, { x: 75, y: 50 },
      ].map((pos, i) => (
        <g key={i}>
          <circle cx={pos.x} cy={pos.y} r="12" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" />
          {[0, 1, 2, 3, 4, 5].map((seat) => {
            const angle = (seat * 60 - 90) * (Math.PI / 180);
            return (
              <circle
                key={seat}
                cx={pos.x + Math.cos(angle) * 12}
                cy={pos.y + Math.sin(angle) * 12}
                r="3"
                fill="#3A4D3F"
              />
            );
          })}
        </g>
      ))}
    </svg>
  ),
  cocktail: (
    <svg viewBox="0 0 100 80" className="w-full h-full">
      {/* High tables */}
      {[
        { x: 20, y: 25 }, { x: 50, y: 20 }, { x: 80, y: 25 },
        { x: 35, y: 55 }, { x: 65, y: 55 },
      ].map((pos, i) => (
        <g key={i}>
          <circle cx={pos.x} cy={pos.y} r="6" fill="#3A4D3F" />
          <line x1={pos.x} y1={pos.y + 6} x2={pos.x} y2={pos.y + 15} stroke="#3A4D3F" strokeWidth="2" />
        </g>
      ))}
      {/* Scattered people icons */}
      {[
        { x: 25, y: 40 }, { x: 45, y: 35 }, { x: 70, y: 40 },
        { x: 30, y: 65 }, { x: 55, y: 70 }, { x: 75, y: 65 },
      ].map((pos, i) => (
        <circle key={i} cx={pos.x} cy={pos.y} r="3" fill="#94a3b8" />
      ))}
    </svg>
  ),
  classroom: (
    <svg viewBox="0 0 100 80" className="w-full h-full">
      {/* Instructor area */}
      <rect x="35" y="5" width="30" height="10" rx="1" fill="#3A4D3F" />
      {/* Desks */}
      {[0, 1, 2, 3].map((row) => (
        <g key={row}>
          {[0, 1, 2].map((col) => (
            <g key={col}>
              <rect x={15 + col * 28} y={25 + row * 14} width="22" height="6" rx="1" fill="#e2e8f0" stroke="#94a3b8" />
              <circle cx={20 + col * 28} cy={33 + row * 14} r="3" fill="#94a3b8" />
              <circle cx={32 + col * 28} cy={33 + row * 14} r="3" fill="#94a3b8" />
            </g>
          ))}
        </g>
      ))}
    </svg>
  ),
  u_shape: (
    <svg viewBox="0 0 100 80" className="w-full h-full">
      {/* U-shape table */}
      <path
        d="M 15 15 L 15 65 L 85 65 L 85 15 L 70 15 L 70 50 L 30 50 L 30 15 Z"
        fill="none"
        stroke="#94a3b8"
        strokeWidth="8"
      />
      {/* Seats on outside */}
      {[20, 35, 50, 65, 80].map((x) => (
        <circle key={x} cx={x} cy={73} r="3" fill="#3A4D3F" />
      ))}
      {[25, 40, 55].map((y) => (
        <g key={y}>
          <circle cx={7} cy={y} r="3" fill="#3A4D3F" />
          <circle cx={93} cy={y} r="3" fill="#3A4D3F" />
        </g>
      ))}
    </svg>
  ),
  conference: (
    <svg viewBox="0 0 100 80" className="w-full h-full">
      {/* Long table */}
      <rect x="15" y="25" width="70" height="30" rx="3" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2" />
      {/* Seats */}
      {[25, 40, 55, 70].map((x) => (
        <g key={x}>
          <circle cx={x} cy={18} r="4" fill="#3A4D3F" />
          <circle cx={x} cy={62} r="4" fill="#3A4D3F" />
        </g>
      ))}
    </svg>
  ),
  hollow_square: (
    <svg viewBox="0 0 100 80" className="w-full h-full">
      {/* Square tables */}
      <rect x="20" y="15" width="60" height="50" fill="none" stroke="#94a3b8" strokeWidth="8" />
      {/* Seats on outside */}
      {[30, 50, 70].map((x) => (
        <g key={x}>
          <circle cx={x} cy={8} r="3" fill="#3A4D3F" />
          <circle cx={x} cy={72} r="3" fill="#3A4D3F" />
        </g>
      ))}
      {[25, 40, 55].map((y) => (
        <g key={y}>
          <circle cx={12} cy={y} r="3" fill="#3A4D3F" />
          <circle cx={88} cy={y} r="3" fill="#3A4D3F" />
        </g>
      ))}
    </svg>
  ),
  custom: (
    <svg viewBox="0 0 100 80" className="w-full h-full">
      <text x="50" y="45" textAnchor="middle" fill="#94a3b8" fontSize="12">Custom</text>
    </svg>
  ),
};

export function LayoutPreview({ layoutType, diagramUrl, className = "" }) {
  const [fullscreen, setFullscreen] = useState(false);

  if (diagramUrl) {
    return (
      <>
        <div 
          className={`relative cursor-pointer group ${className}`}
          onClick={() => setFullscreen(true)}
        >
          <img 
            src={diagramUrl} 
            alt="Layout diagram" 
            className="w-full h-full object-contain rounded-lg"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
            <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
          </div>
        </div>

        {/* Fullscreen Modal */}
        <Dialog open={fullscreen} onOpenChange={setFullscreen}>
          <DialogContent className="max-w-4xl">
            <img 
              src={diagramUrl} 
              alt="Layout diagram" 
              className="w-full h-auto max-h-[80vh] object-contain"
            />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Show SVG representation
  return (
    <div className={`bg-gray-50 dark:bg-gray-800 rounded-lg p-4 ${className}`}>
      {LAYOUT_VISUALS[layoutType] || LAYOUT_VISUALS.custom}
    </div>
  );
}

export default function VisualLayoutEditor({ 
  eventId, 
  roomId, 
  templateId,
  currentDiagramUrl, 
  layoutType = "banquet",
  token,
  onUpdate,
  readOnly = false 
}) {
  const { isEs } = useLanguage();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(currentDiagramUrl);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error(isEs ? "Solo se permiten imágenes" : "Only images allowed");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error(isEs ? "La imagen no debe superar 5MB" : "Image must be under 5MB");
      return;
    }

    try {
      setUploading(true);

      // Convert to base64 for preview and storage
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Url = event.target.result;
        setPreviewUrl(base64Url);

        // Upload to server
        let endpoint;
        if (templateId) {
          endpoint = `${API}/orchestration/room-setup/templates/${templateId}/layout-diagram`;
        } else if (eventId && roomId) {
          endpoint = `${API}/orchestration/room-setup/events/${eventId}/rooms/${roomId}/layout-diagram`;
        } else {
          toast.error(isEs ? "Error de configuración" : "Configuration error");
          return;
        }

        try {
          await axios.post(endpoint, { diagram_url: base64Url }, {
            headers: { Authorization: `Bearer ${token}` },
          });
          
          toast.success(isEs ? "Diagrama actualizado" : "Diagram updated");
          if (onUpdate) onUpdate(base64Url);
          setDialogOpen(false);
        } catch (error) {
          toast.error(isEs ? "Error al guardar" : "Error saving");
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error(isEs ? "Error al procesar imagen" : "Error processing image");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm(isEs ? "¿Eliminar diagrama?" : "Remove diagram?")) return;

    try {
      if (eventId && roomId) {
        await axios.delete(
          `${API}/orchestration/room-setup/events/${eventId}/rooms/${roomId}/layout-diagram`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      
      setPreviewUrl(null);
      if (onUpdate) onUpdate(null);
      toast.success(isEs ? "Diagrama eliminado" : "Diagram removed");
    } catch (error) {
      toast.error(isEs ? "Error al eliminar" : "Error removing");
    }
  };

  return (
    <div data-testid="visual-layout-editor">
      {/* Preview */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="aspect-video relative bg-gray-100 dark:bg-gray-800">
            <LayoutPreview 
              layoutType={layoutType} 
              diagramUrl={previewUrl} 
              className="w-full h-full"
            />
            
            {/* Overlay buttons */}
            {!readOnly && (
              <div className="absolute top-2 right-2 flex gap-1">
                {previewUrl && (
                  <Button 
                    size="sm" 
                    variant="secondary" 
                    className="h-8 bg-white/90 hover:bg-white"
                    onClick={handleRemove}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                )}
                <Button 
                  size="sm" 
                  variant="secondary" 
                  className="h-8 bg-white/90 hover:bg-white"
                  onClick={() => setDialogOpen(true)}
                >
                  {previewUrl ? <Image className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                  <span className="ml-1 text-xs">
                    {previewUrl 
                      ? (isEs ? "Cambiar" : "Change") 
                      : (isEs ? "Subir" : "Upload")
                    }
                  </span>
                </Button>
              </div>
            )}

            {/* Layout type badge */}
            <div className="absolute bottom-2 left-2">
              <Badge variant="secondary" className="bg-white/90 text-xs">
                {layoutType.replace("_", " ").toUpperCase()}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileImage className="w-5 h-5 text-[#3A4D3F]" />
              {isEs ? "Subir Diagrama de Layout" : "Upload Layout Diagram"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isEs 
                ? "Sube una imagen del plano o diagrama de distribución del salón. Formatos: JPG, PNG, WebP. Máximo 5MB."
                : "Upload a floor plan or room layout diagram. Formats: JPG, PNG, WebP. Max 5MB."
              }
            </p>

            {/* Current preview */}
            {previewUrl && (
              <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden">
                <img src={previewUrl} alt="Current" className="w-full h-full object-contain" />
              </div>
            )}

            {/* Upload area */}
            <div 
              className="border-2 border-dashed rounded-lg p-8 text-center hover:bg-muted/30 cursor-pointer transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <KoraLoader size={32} className="mx-auto mb-2" />
              ) : (
                <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              )}
              <p className="text-sm text-muted-foreground">
                {uploading
                  ? (isEs ? "Subiendo..." : "Uploading...")
                  : (isEs ? "Click para seleccionar imagen" : "Click to select image")
                }
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

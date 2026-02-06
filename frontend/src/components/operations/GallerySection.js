import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent } from "../ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Image, Loader2 } from "lucide-react";

import { API_BASE as API } from "../../utils/api";

export function GallerySection() {
  const { language } = useLanguage();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selectedImage, setSelectedImage] = useState(null);

  const isEs = language === "es";

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      const res = await axios.get(`${API}/api/inventory/operations`, { withCredentials: true });
      // Filter only items with images
      const itemsWithImages = (res.data || []).filter(item => item.image_url);
      setItems(itemsWithImages);
    } catch (error) {
      console.error("Error fetching items:", error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = filter === "all" 
    ? items 
    : items.filter(item => item.inventory_type === filter);

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">{isEs ? "Galería de Activos" : "Asset Gallery"}</h3>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
            <SelectItem value="equipment">{isEs ? "Equipos" : "Equipment"}</SelectItem>
            <SelectItem value="disposable">{isEs ? "Desechables" : "Disposables"}</SelectItem>
            <SelectItem value="event_supply">{isEs ? "Suministros" : "Event Supplies"}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Image className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{isEs ? "No hay imágenes de activos" : "No asset images"}</p>
            <p className="text-sm mt-2">{isEs ? "Agrega fotos desde el inventario" : "Add photos from inventory"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredItems.map(item => (
            <div 
              key={item.ingredient_id} 
              className="group relative aspect-square rounded-lg overflow-hidden border cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setSelectedImage(item)}
            >
              <img 
                src={item.image_url} 
                alt={item.name} 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                <p className="text-white text-sm font-medium truncate">{item.name}</p>
                <p className="text-white/70 text-xs">{item.stock_quantity} {item.unit}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image Modal */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-2xl">
          {selectedImage && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedImage.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <img 
                  src={selectedImage.image_url} 
                  alt={selectedImage.name} 
                  className="w-full max-h-[400px] object-contain rounded-lg"
                />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">{isEs ? "Tipo:" : "Type:"}</span>
                    <span className="ml-2 font-medium">{selectedImage.inventory_type}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{isEs ? "Categoría:" : "Category:"}</span>
                    <span className="ml-2 font-medium">{selectedImage.category}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{isEs ? "Cantidad:" : "Quantity:"}</span>
                    <span className="ml-2 font-medium">{selectedImage.stock_quantity} {selectedImage.unit}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{isEs ? "Costo:" : "Cost:"}</span>
                    <span className="ml-2 font-medium">${(selectedImage.cost_per_unit || 0).toFixed(2)}</span>
                  </div>
                </div>
                {selectedImage.notes && (
                  <div className="border-t pt-3">
                    <span className="text-muted-foreground text-sm">{isEs ? "Notas:" : "Notes:"}</span>
                    <p className="mt-1">{selectedImage.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

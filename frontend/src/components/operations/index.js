// Operations Components Index
export { InventorySection } from "./InventorySection";
export { PurchasingSection } from "./PurchasingSection";
export { CheckInOutSection } from "./CheckInOutSection";
export { AssetCountSection } from "./AssetCountSection";
export { AgreementsSection } from "./AgreementsSection";
export { GallerySection } from "./GallerySection";

// Constants used across operations components
export const OPS_SUPPLY_TYPES = [
  { value: "equipment", label: "Equipment", labelEs: "Equipo" },
  { value: "disposable", label: "Disposables", labelEs: "Desechables" },
  { value: "event_supply", label: "Event Supplies", labelEs: "Suministros de Evento" },
];

export const DEFAULT_CATEGORIES = [
  { value: "tables_chairs", label: "Tables & Chairs", labelEs: "Mesas y Sillas" },
  { value: "linens", label: "Linens", labelEs: "Mantelería" },
  { value: "serving", label: "Serving Equipment", labelEs: "Equipo de Servicio" },
  { value: "kitchen", label: "Kitchen Equipment", labelEs: "Equipo de Cocina" },
  { value: "decor", label: "Decor", labelEs: "Decoración" },
  { value: "disposables", label: "Disposables", labelEs: "Desechables" },
  { value: "cleaning", label: "Cleaning", labelEs: "Limpieza" },
  { value: "packaging", label: "Packaging", labelEs: "Empaque" },
  { value: "transport", label: "Transport", labelEs: "Transporte" },
  { value: "audiovisual", label: "Audio/Visual", labelEs: "Audio/Visual" },
  { value: "other", label: "Other", labelEs: "Otros" },
];

export const COST_CENTERS = [
  { value: "operations", label: "Operations", labelEs: "Operaciones" },
  { value: "kitchen", label: "Kitchen", labelEs: "Cocina" },
  { value: "service", label: "Service", labelEs: "Servicio" },
  { value: "logistics", label: "Logistics", labelEs: "Logística" },
  { value: "admin", label: "Administration", labelEs: "Administración" },
  { value: "other", label: "Other", labelEs: "Otros" },
];

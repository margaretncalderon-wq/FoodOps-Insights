import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { toast } from "sonner";
import { 
  Package, Plus, Edit, Trash2, Search, AlertTriangle, ShoppingCart,
  History, Upload, DollarSign, Archive, Clock, Loader2
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

// Operations Supplies types
const OPS_SUPPLY_TYPES = [
  { value: "equipment", label: "Equipment", labelEs: "Equipo" },
  { value: "disposable", label: "Disposables", labelEs: "Desechables" },
  { value: "event_supply", label: "Event Supplies", labelEs: "Suministros de Evento" },
];

// Default categories
const DEFAULT_CATEGORIES = [
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

// Cost Centers
const COST_CENTERS = [
  { value: "operations", label: "Operations", labelEs: "Operaciones" },
  { value: "kitchen", label: "Kitchen", labelEs: "Cocina" },
  { value: "service", label: "Service", labelEs: "Servicio" },
  { value: "logistics", label: "Logistics", labelEs: "Logística" },
  { value: "admin", label: "Administration", labelEs: "Administración" },
  { value: "other", label: "Other", labelEs: "Otros" },
];


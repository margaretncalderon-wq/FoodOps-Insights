import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useLanguage } from "../contexts/LanguageContext";
import { API_BASE as API } from "../utils/api";
import {
  Activity, Puzzle, Target, Briefcase, Megaphone, ClipboardList,
  UtensilsCrossed, Package, Building2, Users, Calendar,
  ArrowRight, Check, Globe, Sparkles, MapPin, Mic2, Zap, Star,
  TrendingUp, ChevronRight, Quote, Loader2,
} from "lucide-react";

// =============================================================
// MODULES (same order as in-app sidebar: general → specific)
// Each module gets a realistic mock visual rendered in the right panel.
// =============================================================
const moduleHighlights = [
  {
    id: "system_pulse",
    icon: Activity,
    accent: "#AED768",
    title: "System Pulse",
    titleEs: "System Pulse",
    subtitle: "Real-time command center",
    subtitleEs: "Centro de mando en tiempo real",
    description: "One screen to see everything: revenue, pipeline, events of the week and team activity.",
    descriptionEs: "Una sola vista para ver todo: facturación, pipeline, eventos de la semana y actividad del equipo.",
    features: [
      { en: "Live KPIs across all modules", es: "KPIs en vivo de todos los módulos" },
      { en: "Today's events & follow-ups", es: "Eventos y follow-ups del día" },
      { en: "Cash position & receivables", es: "Caja y cuentas por cobrar" },
      { en: "Team presence & approvals", es: "Presencia del equipo y aprobaciones" },
    ],
    mockType: "dashboard",
  },
  {
    id: "client_engagement",
    icon: Puzzle,
    accent: "#3B82F6",
    title: "Client Engagement",
    titleEs: "Client Engagement",
    subtitle: "CRM, pipeline & client portal",
    subtitleEs: "CRM, pipeline y portal de clientes",
    description: "Capture leads, track conversion and centralize every client conversation.",
    descriptionEs: "Captura leads, mide conversión y centraliza cada conversación con tus clientes.",
    features: [
      { en: "Visual pipeline with stages", es: "Pipeline visual con etapas" },
      { en: "Proposals, contracts & e-sign", es: "Propuestas, contratos y firma digital" },
      { en: "Client portal with documents", es: "Portal de clientes con documentos" },
      { en: "Lead source attribution", es: "Atribución de leads por fuente" },
    ],
    mockType: "crm",
  },
  {
    id: "execution_hub",
    icon: Target,
    accent: "#8B5CF6",
    title: "Execution Hub",
    titleEs: "Execution Hub",
    subtitle: "Goals, projects & deliverables",
    subtitleEs: "Metas, proyectos y entregables",
    description: "Translate strategy into goals, milestones and tasks the whole team can see.",
    descriptionEs: "Convierte la estrategia en metas, hitos y tareas que todo el equipo ve.",
    features: [
      { en: "OKRs with progress tracking", es: "OKRs con tracking de progreso" },
      { en: "Project timelines & milestones", es: "Timelines y hitos de proyectos" },
      { en: "Task management & ownership", es: "Gestión de tareas y responsables" },
      { en: "Team & client deliverables", es: "Entregables internos y al cliente" },
    ],
    mockType: "goals",
  },
  {
    id: "business_clarity",
    icon: Briefcase,
    accent: "#10B981",
    title: "Business Clarity",
    titleEs: "Business Clarity",
    subtitle: "Finance & executive view",
    subtitleEs: "Finanzas y visión ejecutiva",
    description: "Invoices, payments, cash flow and the financial signals you need to decide.",
    descriptionEs: "Facturas, pagos, flujo de caja y las señales financieras para decidir bien.",
    features: [
      { en: "Invoicing & receivables", es: "Facturación y cuentas por cobrar" },
      { en: "Cash flow & period close", es: "Flujo de caja y cierre de período" },
      { en: "Cost-center budgets", es: "Presupuestos por centro de costo" },
      { en: "Profit signals & alerts", es: "Alertas de rentabilidad" },
    ],
    mockType: "finance",
  },
  {
    id: "demand_studio",
    icon: Megaphone,
    accent: "#EC4899",
    title: "Demand Generation",
    titleEs: "Demand Generation",
    subtitle: "Marketing, content & growth",
    subtitleEs: "Marketing, contenido y crecimiento",
    description: "Plan campaigns, schedule posts, preview your feed and tie spend to revenue.",
    descriptionEs: "Planifica campañas, programa posts, previsualiza tu feed y une gasto con ingresos.",
    features: [
      { en: "Editorial calendar (day/week/month)", es: "Calendario editorial (día/semana/mes)" },
      { en: "Instagram-style feed preview", es: "Preview de feed estilo Instagram" },
      { en: "Campaign ROI & lead attribution", es: "ROI de campaña y atribución de leads" },
      { en: "Story series & multi-day posts", es: "Series de historias y posts multi-día" },
    ],
    mockType: "studio",
  },
  {
    id: "event_orchestration",
    icon: ClipboardList,
    accent: "#F97316",
    title: "Event Orchestration",
    titleEs: "Event Orchestration",
    subtitle: "Events, run-of-show & venues",
    subtitleEs: "Eventos, run of show y venues",
    description: "From the brief to the run-of-show: blueprints, timelines, suppliers and production docs.",
    descriptionEs: "Del brief al run of show: plantillas, timelines, proveedores y documentos de producción.",
    features: [
      { en: "Reusable event blueprints", es: "Plantillas reusables de evento" },
      { en: "Run of show timeline", es: "Timeline run of show" },
      { en: "Suppliers, BEO & rentals", es: "Proveedores, BEO y rentas" },
      { en: "Client-facing event portal", es: "Portal de evento para el cliente" },
    ],
    mockType: "event",
  },
  {
    id: "culinary_intelligence",
    icon: UtensilsCrossed,
    accent: "#D97706",
    title: "Culinary Intelligence",
    titleEs: "Inteligencia Culinaria",
    subtitle: "Recipes, costing & production",
    subtitleEs: "Recetas, costeo y producción",
    description: "Real recipe costing, plated menus, production planning and supplier orders.",
    descriptionEs: "Costeo real de recetas, menús emplatados, planificación de producción y órdenes a proveedores.",
    features: [
      { en: "Recipe costing & margins", es: "Costeo de recetas y márgenes" },
      { en: "Plated menu builder", es: "Constructor de menú emplatado" },
      { en: "Production planning by event", es: "Planificación de producción por evento" },
      { en: "Vendor purchase orders", es: "Órdenes de compra a proveedores" },
    ],
    mockType: "culinary",
  },
  {
    id: "resource_management",
    icon: Package,
    accent: "#64748B",
    title: "Resource Management",
    titleEs: "Gestión de Recursos",
    subtitle: "Inventory, equipment & schedules",
    subtitleEs: "Inventario, equipos y programación",
    description: "Track every resource: inventory, equipment, availability and maintenance.",
    descriptionEs: "Controla cada recurso: inventario, equipos, disponibilidad y mantenimiento.",
    features: [
      { en: "Inventory & stock movements", es: "Inventario y movimientos de stock" },
      { en: "Equipment tracking & QR codes", es: "Tracking de equipos y códigos QR" },
      { en: "Resource scheduling", es: "Programación de recursos" },
      { en: "Maintenance reminders", es: "Recordatorios de mantenimiento" },
    ],
    mockType: "resources",
  },
  {
    id: "venues",
    icon: Building2,
    accent: "#0EA5E9",
    title: "Venues & Locations",
    titleEs: "Venues y Locaciones",
    subtitle: "Spaces, rooms & layouts",
    subtitleEs: "Espacios, salones y layouts",
    description: "Manage venues, rooms, capacities, room setups and availability.",
    descriptionEs: "Gestiona venues, salones, capacidades, montajes y disponibilidad.",
    features: [
      { en: "Venue & room library", es: "Librería de venues y salones" },
      { en: "Room setup templates", es: "Plantillas de room setup" },
      { en: "Capacity & seating charts", es: "Capacidad y diagramas de mesas" },
      { en: "Availability calendar", es: "Calendario de disponibilidad" },
    ],
    mockType: "venues",
  },
  {
    id: "people_ops",
    icon: Users,
    accent: "#06B6D4",
    title: "People Ops",
    titleEs: "People Ops",
    subtitle: "Team, payroll & culture",
    subtitleEs: "Equipo, nómina y cultura",
    description: "Onboard, schedule and pay your team — and keep them in the loop.",
    descriptionEs: "Incorpora, programa y paga a tu equipo — y mantenlo informado.",
    features: [
      { en: "Team directory & roles", es: "Directorio y roles del equipo" },
      { en: "Shifts & timesheets", es: "Turnos y hojas de horas" },
      { en: "Payroll preparation", es: "Preparación de nómina" },
      { en: "Internal announcements", es: "Anuncios internos" },
    ],
    mockType: "team",
  },
];

// =============================================================
// DIFFERENTIATORS (replaces vanity stats)
// =============================================================
const differentiators = [
  {
    icon: Zap,
    en: "Built by operators, for operators",
    es: "Hecho por operadores, para operadores",
    descEn: "Born inside a real agency. Every module solves a problem we lived.",
    descEs: "Nacido dentro de una agencia real. Cada módulo resuelve un problema que vivimos.",
  },
  {
    icon: Puzzle,
    en: "One platform, every department",
    es: "Una plataforma, todos los departamentos",
    descEn: "Sales, ops, finance, marketing — connected, not glued together.",
    descEs: "Ventas, ops, finanzas, marketing — conectados, no pegados con cinta.",
  },
  {
    icon: Globe,
    en: "Designed for LATAM creative industries",
    es: "Diseñado para industrias creativas LATAM",
    descEn: "Bilingual, multi-currency, local tax (ITBIS) and event-first workflows.",
    descEs: "Bilingüe, multi-moneda, impuestos locales (ITBIS) y flujos pensados para eventos.",
  },
  {
    icon: TrendingUp,
    en: "Clarity over chaos",
    es: "Claridad sobre el caos",
    descEn: "Reach Sunday calm. Know what's happening, what's missing and what's next.",
    descEs: "Llega al domingo en calma. Sabes qué pasa, qué falta y qué sigue.",
  },
];

// =============================================================
// HOOK: Countdown to launch offer deadline (May 31, 2026)
// =============================================================
const OFFER_DEADLINE = new Date("2026-05-31T23:59:00-04:00").getTime(); // DR / EST
function useCountdown() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, OFFER_DEADLINE - now);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { days, hours, minutes, seconds, isLive: diff === 0 };
}

// =============================================================
// REALISTIC MOCK VISUALS PER MODULE
// =============================================================
function ModuleMock({ type, accent }) {
  const Bar = ({ w = "100%", c = "#E5E7EB", h = 8 }) => (
    <div style={{ width: w, height: h, background: c, borderRadius: 999 }} />
  );

  const wrap = "bg-white rounded-2xl shadow-2xl p-5 w-full max-w-md text-[#1F2937]";

  if (type === "dashboard") {
    return (
      <div className={wrap}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-[#6B7280]">SYSTEM PULSE</span>
          <span className="text-[10px] text-[#10B981] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />LIVE</span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: "MRR", val: "$48,210", trend: "+12%" },
            { label: "Pipeline", val: "$214K", trend: "+8%" },
            { label: "Eventos hoy", val: "3", trend: "·" },
          ].map((k) => (
            <div key={k.label} className="bg-[#F7F8FA] rounded-lg p-2.5">
              <p className="text-[9px] text-[#6B7280] uppercase tracking-wider">{k.label}</p>
              <p className="text-base font-bold">{k.val}</p>
              <p className="text-[10px]" style={{ color: accent }}>{k.trend}</p>
            </div>
          ))}
        </div>
        <p className="text-xs font-semibold text-[#6B7280] mb-2">Cash flow · 30d</p>
        <svg viewBox="0 0 200 60" className="w-full h-14 mb-3">
          <polyline fill="none" stroke={accent} strokeWidth="2.5" points="0,40 20,32 40,38 60,28 80,30 100,18 120,22 140,12 160,18 180,8 200,14" />
          <polyline fill={accent} fillOpacity="0.15" points="0,40 20,32 40,38 60,28 80,30 100,18 120,22 140,12 160,18 180,8 200,14 200,60 0,60" />
        </svg>
        <div className="flex items-center gap-2 text-[10px] text-[#6B7280]">
          <span className="px-2 py-0.5 rounded-full bg-[#F7F8FA]">5 follow-ups</span>
          <span className="px-2 py-0.5 rounded-full bg-[#F7F8FA]">2 aprobaciones</span>
        </div>
      </div>
    );
  }

  if (type === "crm") {
    const stages = [
      { name: "New", n: 8, c: "#94A3B8" },
      { name: "Qualified", n: 5, c: "#3B82F6" },
      { name: "Proposal", n: 3, c: "#8B5CF6" },
      { name: "Won", n: 2, c: "#10B981" },
    ];
    return (
      <div className={wrap}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-[#6B7280]">PIPELINE</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: accent + "22", color: accent }}>$214K</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {stages.map((s) => (
            <div key={s.name} className="bg-[#F7F8FA] rounded-lg p-2 text-center">
              <p className="text-[9px] text-[#6B7280] truncate">{s.name}</p>
              <p className="text-sm font-bold" style={{ color: s.c }}>{s.n}</p>
              <div className="h-1 rounded-full mt-1" style={{ background: s.c, opacity: 0.3 }} />
            </div>
          ))}
        </div>
        {[
          { name: "María R.", co: "Bodas Dorada", v: "$8,400", st: "Proposal", c: "#8B5CF6" },
          { name: "Carlos M.", co: "Banco Popular", v: "$24,000", st: "Qualified", c: "#3B82F6" },
          { name: "Lucía F.", co: "Estudio Avila", v: "$3,200", st: "Won", c: "#10B981" },
        ].map((l) => (
          <div key={l.name} className="flex items-center gap-2 py-2 border-t border-[#F1F5F9]">
            <div className="w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ background: l.c + "22", color: l.c }}>
              {l.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{l.name}</p>
              <p className="text-[10px] text-[#6B7280] truncate">{l.co}</p>
            </div>
            <span className="text-[11px] font-bold" style={{ color: l.c }}>{l.v}</span>
          </div>
        ))}
      </div>
    );
  }

  if (type === "goals") {
    return (
      <div className={wrap}>
        <span className="text-xs font-semibold text-[#6B7280]">GOALS · Q2 2026</span>
        <div className="space-y-3 mt-3">
          {[
            { g: "Cerrar 12 eventos corporativos", p: 75, c: accent },
            { g: "Lanzar Kora OS al mercado", p: 90, c: "#3B82F6" },
            { g: "Reducir tiempo de propuesta 40%", p: 55, c: "#F97316" },
          ].map((x) => (
            <div key={x.g}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium truncate pr-2">{x.g}</span>
                <span className="font-bold" style={{ color: x.c }}>{x.p}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-[#F1F5F9] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${x.p}%`, background: x.c }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-[#F1F5F9] grid grid-cols-3 gap-2 text-center">
          <div><p className="text-base font-bold">14</p><p className="text-[9px] text-[#6B7280]">tareas hoy</p></div>
          <div><p className="text-base font-bold">3</p><p className="text-[9px] text-[#6B7280]">en revisión</p></div>
          <div><p className="text-base font-bold" style={{ color: accent }}>92%</p><p className="text-[9px] text-[#6B7280]">a tiempo</p></div>
        </div>
      </div>
    );
  }

  if (type === "finance") {
    return (
      <div className={wrap}>
        <span className="text-xs font-semibold text-[#6B7280]">CASH FLOW · ABRIL</span>
        <div className="flex items-baseline gap-2 mt-1 mb-3">
          <span className="text-2xl font-bold">$ 184,520</span>
          <span className="text-xs font-semibold" style={{ color: accent }}>+18%</span>
        </div>
        <div className="grid grid-cols-12 gap-1 h-20 items-end mb-3">
          {[40, 55, 35, 60, 75, 50, 80, 65, 90, 70, 85, 95].map((h, i) => (
            <div key={i} className="rounded-t" style={{ height: `${h}%`, background: i > 8 ? accent : "#CBD5E1" }} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-[#F7F8FA] rounded-lg p-2">
            <p className="text-[10px] text-[#6B7280]">Por cobrar</p>
            <p className="font-bold">$ 42,180</p>
          </div>
          <div className="bg-[#F7F8FA] rounded-lg p-2">
            <p className="text-[10px] text-[#6B7280]">Por pagar</p>
            <p className="font-bold text-[#EF4444]">$ 18,640</p>
          </div>
        </div>
      </div>
    );
  }

  if (type === "studio") {
    return (
      <div className={wrap}>
        <span className="text-xs font-semibold text-[#6B7280]">FEED PREVIEW · IG</span>
        <div className="grid grid-cols-3 gap-0.5 mt-3 rounded-lg overflow-hidden">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="aspect-square" style={{
              background: [
                "linear-gradient(135deg, #fbcfe8, #f9a8d4)",
                "linear-gradient(135deg, #ddd6fe, #c4b5fd)",
                "linear-gradient(135deg, #fed7aa, #fdba74)",
                "linear-gradient(135deg, #fef3c7, #fde68a)",
                "linear-gradient(135deg, #d1fae5, #a7f3d0)",
                "linear-gradient(135deg, #bfdbfe, #93c5fd)",
                "linear-gradient(135deg, #fbcfe8, #f9a8d4)",
                "#F7F8FA",
                "linear-gradient(135deg, #ddd6fe, #c4b5fd)",
              ][i],
            }} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="bg-[#F7F8FA] rounded p-1.5">
            <p className="text-sm font-bold">24</p>
            <p className="text-[9px] text-[#6B7280]">programados</p>
          </div>
          <div className="bg-[#F7F8FA] rounded p-1.5">
            <p className="text-sm font-bold" style={{ color: accent }}>8</p>
            <p className="text-[9px] text-[#6B7280]">listos</p>
          </div>
          <div className="bg-[#F7F8FA] rounded p-1.5">
            <p className="text-sm font-bold">3</p>
            <p className="text-[9px] text-[#6B7280]">campañas</p>
          </div>
        </div>
      </div>
    );
  }

  if (type === "event") {
    return (
      <div className={wrap}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[#6B7280]">RUN OF SHOW · BODA M&L</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: accent + "22", color: accent }}>120 invitados</span>
        </div>
        <div className="mt-3 space-y-2">
          {[
            { t: "16:00", d: "Llegada de invitados", st: "done" },
            { t: "16:30", d: "Ceremonia", st: "done" },
            { t: "17:30", d: "Cocktail · Jardín", st: "live" },
            { t: "19:00", d: "Cena emplatada", st: "next" },
            { t: "21:30", d: "Pista · DJ Lobo", st: "next" },
          ].map((s) => (
            <div key={s.t} className="flex items-center gap-3">
              <span className="text-xs font-mono text-[#6B7280] w-10">{s.t}</span>
              <div className={`w-2 h-2 rounded-full ${s.st === "live" ? "ring-2 ring-offset-1" : ""}`} style={{
                background: s.st === "done" ? "#10B981" : s.st === "live" ? accent : "#CBD5E1",
                ringColor: accent,
              }} />
              <span className={`text-xs flex-1 ${s.st === "done" ? "text-[#94A3B8] line-through" : "font-medium"}`}>{s.d}</span>
              {s.st === "live" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: accent, color: "white" }}>EN VIVO</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "culinary") {
    return (
      <div className={wrap}>
        <span className="text-xs font-semibold text-[#6B7280]">RECETA · Sancocho 7 Carnes</span>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-xl font-bold">$ 142.50</span>
          <span className="text-[11px] text-[#6B7280]">/porción · 12pp</span>
        </div>
        <div className="mt-3 space-y-1.5">
          {[
            { i: "Carne res", c: "$32.10", p: 22 },
            { i: "Pollo entero", c: "$18.40", p: 13 },
            { i: "Cerdo", c: "$24.80", p: 17 },
            { i: "Víveres mix", c: "$28.30", p: 20 },
            { i: "Mano de obra", c: "$18.90", p: 13 },
          ].map((r) => (
            <div key={r.i} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate">{r.i}</span>
              <span className="text-[#6B7280] w-14 text-right">{r.c}</span>
              <div className="w-12 h-1 rounded-full bg-[#F1F5F9] overflow-hidden">
                <div className="h-full" style={{ width: `${r.p}%`, background: accent }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-[#F1F5F9] flex justify-between text-xs">
          <span className="text-[#6B7280]">Margen sugerido</span>
          <span className="font-bold" style={{ color: accent }}>62%</span>
        </div>
      </div>
    );
  }

  if (type === "resources") {
    return (
      <div className={wrap}>
        <span className="text-xs font-semibold text-[#6B7280]">INVENTARIO · MAYO</span>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {[
            { n: "Sillas Tiffany", q: 240, max: 300, c: accent },
            { n: "Mesas redondas", q: 38, max: 50, c: "#3B82F6" },
            { n: "Mantelería", q: 12, max: 60, c: "#EF4444" },
            { n: "Vajilla 8 pzs", q: 180, max: 200, c: "#10B981" },
          ].map((r) => (
            <div key={r.n} className="bg-[#F7F8FA] rounded-lg p-2.5">
              <p className="text-[10px] text-[#6B7280] truncate">{r.n}</p>
              <p className="text-base font-bold">{r.q}<span className="text-[10px] text-[#94A3B8]">/{r.max}</span></p>
              <div className="h-1 rounded-full bg-white mt-1.5 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(r.q / r.max) * 100}%`, background: r.c }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-[#EF4444]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />Mantelería bajo stock — reordenar antes del 15
        </div>
      </div>
    );
  }

  if (type === "venues") {
    return (
      <div className={wrap}>
        <span className="text-xs font-semibold text-[#6B7280]">SALÓN PRINCIPAL · 18 ABR</span>
        <div className="relative mt-3 bg-[#F7F8FA] rounded-lg p-4 h-44 overflow-hidden">
          {/* Stage */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-32 h-3 rounded" style={{ background: accent }} />
          <p className="absolute top-2 left-1/2 -translate-x-1/2 text-[8px] text-white font-bold">ESCENARIO</p>
          {/* Round tables */}
          {[
            [25, 30], [55, 30], [85, 30],
            [15, 55], [45, 55], [75, 55],
            [25, 80], [55, 80], [85, 80],
          ].map(([x, y], i) => (
            <div key={i} className="absolute w-7 h-7 rounded-full border-2 flex items-center justify-center text-[8px] font-bold" style={{
              left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)", borderColor: accent, color: accent,
            }}>{i + 1}</div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div><p className="font-bold">120</p><p className="text-[9px] text-[#6B7280]">capacidad</p></div>
          <div><p className="font-bold">12</p><p className="text-[9px] text-[#6B7280]">mesas</p></div>
          <div><p className="font-bold" style={{ color: accent }}>OK</p><p className="text-[9px] text-[#6B7280]">disponible</p></div>
        </div>
      </div>
    );
  }

  if (type === "team") {
    return (
      <div className={wrap}>
        <span className="text-xs font-semibold text-[#6B7280]">EQUIPO · ESTA SEMANA</span>
        <div className="space-y-2 mt-3">
          {[
            { n: "Andrea Pérez", r: "Coordinadora", h: 38, c: "#EC4899" },
            { n: "José Ramírez", r: "Chef", h: 42, c: "#F97316" },
            { n: "Pamela Ortiz", r: "Marketing", h: 32, c: "#8B5CF6" },
            { n: "Luis Vargas", r: "Logística", h: 40, c: "#3B82F6" },
          ].map((p) => (
            <div key={p.n} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full text-[11px] font-bold text-white flex items-center justify-center" style={{ background: p.c }}>
                {p.n.split(" ").map((s) => s.charAt(0)).join("")}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{p.n}</p>
                <p className="text-[10px] text-[#6B7280]">{p.r}</p>
              </div>
              <span className="text-[11px] font-bold">{p.h}h</span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-[#F1F5F9] flex justify-between text-xs">
          <span className="text-[#6B7280]">Nómina semana</span>
          <span className="font-bold" style={{ color: accent }}>$ 4,820</span>
        </div>
      </div>
    );
  }

  return null;
}

// =============================================================
// FOUNDING WAITLIST FORM
// =============================================================
function WaitlistForm({ source = "landing", onSuccess, isEs }) {
  const [form, setForm] = useState({ name: "", email: "", company: "", interest: "" });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/api/launch/waitlist`, { ...form, source });
      setResult(res.data);
      onSuccess && onSuccess(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || (isEs ? "Algo salió mal. Intenta de nuevo." : "Something went wrong."));
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="bg-white rounded-2xl p-6 text-center" data-testid="waitlist-success">
        <div className="w-14 h-14 mx-auto rounded-full bg-[#AED768]/20 flex items-center justify-center mb-3">
          <Check className="w-8 h-8 text-[#AED768]" />
        </div>
        {result.is_founding ? (
          <>
            <h3 className="font-heading text-xl font-bold mb-2">
              {isEs ? `¡Eres Early-Adopter #${result.founding_position}!` : `You're Early-Adopter #${result.founding_position}!`}
            </h3>
            <p className="text-sm text-[#6B7280]">
              {isEs
                ? "30% off año 1 reservado. Te escribimos en menos de 24h con los siguientes pasos."
                : "30% off year 1 secured. We'll email you within 24h with next steps."}
            </p>
          </>
        ) : (
          <>
            <h3 className="font-heading text-xl font-bold mb-2">{isEs ? "Estás en la lista" : "You're on the list"}</h3>
            <p className="text-sm text-[#6B7280]">
              {isEs ? "Las plazas Launch Special ya se agotaron, pero seguirás teniendo acceso prioritario." : "Launch Special spots are gone, but you'll have priority access."}
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3" data-testid="waitlist-form">
      <Input
        required
        placeholder={isEs ? "Tu nombre" : "Your name"}
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        className="h-11 rounded-xl bg-white"
        data-testid="waitlist-name"
      />
      <Input
        required
        type="email"
        placeholder={isEs ? "Email de trabajo" : "Work email"}
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        className="h-11 rounded-xl bg-white"
        data-testid="waitlist-email"
      />
      <Input
        placeholder={isEs ? "Empresa (opcional)" : "Company (optional)"}
        value={form.company}
        onChange={(e) => setForm({ ...form, company: e.target.value })}
        className="h-11 rounded-xl bg-white"
        data-testid="waitlist-company"
      />
      <Textarea
        placeholder={isEs ? "¿Qué te gustaría ver en la demo? (opcional)" : "What do you want to see in the demo? (optional)"}
        value={form.interest}
        onChange={(e) => setForm({ ...form, interest: e.target.value })}
        className="rounded-xl bg-white min-h-[60px]"
        rows={2}
        data-testid="waitlist-interest"
      />
      {error && <p className="text-sm text-red-500" data-testid="waitlist-error">{error}</p>}
      <Button
        type="submit"
        disabled={submitting}
        className="w-full h-12 rounded-full bg-[#AED768] hover:bg-[#9BC75A] text-[#1F2937] font-semibold"
        data-testid="waitlist-submit"
      >
        {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {source === "demo"
          ? (isEs ? "Reservar mi demo" : "Book my demo")
          : (isEs ? "Reclamar mi 30% off" : "Claim my 30% off")}
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </form>
  );
}

// =============================================================
// PAGE
// =============================================================
export default function LandingPage() {
  const { language, changeLanguage } = useLanguage();
  const isEs = language === "es";
  const [activeModule, setActiveModule] = useState("system_pulse");
  const [bannerOpen, setBannerOpen] = useState(true);
  const [stats, setStats] = useState({ founding_remaining: 100, founding_claimed: 0, founding_cap: 100 });
  const countdown = useCountdown();

  useEffect(() => {
    axios.get(`${API}/api/launch/stats`).then((r) => setStats(r.data)).catch(() => {});
  }, []);

  const refetchStats = () => axios.get(`${API}/api/launch/stats`).then((r) => setStats(r.data)).catch(() => {});

  const activeModuleData = useMemo(
    () => moduleHighlights.find((m) => m.id === activeModule),
    [activeModule]
  );

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      {/* ================= LAUNCH BANNER ================= */}
      {bannerOpen && (
        <div className="bg-[#1F2937] text-white text-sm" data-testid="launch-banner">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-center gap-3 text-center">
            <span className="hidden sm:inline-flex items-center gap-2 px-2 py-0.5 rounded-full bg-[#AED768] text-[#1F2937] text-xs font-bold">
              <Sparkles className="w-3 h-3" /> {isEs ? "RECIÉN LANZADO" : "JUST LAUNCHED"}
            </span>
            <span className="hidden md:inline">
              {isEs ? "Oferta de lanzamiento · 30% off año 1 · termina en" : "Launch offer · 30% off year 1 · ends in"}
            </span>
            <span className="md:hidden">
              {isEs ? "Oferta · 30% off · termina en" : "Offer · 30% off · ends in"}
            </span>
            <span className="font-mono font-bold tabular-nums text-[#AED768]">
              {countdown.days}d {String(countdown.hours).padStart(2, "0")}:{String(countdown.minutes).padStart(2, "0")}:{String(countdown.seconds).padStart(2, "0")}
            </span>
            <a href="#founding" className="hidden sm:inline text-[#AED768] hover:text-white transition-colors">
              {isEs ? "Reclamar →" : "Claim →"}
            </a>
            <button onClick={() => setBannerOpen(false)} className="ml-2 text-white/50 hover:text-white" data-testid="banner-close">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ================= HEADER ================= */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" data-testid="header-logo">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#1F2937] flex items-center justify-center p-1">
              <img src="/kora-logo.png" alt="Kora OS" className="w-full h-full object-contain" />
            </div>
            <div className="leading-tight">
              <span className="block font-heading text-base font-bold text-[#1F2937]">Kora OS</span>
              <span className="block text-[10px] text-[#AED768] font-medium">Designed for clarity</span>
            </div>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <a href="#founding" className="hidden md:flex items-center gap-1 text-sm font-medium text-[#1F2937] hover:text-[#AED768] transition-colors">
              <Sparkles className="w-4 h-4" />
              {isEs ? "Oferta de lanzamiento" : "Launch Offer"}
            </a>
            <a href="#pricing" className="hidden md:flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#1F2937] transition-colors">
              {isEs ? "Precios" : "Pricing"}
            </a>
            <button
              onClick={() => changeLanguage(isEs ? "en" : "es")}
              className="flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#1F2937] transition-colors"
              data-testid="lang-toggle"
            >
              <Globe className="w-4 h-4" />
              {isEs ? "EN" : "ES"}
            </button>
            <Link to="/login">
              <Button variant="ghost" size="sm" className="text-[#1F2937]" data-testid="login-nav-btn">
                {isEs ? "Iniciar Sesión" : "Login"}
              </Button>
            </Link>
            <Link to="/register">
              <Button size="sm" className="rounded-full px-5 bg-[#1F2937] hover:bg-[#2A2F3A] text-white" data-testid="get-started-btn">
                {isEs ? "Comenzar" : "Get Started"}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section className="pt-12 pb-12 px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-10 items-center">
          {/* Left text */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#AED768]/15 text-[#1F2937] text-xs font-semibold mb-5" data-testid="hero-badge">
              <Sparkles className="w-3.5 h-3.5 text-[#AED768]" />
              {isEs ? "🚀 Recién lanzado · disponible ahora" : "🚀 Just launched · available now"}
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold text-[#1F2937] leading-[1.05]">
              {isEs ? (
                <>El sistema operativo de las<br /><span className="text-[#AED768]">operaciones complejas</span>.</>
              ) : (
                <>The operating system for<br /><span className="text-[#AED768]">complex operations</span>.</>
              )}
            </h1>
            <p className="mt-5 text-lg text-[#6B7280] max-w-xl">
              {isEs
                ? "Clientes, eventos, producción, finanzas y marketing — conectados en una sola plataforma diseñada para llevar tu operación de caos a claridad."
                : "Clients, events, production, finance and marketing — connected in one platform designed to take your operation from chaos to clarity."}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#founding">
                <Button size="lg" className="rounded-full px-7 gap-2 bg-[#AED768] hover:bg-[#9BC75A] text-[#1F2937] font-semibold shadow-lg shadow-[#AED768]/30" data-testid="hero-founding-btn">
                  <Star className="w-4 h-4" fill="currentColor" />
                  {isEs ? `Reclamar 30% off año 1` : `Claim 30% off year 1`}
                </Button>
              </a>
              <Link to="/register">
                <Button size="lg" variant="outline" className="rounded-full px-7 gap-2 border-2 border-[#1F2937] text-[#1F2937] hover:bg-[#1F2937] hover:text-white" data-testid="hero-trial-btn">
                  <Zap className="w-4 h-4" />
                  {isEs ? "Comenzar gratis 7 días" : "Start 7-day free trial"}
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-xs text-[#94A3B8]">
              {isEs ? `Quedan ${stats.founding_remaining} de ${stats.founding_cap} plazas Launch Special · sin tarjeta de crédito` : `${stats.founding_remaining} of ${stats.founding_cap} Launch Special spots left · no credit card`}
            </p>
          </div>

          {/* Right hero mock — stack of two phone-ish cards */}
          <div className="relative h-[480px] hidden lg:block">
            <div className="absolute right-0 top-0 w-[78%]">
              <div className="bg-[#1F2937] rounded-3xl p-3 shadow-2xl">
                <div className="bg-[#F7F8FA] rounded-2xl overflow-hidden">
                  <div className="bg-[#1F2937] px-4 py-2 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#FF5F57]" />
                    <div className="w-2 h-2 rounded-full bg-[#FEBC2E]" />
                    <div className="w-2 h-2 rounded-full bg-[#28C840]" />
                    <span className="ml-2 text-[10px] text-white/50">kora.app/dashboard</span>
                  </div>
                  <div className="p-5">
                    <ModuleMock type="dashboard" accent="#AED768" />
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute left-0 bottom-0 w-[58%]">
              <div className="bg-white rounded-2xl p-3 shadow-2xl rotate-[-4deg]">
                <ModuleMock type="crm" accent="#3B82F6" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= LAUNCHED · DEMO CTA ================= */}
      <section id="event" className="py-14 px-6 bg-[#1F2937] text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "radial-gradient(circle at 20% 50%, #AED768 0%, transparent 50%), radial-gradient(circle at 80% 80%, #AED768 0%, transparent 40%)",
        }} />
        <div className="max-w-6xl mx-auto relative">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#AED768]/20 text-[#AED768] text-xs font-bold mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                {isEs ? "🎉 KORA OS YA ESTÁ DISPONIBLE" : "🎉 KORA OS IS LIVE"}
              </div>
              <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
                {isEs ? (
                  <>Tu operación,<br /><span className="text-[#AED768]">en una sola plataforma</span>.</>
                ) : (
                  <>Your operation,<br /><span className="text-[#AED768]">on one platform</span>.</>
                )}
              </h2>
              <p className="mt-4 text-white/70 text-lg max-w-xl">
                {isEs
                  ? "Reserva un walkthrough personalizado de 20 minutos. Te mostramos exactamente cómo Kora OS resolvería tu operación específica — agencia, catering, eventos o servicios."
                  : "Book a 20-minute personalized walkthrough. We'll show you exactly how Kora OS would solve your specific operation — agency, catering, events or services."}
              </p>
              <ul className="mt-6 space-y-2.5">
                {[
                  { en: "Demo adaptada a tu industria", es: "Demo adaptada a tu industria" },
                  { en: "Walkthrough sin scripts ni filtros", es: "Walkthrough sin scripts ni filtros" },
                  { en: "30% off año 1 si entras al Launch Special", es: "30% off año 1 si entras al Launch Special" },
                ].map((b, i) => (
                  <li key={i} className="flex items-start gap-3 text-white/85">
                    <Check className="w-5 h-5 text-[#AED768] flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{isEs ? b.es : b.en}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Demo card */}
            <div className="bg-white rounded-3xl p-7 text-[#1F2937] shadow-2xl">
              <div className="flex items-center gap-3 mb-1">
                <Mic2 className="w-5 h-5 text-[#AED768]" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#AED768]">
                  {isEs ? "Reserva tu demo personalizada" : "Book your personalized demo"}
                </span>
              </div>
              <h3 className="font-heading text-2xl font-bold mb-1">
                {isEs ? "20 min · 1-on-1 con el equipo" : "20 min · 1-on-1 with the team"}
              </h3>
              <p className="text-sm text-[#6B7280] mb-5">
                {isEs ? "Te respondemos en menos de 24h con horarios disponibles." : "We'll respond within 24h with available slots."}
              </p>
              <WaitlistForm source="demo" onSuccess={refetchStats} isEs={isEs} />
            </div>
          </div>
        </div>
      </section>

      {/* ================= MODULES ================= */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10 max-w-2xl mx-auto">
            <span className="text-xs font-bold tracking-widest uppercase text-[#AED768]">
              {isEs ? "10 módulos · una sola plataforma" : "10 modules · one platform"}
            </span>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-[#1F2937] mt-2">
              {isEs ? "Todo lo que tu operación necesita" : "Everything your operation needs"}
            </h2>
            <p className="mt-3 text-[#6B7280]">
              {isEs ? "De la vista ejecutiva al detalle del stock — en el mismo orden que lo verás dentro." : "From the executive view to stock-level detail — in the same order you'll see inside."}
            </p>
          </div>

          {/* Module tabs */}
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {moduleHighlights.map((m) => {
              const Icon = m.icon;
              const active = activeModule === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setActiveModule(m.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium transition-all ${
                    active
                      ? "bg-[#1F2937] text-white shadow-lg"
                      : "bg-white text-[#6B7280] hover:bg-[#E5E7EB] border border-[#E5E7EB]"
                  }`}
                  data-testid={`module-tab-${m.id}`}
                  style={active ? { boxShadow: `0 8px 24px ${m.accent}33` } : {}}
                >
                  <Icon className="w-3.5 h-3.5" style={active ? { color: m.accent } : {}} />
                  <span className="hidden sm:inline">{isEs ? m.titleEs : m.title}</span>
                </button>
              );
            })}
          </div>

          {/* Active module card */}
          {activeModuleData && (
            <div className="bg-white rounded-3xl shadow-xl border border-[#E5E7EB] overflow-hidden">
              <div className="grid lg:grid-cols-2">
                {/* Left info */}
                <div className="p-8 lg:p-12">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                    style={{ background: activeModuleData.accent + "1A" }}
                  >
                    <activeModuleData.icon className="w-6 h-6" style={{ color: activeModuleData.accent }} />
                  </div>
                  <h3 className="font-heading text-3xl font-bold text-[#1F2937] mb-1">
                    {isEs ? activeModuleData.titleEs : activeModuleData.title}
                  </h3>
                  <p className="font-medium mb-4" style={{ color: activeModuleData.accent }}>
                    {isEs ? activeModuleData.subtitleEs : activeModuleData.subtitle}
                  </p>
                  <p className="text-[#6B7280] mb-6">
                    {isEs ? activeModuleData.descriptionEs : activeModuleData.description}
                  </p>
                  <ul className="space-y-2.5">
                    {activeModuleData.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-3 text-[#4B5563]">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: activeModuleData.accent + "22" }}>
                          <Check className="w-3 h-3" style={{ color: activeModuleData.accent }} />
                        </div>
                        <span className="text-sm">{isEs ? f.es : f.en}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Right mock */}
                <div className="p-8 lg:p-12 flex items-center justify-center min-h-[420px]" style={{
                  background: `linear-gradient(135deg, ${activeModuleData.accent}, ${activeModuleData.accent}cc)`,
                }}>
                  <ModuleMock type={activeModuleData.mockType} accent={activeModuleData.accent} />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ================= DIFFERENTIATORS ================= */}
      <section className="py-16 px-6 bg-[#1F2937] text-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-heading text-2xl sm:text-3xl font-bold">
              {isEs ? "Por qué Kora OS es diferente" : "Why Kora OS is different"}
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {differentiators.map((d, i) => {
              const Icon = d.icon;
              return (
                <div key={i} className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6 hover:border-[#AED768]/50 transition-all">
                  <div className="w-10 h-10 rounded-lg bg-[#AED768]/20 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-[#AED768]" />
                  </div>
                  <h3 className="font-heading text-base font-bold mb-2">{isEs ? d.es : d.en}</h3>
                  <p className="text-sm text-white/60">{isEs ? d.descEs : d.descEn}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= FOUNDING 100 ================= */}
      <section id="founding" className="py-20 px-6 bg-gradient-to-br from-[#AED768]/10 via-white to-[#AED768]/5">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1F2937] text-[#AED768] text-xs font-bold mb-5">
                <Sparkles className="w-3.5 h-3.5" />
                {isEs ? "LAUNCH SPECIAL · OFERTA LIMITADA" : "LAUNCH SPECIAL · LIMITED OFFER"}
              </div>
              <h2 className="font-heading text-3xl sm:text-5xl font-bold text-[#1F2937] leading-tight">
                {isEs ? (
                  <>Primeras 50 empresas:<br /><span className="text-[#AED768]">30% off año 1</span>.</>
                ) : (
                  <>First 50 companies:<br /><span className="text-[#AED768]">30% off year 1</span>.</>
                )}
              </h2>
              <p className="mt-5 text-[#6B7280] text-lg max-w-xl">
                {isEs
                  ? "Oferta de lanzamiento por tiempo limitado. Cuando se llenen las 50 plazas o llegue el 31 de Mayo (lo que ocurra primero), cierra."
                  : "Limited-time launch offer. When the 50 spots fill up or May 31 arrives (whichever comes first), it closes."}
              </p>

              {/* Countdown to deadline */}
              <div className="mt-5 inline-flex items-center gap-2 text-sm text-[#1F2937] font-mono bg-white border border-[#E5E7EB] rounded-full px-4 py-1.5">
                <span className="text-xs text-[#6B7280] font-sans">{isEs ? "Termina en" : "Ends in"}</span>
                <span className="font-bold tabular-nums text-[#AED768]">
                  {countdown.days}d {String(countdown.hours).padStart(2, "0")}:{String(countdown.minutes).padStart(2, "0")}:{String(countdown.seconds).padStart(2, "0")}
                </span>
              </div>

              {/* Scarcity counter */}
              <div className="mt-5 bg-white rounded-2xl p-5 border border-[#E5E7EB]">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-sm font-semibold text-[#1F2937]">
                    {isEs ? "Plazas Launch Special reservadas" : "Launch Special spots claimed"}
                  </span>
                  <span className="text-sm font-bold text-[#1F2937]">
                    <span className="text-[#AED768]">{stats.founding_claimed}</span>
                    <span className="text-[#94A3B8]"> / {stats.founding_cap}</span>
                  </span>
                </div>
                <div className="h-3 rounded-full bg-[#F1F5F9] overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#AED768] to-[#9BC75A] transition-all duration-700" style={{ width: `${(stats.founding_claimed / Math.max(stats.founding_cap, 1)) * 100}%` }} />
                </div>
                <p className="text-xs text-[#6B7280] mt-2">
                  {isEs ? `Quedan ${stats.founding_remaining} plazas con 30% de descuento` : `${stats.founding_remaining} spots left with 30% off`}
                </p>
              </div>

              {/* Benefits */}
              <ul className="mt-6 space-y-3">
                {[
                  { en: "30% off your first year on Kora Core + add-ons", es: "30% off tu primer año en Kora Core + add-ons" },
                  { en: "Early-adopter badge on your account, forever", es: "Badge de Early-adopter en tu cuenta, para siempre" },
                  { en: "Direct line to the team via private Discord", es: "Línea directa con el equipo vía Discord privado" },
                  { en: "1:1 onboarding with the team", es: "Onboarding 1:1 con el equipo" },
                  { en: "Priority on roadmap requests", es: "Prioridad en solicitudes del roadmap" },
                ].map((b, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#AED768] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3.5 h-3.5 text-[#1F2937]" strokeWidth={3} />
                    </div>
                    <span className="text-[#1F2937]">{isEs ? b.es : b.en}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-[#1F2937] rounded-3xl p-8 text-white shadow-2xl">
              <h3 className="font-heading text-2xl font-bold mb-2">
                {isEs ? "Reserva tu plaza Launch Special" : "Claim your Launch Special spot"}
              </h3>
              <p className="text-white/60 text-sm mb-6">
                {isEs ? "Toma 30 segundos. Sin compromiso." : "Takes 30 seconds. No commitment."}
              </p>
              <WaitlistForm source="launch_special" onSuccess={refetchStats} isEs={isEs} />
              <p className="text-center text-white/40 text-xs mt-4">
                {isEs ? "🔒 Tus datos solo se usan para activarte el descuento." : "🔒 Your info is only used to activate your discount."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================= INTEGRATIONS ================= */}
      <section className="py-12 px-6 bg-white">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-[#6B7280] mb-6 text-sm">
            {isEs ? "Se integra con las herramientas que ya usas" : "Integrates with tools you already use"}
          </p>
          <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-6">
            {[
              { src: "https://customer-assets.emergentagent.com/job_c471c9f3-0c38-4c3b-9501-e7c14f67e842/artifacts/me0osaml_Gmail_Logo_512px.png.webp", alt: "Gmail" },
              { src: "https://customer-assets.emergentagent.com/job_c471c9f3-0c38-4c3b-9501-e7c14f67e842/artifacts/377mcwog_Google_Calendar_icon_%282020%29.svg.png", alt: "Google Calendar" },
              { src: "https://cdn.simpleicons.org/meta", alt: "Meta" },
              { src: "https://customer-assets.emergentagent.com/job_c471c9f3-0c38-4c3b-9501-e7c14f67e842/artifacts/g6u4qf9k_326-3265266_google-ads-logo-png-google-ads-icon.png.jpeg", alt: "Google Ads" },
              { src: "https://cdn.simpleicons.org/stripe", alt: "Stripe" },
              { src: "https://cdn.simpleicons.org/whatsapp", alt: "WhatsApp" },
            ].map((i) => (
              <div key={i.alt} className="opacity-60 hover:opacity-100 transition-all duration-300 hover:scale-110" title={i.alt}>
                <img src={i.src} alt={i.alt} className="w-9 h-9 grayscale hover:grayscale-0 transition-all duration-300 object-contain" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= PRICING ================= */}
      <section id="pricing" className="py-16 px-6 bg-[#F7F8FA]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-[#1F2937]">
              {isEs ? "Un precio simple. Tu industria, configurada." : "Simple pricing. Your industry, ready."}
            </h2>
            <p className="mt-3 text-[#6B7280]">
              {isEs ? "Empieza con Kora Core y suma los módulos que necesites." : "Start with Kora Core, add the modules you need."}
            </p>
          </div>

          <div className="max-w-lg mx-auto mb-10">
            <div className="bg-[#1F2937] rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-[#AED768] text-[#1F2937] text-xs font-bold px-3 py-1 rounded-full">
                {isEs ? "7 DÍAS GRATIS" : "7 DAYS FREE"}
              </div>
              <h3 className="font-heading text-2xl font-bold mb-2">Kora Core</h3>
              <p className="text-white/70 mb-4 text-sm">
                {isEs ? "Lo que toda operación necesita: clientes, finanzas, equipo." : "What every operation needs: clients, finance, team."}
              </p>
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-5xl font-bold text-[#AED768]">$48</span>
                <span className="text-white/60">/{isEs ? "mes" : "mo"}</span>
                <span className="text-sm text-white/40 line-through">$69</span>
              </div>
              <p className="text-xs text-[#AED768] mb-6">
                {isEs ? "Launch Special: 30% off año 1" : "Launch Special: 30% off year 1"}
              </p>
              <ul className="space-y-2.5 mb-7">
                {[
                  { en: "System Pulse · executive dashboard", es: "System Pulse · dashboard ejecutivo" },
                  { en: "Client Engagement · CRM & portal", es: "Client Engagement · CRM y portal" },
                  { en: "Execution Hub · goals & projects", es: "Execution Hub · metas y proyectos" },
                  { en: "Business Clarity · finance", es: "Business Clarity · finanzas" },
                  { en: "Unlimited users · multi-language", es: "Usuarios ilimitados · multi-idioma" },
                ].map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/90 text-sm">
                    <Check className="w-4 h-4 text-[#AED768] flex-shrink-0" />
                    {isEs ? f.es : f.en}
                  </li>
                ))}
              </ul>
              <a href="#founding">
                <Button className="w-full h-12 rounded-full bg-[#AED768] hover:bg-[#9BC75A] text-[#1F2937] font-semibold" data-testid="pricing-cta-btn">
                  {isEs ? "Reclamar 30% Launch Special" : "Claim 30% Launch Special"}
                  <ChevronRight className="w-5 h-5 ml-1" />
                </Button>
              </a>
            </div>
          </div>

          {/* Add-ons */}
          <div>
            <h3 className="text-center font-heading text-lg font-bold text-[#1F2937] mb-5">
              {isEs ? "Add-ons opcionales" : "Optional add-ons"}
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { i: Megaphone, n: "Demand Generation", p: "$39" },
                { i: ClipboardList, n: "Event Orchestration", p: "$29" },
                { i: UtensilsCrossed, n: "Culinary Intelligence", p: "$29" },
                { i: Building2, n: "Venues", p: "$19" },
                { i: Package, n: "Resource Mgmt.", p: "$19" },
                { i: Users, n: "People Ops", p: "$49" },
              ].map((a) => {
                const Icon = a.i;
                return (
                  <div key={a.n} className="bg-white rounded-xl p-4 border border-[#E5E7EB] hover:border-[#AED768] transition-all">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-[#1F2937]" />
                      <span className="text-sm font-semibold text-[#1F2937]">{a.n}</span>
                    </div>
                    <p className="text-[#AED768] text-sm font-bold">{a.p}<span className="text-[#94A3B8] text-xs font-normal">/{isEs ? "mes" : "mo"}</span></p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ================= FINAL CTA ================= */}
      <section className="py-20 px-6 bg-[#1F2937] text-white text-center">
        <div className="max-w-3xl mx-auto">
          <Quote className="w-10 h-10 text-[#AED768] mx-auto mb-4 opacity-50" />
          <h2 className="font-heading text-3xl sm:text-4xl font-bold mb-3">
            {isEs ? "Llega al domingo en calma." : "Reach Sunday calm."}
          </h2>
          <p className="text-white/70 text-lg mb-8">
            {isEs ? "Únete a las primeras empresas que están construyendo operaciones más claras con Kora OS." : "Join the first companies building clearer operations with Kora OS."}
          </p>
          <a href="#founding">
            <Button size="lg" className="rounded-full px-10 h-13 gap-2 bg-[#AED768] hover:bg-[#9BC75A] text-[#1F2937] font-semibold shadow-2xl shadow-[#AED768]/40">
              {isEs ? `Reserva tu plaza · ${stats.founding_remaining} disponibles` : `Claim your spot · ${stats.founding_remaining} left`}
              <ArrowRight className="w-5 h-5" />
            </Button>
          </a>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="py-10 px-6 bg-[#0F1419] text-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg overflow-hidden bg-[#1F2937] flex items-center justify-center p-1">
                <img src="/kora-logo.png" alt="Kora OS" className="w-full h-full object-contain" />
              </div>
              <div className="leading-tight">
                <span className="block font-heading text-sm font-bold">Kora OS</span>
                <span className="block text-[10px] text-[#AED768]">Designed for clarity</span>
              </div>
              <span className="text-white/30 text-sm ml-2">© 2026</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-white/50">
              <a href="#event" className="hover:text-[#AED768] transition-colors">{isEs ? "Demo" : "Demo"}</a>
              <a href="#founding" className="hover:text-[#AED768] transition-colors">{isEs ? "Launch Special" : "Launch Special"}</a>
              <a href="#pricing" className="hover:text-[#AED768] transition-colors">{isEs ? "Precios" : "Pricing"}</a>
              <button onClick={() => changeLanguage(isEs ? "en" : "es")} className="flex items-center gap-1 hover:text-[#AED768] transition-colors">
                <Globe className="w-3 h-3" />
                {isEs ? "EN" : "ES"}
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

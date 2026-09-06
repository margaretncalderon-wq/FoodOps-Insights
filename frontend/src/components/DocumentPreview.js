import { useState, useEffect, useRef } from "react";
import { API } from "../utils/api";
import axios from "axios";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
// toast import removed; print flow now uses an iframe with no UI feedback path
import { 
  FileText, Download, Printer, Eye, ChefHat, Utensils, 
  Package, Calendar, Users, MapPin, Phone, Mail, Building2,
  ClipboardList, ScrollText, Receipt, MenuSquare, Clock
} from "lucide-react";
import { formatDateOnly } from "../utils/dates";
import { parseDateOnly } from "../utils/dates";
import { buildCurrencyFormatter } from "../hooks/useCurrencyFormatter";
import { fmtNum } from "../utils/format";


// Document type configurations
const DOCUMENT_CONFIGS = {
  proposal: {
    name: { en: "Proposal / Contract", es: "Propuesta / Contrato" },
    icon: ScrollText,
    showPrices: true,
    showQuantity: true,
    showSubtotals: true,
    showTotals: true,
    showTerms: true,
    showNotes: true,
    groupByCategory: true,
    groupByDate: true,
  },
  invoice: {
    name: { en: "Invoice", es: "Factura" },
    icon: Receipt,
    showPrices: true,
    showQuantity: true,
    showSubtotals: true,
    showTotals: true,
    showTerms: true,
    showNotes: false,
    groupByCategory: true,
    groupByDate: false,
  },
  kitchen_sheet: {
    name: { en: "Kitchen Sheet", es: "Hoja de Cocina" },
    icon: ChefHat,
    showPrices: false,
    showQuantity: true,
    showSubtotals: false,
    showTotals: false,
    showTerms: false,
    showNotes: true,
    groupByCategory: true,
    groupByDate: true,
    filterItemTypes: ["Food"],
  },
  mise_en_place: {
    name: { en: "Mise en Place", es: "Mise en Place" },
    icon: Utensils,
    showPrices: false,
    showQuantity: true,
    showSubtotals: false,
    showTotals: false,
    showTerms: false,
    showNotes: true,
    groupByCategory: true,
    groupByDate: true,
    filterItemTypes: ["Food"],
  },
  packing_list: {
    name: { en: "Packing List", es: "Lista de Montaje" },
    icon: Package,
    showPrices: false,
    showQuantity: true,
    showSubtotals: false,
    showTotals: false,
    showTerms: false,
    showNotes: true,
    groupByCategory: true,
    groupByDate: true,
  },
  menu: {
    name: { en: "Menu", es: "Menú" },
    icon: MenuSquare,
    showPrices: false,
    showQuantity: false,
    showSubtotals: false,
    showTotals: false,
    showTerms: false,
    showNotes: false,
    groupByCategory: true,
    groupByDate: false,
    filterItemTypes: ["Food"],
    showOnlyNames: true,
  },
};

export default function DocumentPreview({ 
  eventId, 
  event, 
  proposal, 
  client,
  documentType = "proposal",
  onClose 
}) {
  const { language } = useLanguage();
  const printRef = useRef();
  const [company, setCompany] = useState(null);
  const [categories, setCategories] = useState([]);
  const [template, setTemplate] = useState(null);
  const [selectedDocType, setSelectedDocType] = useState(documentType);
  
  const config = DOCUMENT_CONFIGS[selectedDocType];

  // Currency formatting based on company settings
  const CURRENCY_SYMBOLS = {
    USD: "$",
    EUR: "€",
    MXN: "$",
    COP: "$",
    ARS: "$",
    CLP: "$",
    PEN: "S/",
    DOP: "RD$",
    GBP: "£",
    BRL: "R$",
    CAD: "C$",
    AUD: "A$",
    JPY: "¥",
    CNY: "¥",
    INR: "₹",
    CHF: "Fr.",
    KRW: "₩"
  };

  const formatCurrency = (amount) => {
    const currency = company?.currency || "USD";
    return buildCurrencyFormatter(currency)(amount);
  };

  // Get currency code for display
  const getCurrencyCode = () => company?.currency || "USD";

  useEffect(() => {
    fetchCompany();
    fetchCategories();
    fetchTemplate();
  }, [selectedDocType]);

  const fetchCompany = async () => {
    try {
      const response = await axios.get(`${API}/settings/company`, { withCredentials: true });
      setCompany(response.data);
    } catch (error) {
      console.error("Failed to fetch company:", error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API}/settings/categories`, { withCredentials: true });
      setCategories(response.data);
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  };

  const fetchTemplate = async () => {
    try {
      const response = await axios.get(`${API}/settings/document-templates`, { withCredentials: true });
      const templates = response.data;
      const found = templates.find(t => t.template_type.toLowerCase().includes(selectedDocType.replace(/_/g, '')));
      setTemplate(found);
    } catch (error) {
      console.error("Failed to fetch template:", error);
    }
  };

  const getCategoryName = (categoryId) => {
    const cat = categories.find(c => c.category_id === categoryId);
    return cat ? (language === "es" ? cat.name_es || cat.name : cat.name) : "Other";
  };

  // Operational documents (Kitchen Sheet, Packing List, BEO, Mise en Place)
  // are organized for kitchen/ops staff, NOT clients. They want to see the
  // full prep list per service slot (tanda) instead of split by menu course.
  const OPERATIONAL_DOC_TYPES = ["kitchen_sheet", "packing_list", "beo", "mise_en_place"];
  const isOperationalDoc = OPERATIONAL_DOC_TYPES.includes(selectedDocType);

  // Group items by category and optionally by date
  const groupItems = () => {
    if (!proposal?.items) return {};
    
    // Build the item_type → ordinal map from the company's configured order
    // (Settings → Catalogs → Item Types). Items whose type is unknown (deleted
    // or legacy) sort to the end but still keep their relative sort_order.
    const typeOrder = {};
    (company?.proposal_item_types || []).forEach((t, idx) => {
      typeOrder[t.type_key] = idx;
    });
    const typeOrdinal = (t) => (t in typeOrder ? typeOrder[t] : 999);
    
    // Sort items first by item_type (matching the editor's tabs / configured
    // order) and then by sort_order — so the PDF mirrors what the user sees.
    let items = [...proposal.items].sort((a, b) => {
      const ta = typeOrdinal(a.item_type || "");
      const tb = typeOrdinal(b.item_type || "");
      if (ta !== tb) return ta - tb;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
    
    // Filter by item types if configured
    if (config.filterItemTypes) {
      items = items.filter(item => config.filterItemTypes.includes(item.item_type));
    }
    
    const grouped = {};
    
    items.forEach(item => {
      // Group key: date (if multi-day)
      let dateKey = "all";
      if (config.groupByDate && item.event_date) {
        dateKey = item.event_date;
      }

      // Operational docs (kitchen sheet, packing list, BEO, mise en place):
      // group by service time (tanda) so the kitchen sees one consolidated
      // prep list per slot, matching the Ciano-style layout. Items within
      // the tanda stay sorted by item_type (Bebidas → Bocadillos → ...).
      // Client-facing docs keep the original section/category grouping.
      let sectionKey;
      if (isOperationalDoc) {
        sectionKey = item.section_time || "__no_time__";
      } else {
        sectionKey = item.section_title || item.category_id || item.item_type || "other";
      }
      
      if (!grouped[dateKey]) {
        grouped[dateKey] = {};
      }
      if (!grouped[dateKey][sectionKey]) {
        grouped[dateKey][sectionKey] = {
          items: [],
          section_title: isOperationalDoc ? null : item.section_title,
          section_time: item.section_time,
          event_date: item.event_date,
          is_tanda: isOperationalDoc,
        };
      }
      
      grouped[dateKey][sectionKey].items.push(item);
      // Update section info if this item has more specific info
      if (!isOperationalDoc && item.section_title) {
        grouped[dateKey][sectionKey].section_title = item.section_title;
      }
      if (item.section_time) {
        grouped[dateKey][sectionKey].section_time = item.section_time;
      }
    });

    // For operational docs, sort tandas chronologically by section_time
    // within each day so the kitchen reads them top → bottom in service order.
    if (isOperationalDoc) {
      Object.keys(grouped).forEach((dKey) => {
        const sorted = Object.entries(grouped[dKey]).sort(([, a], [, b]) => {
          const ta = a.section_time || "99:99";
          const tb = b.section_time || "99:99";
          return ta.localeCompare(tb);
        });
        grouped[dKey] = Object.fromEntries(sorted);
      });
    }

    return grouped;
  };

  // Calculate subtotals by item type
  const calculateSubtotals = () => {
    if (!proposal?.items) return {};
    
    const subtotals = {};
    proposal.items.forEach(item => {
      const type = item.item_type || "Other";
      if (!subtotals[type]) {
        subtotals[type] = { count: 0, total: 0 };
      }
      subtotals[type].count += 1;
      subtotals[type].total += item.total_price || 0;
    });
    
    return subtotals;
  };

  const styleVariant = template?.style_variant || "classic";
  const primaryColor = company?.primary_color || '#3A4D3F';
  const pdfDensity = template?.pdf_density || "normal"; // compact | normal | spacious

  // Density CSS variables — applied at the document root and consumed by
  // section/table padding rules in `printStyles`. Compact tightens spacing
  // and shrinks the body font slightly; spacious opens everything up.
  const densityCSS = {
    compact: {
      base: 11,
      lineHeight: 1.35,
      sectionGapTop: 12,
      sectionGapBottom: 4,
      cellY: 4, cellX: 8,
      pageMargin: "10mm 10mm",
    },
    normal: {
      base: 13,
      lineHeight: 1.5,
      sectionGapTop: 18,
      sectionGapBottom: 8,
      cellY: 8, cellX: 12,
      pageMargin: "14mm 12mm",
    },
    spacious: {
      base: 14,
      lineHeight: 1.7,
      sectionGapTop: 26,
      sectionGapBottom: 12,
      cellY: 12, cellX: 16,
      pageMargin: "18mm 14mm",
    },
  }[pdfDensity] || null;
  const density = densityCSS || {
    base: 13, lineHeight: 1.5, sectionGapTop: 18, sectionGapBottom: 8,
    cellY: 8, cellX: 12, pageMargin: "14mm 12mm",
  };

  // CSS for each visual variant — applied to both preview and print
  const variantCSS = `
    /* === BASE === */
    .doc-root { color: #1a1a1a; }
    .doc-root .section-title { font-weight: 600; }
    .doc-root .text-right { text-align: right; }

    /* === CLASSIC (default, current look) === */
    .doc-root[data-style-variant="classic"] .header { border-bottom: 2px solid ${primaryColor}; padding-bottom: 20px; margin-bottom: 20px; }
    .doc-root[data-style-variant="classic"] .section-title { font-size: 16px; color: ${primaryColor}; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
    .doc-root[data-style-variant="classic"] table th { background: ${primaryColor}; color: white; padding: 8px; }
    .doc-root[data-style-variant="classic"] .total-row { font-size: 18px; font-weight: bold; border-top: 2px solid ${primaryColor}; }
    .doc-root[data-style-variant="classic"] .catering-summary table { border: 1px solid #ddd; }

    /* === MINIMAL CÁLIDO (Notion-style) === */
    .doc-root[data-style-variant="minimal"] {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #2d3748; background: #fdfcfa;
    }
    .doc-root[data-style-variant="minimal"] .header {
      border-bottom: none; padding-bottom: 32px; margin-bottom: 32px;
      background: linear-gradient(180deg, ${primaryColor}08 0%, transparent 100%);
      border-radius: 16px 16px 0 0; padding: 24px;
    }
    .doc-root[data-style-variant="minimal"] .company-name { font-weight: 700; letter-spacing: -0.02em; }
    .doc-root[data-style-variant="minimal"] .section-title {
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em;
      color: #94a3b8; border-bottom: none; margin-bottom: 16px;
    }
    .doc-root[data-style-variant="minimal"] table { border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .doc-root[data-style-variant="minimal"] table th {
      background: #f8fafc; color: #475569; padding: 12px 16px;
      font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; border: none;
    }
    .doc-root[data-style-variant="minimal"] table td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; }
    .doc-root[data-style-variant="minimal"] table tr:nth-child(even) td { background: #fafbfc; }
    .doc-root[data-style-variant="minimal"] .total-row {
      background: ${primaryColor}; color: white; padding: 16px 20px; border-radius: 12px;
      font-weight: 600; border: none; margin-top: 16px;
    }
    .doc-root[data-style-variant="minimal"] .catering-summary table { border-radius: 12px; border: 1px solid #e2e8f0; }
    .doc-root[data-style-variant="minimal"] .date-group { background: #fafbfc; border-radius: 12px; padding: 16px; }

    /* === EDITORIAL MODERNO (revista gourmet) === */
    .doc-root[data-style-variant="editorial"] {
      font-family: 'Georgia', 'Playfair Display', serif;
      color: #1c1917;
    }
    .doc-root[data-style-variant="editorial"] .header {
      background: ${primaryColor}; color: white;
      margin: -32px -32px 40px -32px; padding: 56px 48px;
      border-bottom: none; border-radius: 0;
    }
    .doc-root[data-style-variant="editorial"] .header * { color: white !important; }
    .doc-root[data-style-variant="editorial"] .header .info-label,
    .doc-root[data-style-variant="editorial"] .header .text-muted-foreground { color: rgba(255,255,255,0.8) !important; }
    .doc-root[data-style-variant="editorial"] .company-name {
      font-family: 'Georgia', serif; font-size: 36px; font-weight: normal; letter-spacing: -0.02em;
    }
    .doc-root[data-style-variant="editorial"] h2 {
      font-family: 'Georgia', serif; font-size: 48px; font-weight: normal; letter-spacing: -0.03em;
    }
    .doc-root[data-style-variant="editorial"] .section-title {
      font-family: 'Inter', sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em;
      color: ${primaryColor}; border-bottom: none; position: relative; padding-bottom: 12px;
    }
    .doc-root[data-style-variant="editorial"] .section-title::after {
      content: ''; position: absolute; bottom: 0; left: 0; width: 40px; height: 2px; background: ${primaryColor};
    }
    .doc-root[data-style-variant="editorial"] table { border: none; }
    .doc-root[data-style-variant="editorial"] table th {
      background: transparent; color: ${primaryColor}; border-bottom: 2px solid ${primaryColor};
      padding: 10px 0; font-family: 'Inter', sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em;
    }
    .doc-root[data-style-variant="editorial"] table td {
      padding: 14px 0; border-bottom: 1px solid #e7e5e4; font-size: 15px;
    }
    .doc-root[data-style-variant="editorial"] .total-row {
      font-family: 'Georgia', serif; font-size: 28px; font-weight: normal;
      border-top: 3px double ${primaryColor}; padding-top: 16px; color: ${primaryColor};
    }
    .doc-root[data-style-variant="editorial"] .catering-summary table th,
    .doc-root[data-style-variant="editorial"] .catering-summary table td { border: none; }
    .doc-root[data-style-variant="editorial"] .catering-summary table {
      border-top: 2px solid ${primaryColor}; border-bottom: 2px solid ${primaryColor};
    }

    /* === HOSPITALITY LUJO (hotel 5★) === */
    .doc-root[data-style-variant="luxury"] {
      font-family: 'Cormorant Garamond', 'Georgia', serif;
      color: #1c1917; background: #0a0a0a;
      padding: 0 !important;
    }
    .doc-root[data-style-variant="luxury"] > * { background: white; padding: 32px; }
    .doc-root[data-style-variant="luxury"] .header {
      background: #0a0a0a; color: #d4af37;
      margin: -32px -32px 40px -32px; padding: 64px 48px;
      border-bottom: 1px solid #d4af37; border-radius: 0; position: relative;
    }
    .doc-root[data-style-variant="luxury"] .header::after {
      content: ''; position: absolute; bottom: -1px; left: 50%; transform: translateX(-50%);
      width: 60px; height: 1px; background: #d4af37; box-shadow: 0 2px 0 #d4af37;
    }
    .doc-root[data-style-variant="luxury"] .header * { color: #f5f5f4 !important; }
    .doc-root[data-style-variant="luxury"] .header .company-name { color: #d4af37 !important; }
    .doc-root[data-style-variant="luxury"] .company-name {
      font-family: 'Cormorant Garamond', serif; font-size: 32px; font-weight: 300;
      letter-spacing: 0.15em; text-transform: uppercase;
    }
    .doc-root[data-style-variant="luxury"] h2, .doc-root[data-style-variant="luxury"] h3 {
      font-family: 'Cormorant Garamond', serif; font-weight: 300; letter-spacing: 0.1em; text-transform: uppercase;
    }
    .doc-root[data-style-variant="luxury"] .section-title {
      font-family: 'Cormorant Garamond', serif; font-size: 14px; font-weight: 400;
      letter-spacing: 0.3em; text-transform: uppercase; color: #1c1917;
      text-align: center; border-bottom: none; padding: 16px 0;
      position: relative;
    }
    .doc-root[data-style-variant="luxury"] .section-title::before,
    .doc-root[data-style-variant="luxury"] .section-title::after {
      content: '◆'; color: #d4af37; margin: 0 16px; font-size: 8px; vertical-align: middle;
    }
    .doc-root[data-style-variant="luxury"] table th {
      background: transparent; color: #1c1917; border-top: 1px solid #1c1917; border-bottom: 1px solid #1c1917;
      padding: 12px 8px; font-family: 'Cormorant Garamond', serif; font-size: 12px;
      text-transform: uppercase; letter-spacing: 0.2em; font-weight: 500;
    }
    .doc-root[data-style-variant="luxury"] table td {
      padding: 14px 8px; border-bottom: 1px solid #e7e5e4; font-size: 15px; font-family: 'Cormorant Garamond', serif;
    }
    .doc-root[data-style-variant="luxury"] .total-row {
      background: #0a0a0a; color: #d4af37 !important; padding: 24px;
      font-family: 'Cormorant Garamond', serif; font-size: 28px; font-weight: 300; letter-spacing: 0.1em;
      text-transform: uppercase; text-align: center; margin-top: 24px; border: none;
    }
    .doc-root[data-style-variant="luxury"] .total-row * { color: #d4af37 !important; }
    .doc-root[data-style-variant="luxury"] .catering-summary table { border-top: 1px solid #1c1917; border-bottom: 1px solid #1c1917; }
  `;

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    // Pixel-perfect strategy: instead of hand-building a separate HTML string
    // (which always drifted from the preview), we CLONE the preview DOM and
    // copy every <link rel="stylesheet"> + <style> tag from the parent doc
    // into the iframe head. Browsers cache same-origin stylesheets so this
    // is effectively instant. The result: the printed PDF looks identical
    // to what the user sees on screen.
    const headStyles = Array.from(
      document.head.querySelectorAll('link[rel="stylesheet"], style')
    ).map((node) => node.outerHTML).join("\n");

    const previewHtml = printContent.outerHTML;

    const html = `<!DOCTYPE html>
<html lang="${language}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=794" />
    <title>${config.name[language]} - ${event?.name || "Document"}</title>
    ${headStyles}
    <style>
      /* Print-only overrides applied on top of the cloned app CSS. These
         tune the page geometry per the user's selected pdf_density setting
         and remove the browser-injected URL/footer from the print. */
      @page { margin: ${density.pageMargin}; size: auto; }
      html, body { margin: 0; background: #fff; }
      body { font-size: ${density.base}px; line-height: ${density.lineHeight}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      /* Force the print viewport to behave like an A4-width desktop so
         responsive utilities (Tailwind grid-cols-2, gap-*, etc.) resolve
         to the same layout the user sees in the on-screen preview. Without
         this, the iframe reports its physical 0×0 size to media queries and
         layout collapses to mobile — which is what caused the extra vertical
         spacing between sections. */
      html { min-width: 794px; }
      body { width: 794px; margin: 0 auto; }
      /* Operational docs: per-tanda mini header. Sits at the top of each
         tanda's page (each .category-section starts on a new page) so every
         printed sheet has client + venue + guest context. */
      .doc-root[data-operational="true"] .tanda-mini-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 6px 0 8px;
        margin-bottom: 0;
        border-bottom: 1px solid #ddd;
        font-size: 10px;
        color: #444;
      }
      .doc-root[data-operational="true"] .tanda-mini-header .tmh-left { display: flex; align-items: center; gap: 8px; }
      .doc-root[data-operational="true"] .tanda-mini-header .tmh-logo { max-height: 18px !important; max-width: 80px !important; width: auto; height: auto; object-fit: contain; }
      .doc-root[data-operational="true"] .tanda-mini-header .tmh-title { font-weight: 600; font-size: 11px; line-height: 1.1; }
      .doc-root[data-operational="true"] .tanda-mini-header .tmh-sub { font-size: 9.5px; color: #555; line-height: 1.1; }
      .doc-root[data-operational="true"] .tanda-mini-header .tmh-right { text-align: right; font-size: 9.5px; line-height: 1.3; }
      /* Per-day logistics box rendered inside the table's thead so it repeats
         with the rest of the tanda header on every printed page. */
      .doc-root[data-operational="true"] .tanda-daylog {
        padding: 6px 0 8px;
        font-size: 10px;
        color: #333;
        border-bottom: 1px solid #ddd;
      }
      .doc-root[data-operational="true"] .tanda-daylog .tdl-row { padding: 1px 0; }
      .doc-root[data-operational="true"] .tanda-daylog .tdl-row strong { font-weight: 600; color: #111; }
      /* Tanda title bar (rendered inside the table's thead so it repeats on
         every page when the tanda overflows). */
      .doc-root[data-operational="true"] .tanda-title-bar {
        padding: 8px 0 6px;
        border-bottom: 1px solid;
        font-size: 13px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .doc-root[data-operational="true"] .tanda-header-row th { border: 0 !important; }
      /* Operational docs: shrink the main page-1 logo aggressively so the
         first page isn't dominated by branding. */
      /* Logo cap — keep brand logos small and discreet across ALL document
         types (proposals, invoices, kitchen sheets, packing lists, etc.).
         The template's logo_size choice still works as a relative hint, but
         the absolute ceiling is enforced here. */
      .doc-root .doc-logo { max-height: 32px !important; max-width: 130px !important; width: auto !important; height: auto !important; object-fit: contain !important; }
      .doc-root[data-operational="true"] .doc-logo { max-height: 24px !important; max-width: 100px !important; }
      /* Keep small atomic units together; the date-group can break across pages. */
      tr, .category-section, .notes, .terms, .payment-info, .bank-details, .subtotals { page-break-inside: avoid; break-inside: avoid; }
      /* Operational docs: a long tanda is allowed to span multiple pages so
         long kitchen lists don't get squeezed. The thead repeats on each page. */
      .doc-root[data-operational="true"] .items-section .category-section { page-break-inside: auto !important; break-inside: auto !important; }
      .date-title, .section-title, h4 { page-break-after: avoid; break-after: avoid; }
      /* Operational docs (Kitchen Sheet / Packing List / Mise en Place): one
         tanda per page so each kitchen shift can grab their sheet. The very
         first tanda of the very first day stays on page 1 (no blank first page). */
      .doc-root[data-operational="true"] .items-section .category-section {
        page-break-before: always !important;
        break-before: page !important;
      }
      .doc-root[data-operational="true"] .items-section .date-group:first-child .category-section:first-child {
        page-break-before: avoid !important;
        break-before: avoid !important;
      }
      thead { display: table-header-group; }
      /* Hide the print toolbar (selectors, buttons) if it slipped into the clone. */
      [data-print-hidden="true"] { display: none !important; }
      /* The fixed positioning of the preview container would break printing — flatten it. */
      .fixed.inset-0 { position: static !important; background: #fff !important; backdrop-filter: none !important; }
      .container { max-width: none !important; padding: 0 !important; }
    </style>
  </head>
  <body>${previewHtml}</body>
</html>`;

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    // Give the iframe REAL dimensions (A4 width @ 96dpi ≈ 794px). A 0×0
    // iframe forces Tailwind responsive utilities to resolve at width=0,
    // which collapses `grid-cols-2` and multiplies vertical gap between
    // sections. With a proper width the print output matches the preview.
    iframe.style.width = "794px";
    iframe.style.height = "1123px";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.zIndex = "-1";
    document.body.appendChild(iframe);

    const cleanup = () => {
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1500);
    };

    const triggerPrint = () => {
      const win = iframe.contentWindow;
      if (!win) { cleanup(); return; }
      try { win.focus(); } catch (_e) { /* iOS may throw */ }
      try { win.print(); } catch (_e) { /* swallow */ }
    };

    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) { cleanup(); return; }
      doc.open();
      doc.write(html);
      doc.close();

      // Wait for cloned stylesheets + fonts + images to finish loading in
      // the iframe. Without this, print() can fire before Tailwind CSS is
      // ready, which strips utility classes and blows up the spacing.
      const win = iframe.contentWindow;
      const iframeDoc = win?.document;
      const waitForReady = async () => {
        try {
          if (iframeDoc?.fonts?.ready) {
            await iframeDoc.fonts.ready;
          }
          // Wait for all <link rel="stylesheet"> to load
          const links = Array.from(iframeDoc?.querySelectorAll('link[rel="stylesheet"]') || []);
          await Promise.all(links.map((link) => new Promise((resolve) => {
            if (link.sheet) return resolve();
            link.addEventListener("load", resolve, { once: true });
            link.addEventListener("error", resolve, { once: true });
            // Safety timeout: don't hang forever if a stylesheet stalls
            setTimeout(resolve, 800);
          })));
          // One extra RAF so layout can settle after CSS applies
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        } catch (_e) {
          /* best-effort */
        }
        triggerPrint();
      };
      waitForReady();
    } catch (_e) {
      /* swallow */
    } finally {
      cleanup();
    }
  };

  const groupedItems = groupItems();
  const subtotals = calculateSubtotals();
  const docName = config.name[language];

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    // Use parseDateOnly so YYYY-MM-DD doesn't get interpreted as midnight UTC
    // (which would render the previous day in any UTC-X timezone).
    const d = parseDateOnly(dateStr);
    if (!d) return dateStr;
    try {
      return d.toLocaleDateString(language === "es" ? "es-ES" : "en-US", {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-auto">
      <div className="container max-w-4xl mx-auto py-8">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6 sticky top-0 z-10 bg-background py-4 border-b">
          <div className="flex items-center gap-4">
            <Select value={selectedDocType} onValueChange={setSelectedDocType}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOCUMENT_CONFIGS).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        {cfg.name[language]}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            
            <Badge variant="outline">
              {proposal?.proposal_number}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" />
              {language === "es" ? "Imprimir" : "Print"}
            </Button>
            <Button variant="outline" onClick={onClose}>
              {language === "es" ? "Cerrar" : "Close"}
            </Button>
          </div>
        </div>

        {/* Document Preview */}
        <Card className="shadow-lg">
          <style dangerouslySetInnerHTML={{ __html: variantCSS }} />
          <CardContent className="p-8 doc-root" data-style-variant={styleVariant} data-operational={isOperationalDoc ? "true" : "false"} ref={printRef}>
            {/* Header */}
            <div className="header border-b-2 pb-6 mb-6" style={{ borderColor: company?.primary_color || '#3A4D3F' }}>
              {/* Logo block — lifted above the two-column layout so it can be
                  left/center/right-aligned independently of the text columns. */}
              {template?.show_logo !== false && company?.logo_url && (() => {
                // Operational docs (kitchen_sheet, packing_list, BEO, mise_en_place)
                // deben mostrar el logo pequeño y discreto — la primera página
                // debe estar dominada por el contenido operativo, no la marca.
                const sizeMap = isOperationalDoc
                  ? { small: 20, medium: 26, large: 34 }
                  : { small: 40, medium: 56, large: 80 };
                const maxH = sizeMap[template?.logo_size] || sizeMap.medium;
                const maxW = isOperationalDoc ? 110 : 240;
                const pos = template?.logo_position || "left";
                const justifyMap = { left: "flex-start", center: "center", right: "flex-end" };
                return (
                  <div
                    className="doc-logo-wrap mb-3"
                    data-logo-position={pos}
                    style={{ display: "flex", justifyContent: justifyMap[pos] || "flex-start" }}
                  >
                    <img
                      src={company.logo_url}
                      alt={company.name}
                      className="doc-logo"
                      data-logo-size={template?.logo_size || "medium"}
                      style={{ maxHeight: `${maxH}px`, maxWidth: `${maxW}px`, width: 'auto', height: 'auto', objectFit: 'contain' }}
                    />
                  </div>
                );
              })()}
              {/* Tagline — short slogan rendered directly under the logo, aligned to match. */}
              {(template?.tagline_es || template?.tagline_en) && (() => {
                const pos = template?.logo_position || "left";
                const textAlignMap = { left: "left", center: "center", right: "right" };
                const tagline = language === "es"
                  ? (template.tagline_es || template.tagline_en)
                  : (template.tagline_en || template.tagline_es);
                return (
                  <p
                    className="doc-tagline mb-3 text-xs italic text-muted-foreground"
                    data-logo-position={pos}
                    style={{ textAlign: textAlignMap[pos] || "left", color: company?.primary_color || '#3A4D3F', opacity: 0.85 }}
                  >
                    {tagline}
                  </p>
                );
              })()}
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="company-name text-2xl font-bold" style={{ color: company?.primary_color || '#3A4D3F' }}>
                    {company?.name || "Company Name"}
                  </h1>
                  {/* Company Address - controlled by template */}
                  {template?.show_company_address !== false && company?.address && (
                    <p className="text-sm text-muted-foreground mt-1">{company.address}</p>
                  )}
                  {/* Tax ID - controlled by template */}
                  {template?.show_tax_id !== false && company?.tax_id && (
                    <p className="text-sm text-muted-foreground">RFC: {company.tax_id}</p>
                  )}
                </div>
                <div className="text-right">
                  <h2 className="text-xl font-semibold text-foreground">{docName}</h2>
                  <p className="text-sm text-muted-foreground font-mono">
                    {proposal?.proposal_number}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateOnly(new Date(), language)}
                  </p>
                </div>
              </div>
              
              {/* Event Title */}
              <h3 className="event-name text-xl font-semibold mt-4 text-foreground">
                {event?.name}
              </h3>
              
              {/* Client & Event Info Grid */}
              <div className="info-grid grid grid-cols-2 gap-4 mt-4 text-sm">
                <div className="space-y-2">
                  <div className="info-item flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span className="info-label font-medium">{language === "es" ? "Cliente:" : "Client:"}</span>
                    <span>{client?.display_name || event?.client_name || "N/A"}</span>
                  </div>
                  <div className="info-item flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span className="info-label font-medium">{language === "es" ? "Email:" : "Email:"}</span>
                    <span>{client?.email || "N/A"}</span>
                  </div>
                  <div className="info-item flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span className="info-label font-medium">{language === "es" ? "Teléfono:" : "Phone:"}</span>
                    <span>{client?.phone || "N/A"}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="info-item flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="info-label font-medium">{language === "es" ? "Fecha:" : "Date:"}</span>
                    <span>{formatDate(event?.event_date)}</span>
                  </div>
                  <div className="info-item flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="info-label font-medium">{language === "es" ? "Lugar:" : "Venue:"}</span>
                    <span>{event?.venue || "N/A"}</span>
                  </div>
                  <div className="info-item flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span className="info-label font-medium">{language === "es" ? "Invitados:" : "Guests:"}</span>
                    <span>{event?.guest_count || "N/A"}</span>
                  </div>
                </div>
              </div>

              {/* Template Header Text */}
              {template?.header_text_en && (
                <p className="mt-4 text-sm text-muted-foreground whitespace-pre-wrap">
                  {language === "es" ? template.header_text_es || template.header_text_en : template.header_text_en}
                </p>
              )}
            </div>

            {/* RESUMEN DE CATERING - Per-Date Logistics. For operational docs
                (kitchen sheet / packing / mise) we skip this global table —
                each tanda already shows its day's logistic row in its own
                header so the chef has all the context per page. */}
            {!isOperationalDoc && (proposal?.day_logistics?.length > 0) && (
              <div className="catering-summary mb-6" data-testid="doc-day-logistics">
                <h4
                  className="section-title text-sm font-semibold uppercase tracking-wide mb-3"
                  style={{ color: company?.primary_color || '#3A4D3F' }}
                >
                  {language === "es" ? "Resumen de Catering" : "Catering Summary"}
                </h4>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium border-b">{language === "es" ? "Fecha" : "Date"}</th>
                        <th className="text-left px-3 py-2 font-medium border-b">{language === "es" ? "Horario" : "Time"}</th>
                        <th className="text-left px-3 py-2 font-medium border-b">{language === "es" ? "Invitados" : "Guests"}</th>
                        <th className="text-left px-3 py-2 font-medium border-b">{language === "es" ? "Dirección" : "Address"}</th>
                        <th className="text-left px-3 py-2 font-medium border-b">{language === "es" ? "Instrucciones" : "Instructions"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proposal.day_logistics.map((d, idx) => (
                        <tr key={idx} className="border-b last:border-b-0">
                          <td className="px-3 py-2 font-medium whitespace-nowrap">{d.event_date ? formatDate(d.event_date) : "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                            {d.delivery_time || "—"}{d.delivery_end_time ? ` – ${d.delivery_end_time}` : ""}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{d.guest_count ?? "—"}</td>
                          <td className="px-3 py-2">{d.address || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{d.instructions || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Items by Date and Section */}
            <div className="items-section">
              {Object.entries(groupedItems).map(([dateKey, sectionGroups]) => (
                <div key={dateKey} className="date-group mb-6">
                  {/* Date Header (if multi-day) — hidden for operational docs
                      since each tanda header already shows the date. */}
                  {dateKey !== "all" && config.groupByDate && !isOperationalDoc && (
                    <div className="date-title bg-muted/50 p-3 rounded-t-lg border-b">
                      <Calendar className="w-4 h-4 inline mr-2" />
                      <span className="font-semibold">{formatDate(dateKey)}</span>
                    </div>
                  )}
                  
                  {/* Sections */}
                  {Object.entries(sectionGroups).map(([sectionKey, sectionData]) => {
                    const items = sectionData.items || sectionData;
                    const sectionTitle = sectionData.section_title;
                    const sectionTime = sectionData.section_time;
                    const sectionDate = sectionData.event_date;
                    const isTanda = sectionData.is_tanda;

                    // Single-line "Lun, 25/05/2026 — 08:15" header for operational docs.
                    const tandaHeader = (() => {
                      if (!isTanda) return null;
                      const d = sectionDate ? parseDateOnly(sectionDate) : null;
                      const dateStr = d
                        ? d.toLocaleDateString(language === "es" ? "es" : "en", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })
                        : (sectionDate || "");
                      const timeStr = sectionTime || "";
                      if (dateStr && timeStr) return `${dateStr} — ${timeStr}`;
                      return dateStr || timeStr || (language === "es" ? "Sin horario" : "No time");
                    })();

                    // Per-tanda day logistics — look up the row matching this
                    // tanda's date from proposal.day_logistics so the chef sees
                    // address/instructions/guests for THIS day on every page.
                    const dayLog = isTanda && sectionDate
                      ? (proposal?.day_logistics || []).find(
                          (d) => d.event_date && (d.event_date === sectionDate || d.event_date?.startsWith(sectionDate?.slice(0, 10)))
                        )
                      : null;

                    return (
                    <div key={sectionKey} className="category-section mb-4">
                      {/* For tandas (operational docs), the mini-header and
                          tanda title live INSIDE the items table's <thead> so
                          they repeat on every printed page if the tanda spans
                          multiple pages (browsers repeat <thead> by default).
                          For non-tanda sections, render them above the table. */}
                      {!isTanda && (
                        <div className="section-title border-b pb-2 mb-3" style={{ borderColor: company?.primary_color || '#3A4D3F' }}>
                          <h4 className="text-sm font-semibold" style={{ color: company?.primary_color || '#3A4D3F' }}>
                            {sectionTitle || getCategoryName(sectionKey)}
                          </h4>
                          {(sectionDate || sectionTime) && (
                            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                              {sectionDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {(() => {
                                    const d = parseDateOnly(sectionDate);
                                    return d
                                      ? d.toLocaleDateString(language === "es" ? "es" : "en", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })
                                      : sectionDate;
                                  })()}
                                </span>
                              )}
                              {sectionTime && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {sectionTime}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Menu Style (only names) */}
                      {config.showOnlyNames ? (
                        <div className="space-y-1 pl-4">
                          {(Array.isArray(items) ? items : []).map((item, idx) => (
                            <p key={idx} className="menu-item text-sm py-1 border-b border-dotted border-muted">
                              {item.description}
                            </p>
                          ))}
                        </div>
                      ) : (
                        /* Table Style */
                        <table className="w-full text-sm">
                          <thead>
                            {/* Tanda header rows (operational docs only) —
                                Live in <thead> so browsers repeat them on
                                every page when a tanda spans pages. */}
                            {isTanda && (
                              <>
                                <tr className="tanda-header-row" data-print-tanda="mini">
                                  <th colSpan={10} style={{ padding: 0, background: "transparent" }}>
                                    <div className="tanda-mini-header" aria-hidden="true">
                                      <div className="tmh-left">
                                        {company?.logo_url && (
                                          <img src={company.logo_url} alt="" className="tmh-logo" />
                                        )}
                                        <div className="tmh-titles">
                                          <div className="tmh-title">{config.name[language]}</div>
                                          <div className="tmh-sub">{client?.display_name || client?.name || event?.name || ""}</div>
                                        </div>
                                      </div>
                                      <div className="tmh-right">
                                        {event?.venue && <div><strong>{language === "es" ? "Lugar:" : "Venue:"}</strong> {event.venue}</div>}
                                        {event?.guest_count != null && <div><strong>{language === "es" ? "Invitados:" : "Guests:"}</strong> {event.guest_count}</div>}
                                      </div>
                                    </div>
                                  </th>
                                </tr>
                                <tr className="tanda-header-row" data-print-tanda="title">
                                  <th colSpan={10} style={{ padding: 0, background: "transparent", textAlign: "left" }}>
                                    <div className="tanda-title-bar" style={{ borderColor: company?.primary_color || '#3A4D3F' }}>
                                      <Clock className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                                      <span style={{ color: company?.primary_color || '#3A4D3F' }}>{tandaHeader}</span>
                                    </div>
                                  </th>
                                </tr>
                                {dayLog && (
                                  <tr className="tanda-header-row" data-print-tanda="daylog">
                                    <th colSpan={10} style={{ padding: 0, background: "transparent", textAlign: "left", fontWeight: "normal" }}>
                                      <div className="tanda-daylog">
                                        {(dayLog.delivery_time || dayLog.delivery_end_time) && (
                                          <div className="tdl-row">
                                            <strong>{language === "es" ? "Horario:" : "Time:"}</strong>{" "}
                                            <span>{dayLog.delivery_time || "—"}{dayLog.delivery_end_time ? ` – ${dayLog.delivery_end_time}` : ""}</span>
                                          </div>
                                        )}
                                        {dayLog.guest_count != null && (
                                          <div className="tdl-row">
                                            <strong>{language === "es" ? "Invitados:" : "Guests:"}</strong>{" "}
                                            <span>{dayLog.guest_count}</span>
                                          </div>
                                        )}
                                        {dayLog.address && (
                                          <div className="tdl-row">
                                            <strong>{language === "es" ? "Dirección:" : "Address:"}</strong>{" "}
                                            <span>{dayLog.address}</span>
                                          </div>
                                        )}
                                        {dayLog.instructions && (
                                          <div className="tdl-row">
                                            <strong>{language === "es" ? "Instrucciones:" : "Instructions:"}</strong>{" "}
                                            <span>{dayLog.instructions}</span>
                                          </div>
                                        )}
                                      </div>
                                    </th>
                                  </tr>
                                )}
                              </>
                            )}
                            <tr style={{ backgroundColor: company?.primary_color || '#3A4D3F', color: 'white' }}>
                              {/* Checkbox column for PackingList/KitchenSheet */}
                              {template?.show_checkboxes !== false && (selectedDocType === "packing_list" || selectedDocType === "kitchen_sheet") && (
                                <th className="px-2 py-2 w-10">✓</th>
                              )}
                              {/* Quantity - respect template setting */}
                              {config.showQuantity && template?.show_quantities !== false && (
                                <th className="px-3 py-2 text-left w-20">
                                  {language === "es" ? "Cant." : "Qty"}
                                </th>
                              )}
                              <th className="px-3 py-2 text-left">
                                {language === "es" ? "Ítem" : "Item"}
                              </th>
                              {/* Notes column - controlled by template */}
                              {template?.show_notes_column !== false && (selectedDocType === "packing_list" || selectedDocType === "kitchen_sheet") && (
                                <th className="px-3 py-2 text-left w-32">
                                  {language === "es" ? "Notas" : "Notes"}
                                </th>
                              )}
                              {config.showPrices && (
                                <>
                                  <th className="px-3 py-2 text-right w-24">
                                    {language === "es" ? "Precio" : "Price"}
                                  </th>
                                  <th className="px-3 py-2 text-right w-24">
                                    {language === "es" ? "Total" : "Total"}
                                  </th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {(Array.isArray(items) ? items : []).map((item, idx) => (
                              <tr key={idx} className={`border-b border-muted/50 hover:bg-muted/20 ${item.parent_item_id ? "child-item bg-muted/10" : ""}`}>
                                {/* Checkbox cell */}
                                {template?.show_checkboxes !== false && (selectedDocType === "packing_list" || selectedDocType === "kitchen_sheet") && (
                                  <td className="px-2 py-2 text-center">
                                    <span className="checkbox inline-block w-4 h-4 border border-gray-400 rounded-sm"></span>
                                  </td>
                                )}
                                {config.showQuantity && template?.show_quantities !== false && (
                                  <td className="px-3 py-2">{item.parent_item_id ? "" : item.quantity}</td>
                                )}
                                <td className="px-3 py-2">
                                  <span className={`font-medium ${item.parent_item_id ? "text-sm pl-4 text-muted-foreground" : ""}`}>
                                    {item.parent_item_id && <span className="opacity-60 mr-1">·</span>}
                                    {item.description}
                                  </span>
                                  {item.long_description && (
                                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug whitespace-pre-line">
                                      {item.long_description}
                                    </p>
                                  )}
                                  {(() => {
                                    const dt = item.discount_type || (item.discount_pct ? "percentage" : null);
                                    const dv = item.discount_value != null ? item.discount_value : item.discount_pct;
                                    if (!dv || dv <= 0) return null;
                                    const label = dt === "fixed"
                                      ? `${language === "es" ? "Descuento" : "Discount"} -$${fmtNum((dv))}`
                                      : `${language === "es" ? "Descuento" : "Discount"} -${Number(dv)}%`;
                                    return (
                                      <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                                        {label}
                                      </span>
                                    );
                                  })()}
                                  {item.tax_exempt && (
                                    <span className="inline-block mt-1 ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                                      {language === "es" ? "Sin impuesto" : "Tax exempt"}
                                    </span>
                                  )}
                                  {item.internal_notes && config.showNotes && !template?.show_notes_column && (
                                    <p className="text-xs text-muted-foreground mt-1 italic">
                                      📝 {item.internal_notes}
                                    </p>
                                  )}
                                </td>
                                {/* Notes column */}
                                {template?.show_notes_column !== false && (selectedDocType === "packing_list" || selectedDocType === "kitchen_sheet") && (
                                  <td className="px-3 py-2 text-sm text-muted-foreground">
                                    {item.internal_notes || ""}
                                  </td>
                                )}
                                {config.showPrices && (
                                  <>
                                    <td className="px-3 py-2 text-right font-mono">
                                      {item.parent_item_id ? "" : formatCurrency(item.unit_price)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono font-medium">
                                      {item.parent_item_id ? "" : formatCurrency(item.total_price)}
                                    </td>
                                  </>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                  })}
                </div>
              ))}
            </div>

            {/* Subtotals by Item Type */}
            {config.showSubtotals && Object.keys(subtotals).length > 0 && (
              <div className="subtotals bg-muted/30 p-4 rounded-lg mt-6">
                <h4 className="font-semibold mb-3">
                  {language === "es" ? "Resumen por Tipo" : "Summary by Type"}
                </h4>
                <div className="space-y-2">
                  {Object.entries(subtotals).map(([type, data]) => {
                    // Resolve the user-facing label from company config so the PDF
                    // honours Spanish/English labels configured in Settings →
                    // Templates → Proposal Item Types instead of the raw type_key.
                    const cfg = (company?.proposal_item_types || []).find(t => t.type_key === type);
                    const label = cfg
                      ? (language === "es" ? (cfg.label_es || cfg.label_en || type) : (cfg.label_en || cfg.label_es || type))
                      : type;
                    return (
                      <div key={type} className="flex justify-between text-sm">
                        <span>{label} ({data.count} {language === "es" ? "ítems" : "items"})</span>
                        <span className="font-mono">{formatCurrency(data.total)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Totals */}
            {config.showTotals && (
              <div className="totals pt-4 mt-6 space-y-2" style={{ borderTopWidth: '2px', borderTopStyle: 'solid', borderTopColor: company?.primary_color || '#3A4D3F' }}>
                <div className="flex justify-between">
                  <span>{language === "es" ? "Subtotal" : "Subtotal"}</span>
                  <span className="font-mono">{formatCurrency(proposal?.subtotal)}</span>
                </div>
                {proposal?.discount_amount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{language === "es" ? "Descuento" : "Discount"}</span>
                    <span className="font-mono">-{formatCurrency(proposal.discount_amount)}</span>
                  </div>
                )}
                {proposal?.total_tax > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{language === "es" ? "Impuestos" : "Taxes"}</span>
                    <span className="font-mono">{formatCurrency(proposal.total_tax)}</span>
                  </div>
                )}
                <div className="total-row flex justify-between text-lg font-bold pt-2 border-t">
                  <span>{language === "es" ? "TOTAL" : "TOTAL"} ({getCurrencyCode()})</span>
                  <span className="font-mono">{formatCurrency(proposal?.total)}</span>
                </div>
              </div>
            )}

            {/* Client Notes */}
            {config.showNotes && proposal?.client_notes && (
              <div className="notes bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg mt-6 border-l-4 border-amber-500">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" />
                  {language === "es" ? "Notas" : "Notes"}
                </h4>
                <p className="text-sm whitespace-pre-wrap">{proposal.client_notes}</p>
              </div>
            )}

            {/* Terms & Conditions / Payment Terms */}
            {config.showTerms && (
              <div className="terms bg-muted/30 p-4 rounded-lg mt-6 text-sm">
                <h4 className="font-semibold mb-2">
                  {language === "es" ? "Términos y Condiciones" : "Terms & Conditions"}
                </h4>
                {proposal?.payment_terms && (
                  <p className="mb-2">
                    <strong>{language === "es" ? "Términos de Pago:" : "Payment Terms:"}</strong> {proposal.payment_terms}
                  </p>
                )}
                {/* Template Terms & Conditions */}
                {template?.terms_and_conditions_en && (
                  <p className="whitespace-pre-wrap text-muted-foreground mb-3">
                    {language === "es" ? template.terms_and_conditions_es || template.terms_and_conditions_en : template.terms_and_conditions_en}
                  </p>
                )}
                {/* Template Footer/Terms */}
                {template?.footer_text_en && (
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {language === "es" ? template.footer_text_es || template.footer_text_en : template.footer_text_en}
                  </p>
                )}
              </div>
            )}

            {/* Payment Instructions (Invoice specific) */}
            {(selectedDocType === "invoice" || selectedDocType === "proposal") && template?.payment_instructions_en && (
              <div className="payment-info p-4 rounded-lg mt-4 text-sm" style={{ borderLeftColor: company?.primary_color || '#3A4D3F', borderLeftWidth: '4px', borderLeftStyle: 'solid', backgroundColor: '#e8f5e9' }}>
                <h4 className="font-semibold mb-2">
                  {language === "es" ? "Instrucciones de Pago" : "Payment Instructions"}
                </h4>
                <p className="whitespace-pre-wrap">
                  {language === "es" ? template.payment_instructions_es || template.payment_instructions_en : template.payment_instructions_en}
                </p>
              </div>
            )}

            {/* Bank Details (Invoice specific) */}
            {(selectedDocType === "invoice" || selectedDocType === "proposal") && template?.bank_details && (
              <div className="bank-details bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mt-4 text-sm">
                <h4 className="font-semibold mb-2">
                  {language === "es" ? "Datos Bancarios" : "Bank Details"}
                </h4>
                <pre className="whitespace-pre-wrap font-mono text-xs">{template.bank_details}</pre>
              </div>
            )}

            {/* Signature & Stamp block — appears on every generated document
                so users don't need to print + sign by hand. */}
            {(company?.signature_image_url || company?.stamp_image_url || company?.signatory_name) && (
              <div className="signatures grid grid-cols-1 md:grid-cols-2 gap-8 mt-10 pt-6 print:break-inside-avoid" data-testid="document-signature-block">
                {/* Provider signature */}
                <div className="text-center">
                  <div className="relative h-24 mb-2 flex items-end justify-center">
                    {company?.stamp_image_url && (
                      <img
                        src={company.stamp_image_url}
                        alt="Stamp"
                        className="absolute opacity-80"
                        style={{ maxHeight: "96px", maxWidth: "120px", right: "20%", bottom: 0 }}
                      />
                    )}
                    {company?.signature_image_url && (
                      <img
                        src={company.signature_image_url}
                        alt="Signature"
                        className="relative z-10"
                        style={{ maxHeight: "72px", maxWidth: "200px" }}
                      />
                    )}
                  </div>
                  <div className="border-t border-foreground/40 pt-1">
                    <p className="text-sm font-medium">
                      {company?.signatory_name || company?.name || ""}
                    </p>
                    {company?.signatory_title && (
                      <p className="text-xs text-muted-foreground">{company.signatory_title}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {language === "es" ? "Por la empresa" : "Authorized by"}
                    </p>
                  </div>
                </div>
                {/* Client signature - shows captured signature when client has
                    approved via the portal, otherwise blank space for manual signing. */}
                <div className="text-center">
                  <div className="relative h-24 mb-2 flex items-end justify-center">
                    {proposal?.client_signature && (
                      <img
                        src={proposal.client_signature}
                        alt="Client Signature"
                        className="relative z-10"
                        style={{ maxHeight: "72px", maxWidth: "200px" }}
                        data-testid="client-captured-signature"
                      />
                    )}
                  </div>
                  <div className="border-t border-foreground/40 pt-1">
                    <p className="text-sm font-medium">
                      {proposal?.client_signed_by || proposal?.client_name || "_______________________"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {language === "es" ? "Firma del cliente — Aprobado" : "Client signature — Approved"}
                    </p>
                    {proposal?.client_signed_at && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(proposal.client_signed_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="footer text-center text-xs text-muted-foreground mt-8 pt-4 border-t">
              <p>{company?.name}</p>
              {company?.phone && <p>{company.phone}</p>}
              {company?.email && <p>{company.email}</p>}
              <p className="mt-2">
                {language === "es" ? "Documento generado el" : "Document generated on"} {new Date().toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

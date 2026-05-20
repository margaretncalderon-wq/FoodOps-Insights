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
import { parseDateOnly } from "../utils/dates";


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
    // Use symbol if defined, otherwise use the currency code as fallback
    const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;
    const value = (amount || 0).toFixed(2);
    // For currencies like EUR, symbol goes after in some locales
    if (currency === "EUR" && language === "es") {
      return `${value} ${symbol}`;
    }
    return `${symbol}${value}`;
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
      
      // Use section_title if present, otherwise use category/item_type
      let sectionKey = item.section_title || item.category_id || item.item_type || "other";
      
      if (!grouped[dateKey]) {
        grouped[dateKey] = {};
      }
      if (!grouped[dateKey][sectionKey]) {
        grouped[dateKey][sectionKey] = {
          items: [],
          section_title: item.section_title,
          section_time: item.section_time,
          event_date: item.event_date
        };
      }
      
      grouped[dateKey][sectionKey].items.push(item);
      // Update section info if this item has more specific info
      if (item.section_title) {
        grouped[dateKey][sectionKey].section_title = item.section_title;
      }
      if (item.section_time) {
        grouped[dateKey][sectionKey].section_time = item.section_time;
      }
    });
    
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
    const html = `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${config.name[language]} - ${event?.name || 'Document'}</title>
          <style>
            * { box-sizing: border-box; }
            html, body { margin: 0; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: 24px 28px; color: #1a1a1a; font-size: ${density.base}px; line-height: ${density.lineHeight}; }
            ${variantCSS}
            /* Strip Tailwind utility chrome the React tree relies on so the
               printed output looks identical to what the user sees on screen.
               The iframe doesn't have Tailwind, so any utility classes we
               render need an explicit print fallback here. */
            h1 { font-size: 22px; font-weight: 700; margin: 0 0 4px; color: ${primaryColor}; }
            h2 { font-size: 18px; font-weight: 600; margin: 16px 0 8px; }
            h3 { font-size: 15px; font-weight: 600; margin: 12px 0 6px; }
            h4 { font-size: 14px; font-weight: 600; margin: 10px 0 6px; }
            p { margin: 4px 0; }

            /* Header */
            .header { border-bottom: 2px solid ${primaryColor}; padding-bottom: 18px; margin-bottom: 20px; }
            .company-name { color: ${primaryColor} !important; font-size: 22px; font-weight: 700; }
            .text-muted-foreground, .text-xs.text-muted-foreground { color: #6b7280; }
            .text-sm { font-size: 13px; }
            .text-xs { font-size: 11px; }
            .text-2xl { font-size: 22px; }
            .text-right { text-align: right; }
            .font-bold { font-weight: 700; }
            .font-semibold { font-weight: 600; }
            .font-medium { font-weight: 500; }
            .font-mono { font-family: "SF Mono", "Menlo", "Consolas", monospace; }
            .italic { font-style: italic; }
            .uppercase { text-transform: uppercase; }
            .tracking-wider { letter-spacing: 0.05em; }

            /* Logo */
            .doc-logo, .doc-root img.doc-logo, .header img { max-width: 240px; width: auto; height: auto; object-fit: contain; display: block; }
            .doc-logo[data-logo-size="small"] { max-height: 40px; }
            .doc-logo[data-logo-size="medium"], .header img:not([data-logo-size]) { max-height: 56px; }
            .doc-logo[data-logo-size="large"] { max-height: 80px; }
            .doc-logo-wrap { display: flex; margin-bottom: 12px; }
            .doc-logo-wrap[data-logo-position="left"] { justify-content: flex-start; }
            .doc-logo-wrap[data-logo-position="center"] { justify-content: center; }
            .doc-logo-wrap[data-logo-position="right"] { justify-content: flex-end; }
            .doc-tagline { font-style: italic; color: ${primaryColor}; opacity: 0.85; margin: 0 0 12px; font-size: 12px; }

            /* Layout helpers */
            .flex { display: flex; }
            .flex.items-start { align-items: flex-start; }
            .flex.items-center { align-items: center; }
            .flex.justify-between { justify-content: space-between; }
            .flex.gap-2 > * + * { margin-left: 8px; }
            .grid { display: grid; }
            .grid.grid-cols-2 { grid-template-columns: 1fr 1fr; gap: 16px; }
            .grid.grid-cols-3 { grid-template-columns: repeat(3, 1fr); gap: 16px; }
            .space-y-2 > * + * { margin-top: 8px; }
            .space-y-4 > * + * { margin-top: 16px; }
            .gap-2 { gap: 8px; }
            .gap-3 { gap: 12px; }
            .gap-4 { gap: 16px; }

            /* Info block (Client / Event / etc.) */
            .info-item { display: flex; gap: 8px; align-items: center; padding: 2px 0; }
            .info-label { font-weight: 600; color: #4b5563; min-width: 90px; }
            .info-item svg { width: 14px; height: 14px; flex-shrink: 0; color: #6b7280; }

            /* Tables — full polish: borders, headers with brand color, padding, zebra rows */
            table { width: 100%; border-collapse: collapse; margin: ${Math.round(density.sectionGapBottom)}px 0 ${Math.round(density.sectionGapTop * 0.6)}px; font-size: ${density.base - 0.5}px; }
            table thead th { background: ${primaryColor}; color: white !important; padding: ${density.cellY}px ${density.cellX}px; text-align: left; font-weight: 600; font-size: ${density.base - 1}px; }
            table thead th:last-child { text-align: right; }
            table tbody td { padding: ${Math.max(3, density.cellY - 1)}px ${density.cellX}px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
            table tbody tr:nth-child(even) td { background: #fafafa; }
            table tbody tr:last-child td { border-bottom: none; }
            table tbody td.text-right, table tbody td:last-child { text-align: right; }
            table th.text-right { text-align: right; }

            /* Section titles within items list (date-group / category) */
            .date-group, .section-title { margin: ${density.sectionGapTop}px 0 ${density.sectionGapBottom}px; padding: ${density.cellY}px ${density.cellX}px; background: ${primaryColor}15; border-left: 3px solid ${primaryColor}; border-radius: 4px; font-weight: 600; color: ${primaryColor}; font-size: ${density.base + 1}px; }

            /* Boxes — notes / terms / payment / bank details */
            .notes, .terms, .payment-info, .bank-details, .subtotals {
              margin-top: ${Math.round(density.sectionGapTop * 0.9)}px; padding: ${density.cellY + 4}px ${density.cellX + 4}px; border-radius: 6px; font-size: ${density.base - 0.5}px; line-height: ${density.lineHeight};
            }
            .notes { background: #fffbeb; border-left: 4px solid #f59e0b; }
            .terms { background: #f9fafb; border-left: 4px solid #6b7280; font-size: 11.5px; }
            .payment-info { background: #ecfdf5; border-left: 4px solid ${primaryColor}; }
            .bank-details { background: #eff6ff; border-radius: 6px; font-family: "SF Mono", "Menlo", monospace; white-space: pre-wrap; font-size: 11.5px; }
            .subtotals { background: #f3f4f6; }
            .subtotals h4 { margin-top: 0; }

            /* Totals row */
            .total-row { font-weight: 700; font-size: 14px; border-top: 2px solid ${primaryColor}; padding-top: 8px; margin-top: 8px; }

            /* Footer */
            .footer { margin-top: 36px; text-align: center; font-size: 10.5px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 14px; }

            /* Tailwind muted background helpers */
            .bg-muted\\/30, .bg-muted\\/40, .bg-muted\\/50 { background-color: #f3f4f6; }
            .border, .border-b { border-color: #e5e7eb; }
            .rounded-lg { border-radius: 8px; }
            .rounded { border-radius: 6px; }
            .p-4 { padding: 16px; }
            .px-3 { padding-left: 12px; padding-right: 12px; }
            .py-2 { padding-top: 8px; padding-bottom: 8px; }
            .mt-6 { margin-top: 24px; }
            .mb-2 { margin-bottom: 8px; }
            .mb-3 { margin-bottom: 12px; }

            /* Page-level print rules — remove browser-injected URL and date in the
               header/footer of the print, set proper margins, avoid breaking rows. */
            @page { margin: ${density.pageMargin}; size: auto; }
            @media print {
              body { padding: 0; }
              /* Keep small atomic units together (table rows, single service
                 section, notes, totals). Do NOT mark `.date-group` as
                 unbreakable — a whole day with many services can easily exceed
                 a page and would otherwise push to the next page, leaving the
                 previous page mostly empty. */
              tr, .category-section, .notes, .terms, .payment-info { page-break-inside: avoid; break-inside: avoid; }
              /* Keep section/date headers attached to their first content row. */
              .date-title, .section-title, h4 { page-break-after: avoid; break-after: avoid; }
              thead { display: table-header-group; }
            }
          </style>
        </head>
        <body>
          <div class="doc-root" data-style-variant="${styleVariant}">
            ${printContent.innerHTML}
          </div>
        </body>
      </html>`;

    // Use a hidden iframe instead of window.open so popup blockers, strict
    // browser policies (esp. mobile Safari) and corporate environments don't
    // strand the user with a blank tab. The iframe is removed after printing.
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";
    document.body.appendChild(iframe);

    const cleanup = () => {
      // Defer removal so the print dialog has the document still attached.
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 800);
    };

    const triggerPrint = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) {
          cleanup();
          return;
        }
        win.focus();
        win.print();
      } catch (_e) {
        /* swallow */
      } finally {
        cleanup();
      }
    };

    // Two strategies in parallel — onload (most reliable) and a 500 ms fallback
    // for browsers that don't fire onload on srcdoc iframes.
    let printed = false;
    iframe.onload = () => {
      if (printed) return;
      printed = true;
      setTimeout(triggerPrint, 50);
    };
    setTimeout(() => {
      if (printed) return;
      printed = true;
      triggerPrint();
    }, 700);

    // srcdoc is the modern, blocker-friendly way to inject HTML into an iframe.
    // We fall back to document.write if srcdoc is unsupported.
    if ("srcdoc" in iframe) {
      iframe.srcdoc = html;
    } else {
      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
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
          <CardContent className="p-8 doc-root" data-style-variant={styleVariant} ref={printRef}>
            {/* Header */}
            <div className="header border-b-2 pb-6 mb-6" style={{ borderColor: company?.primary_color || '#3A4D3F' }}>
              {/* Logo block — lifted above the two-column layout so it can be
                  left/center/right-aligned independently of the text columns. */}
              {template?.show_logo !== false && company?.logo_url && (() => {
                const sizeMap = { small: 40, medium: 56, large: 80 };
                const maxH = sizeMap[template?.logo_size] || sizeMap.medium;
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
                      style={{ maxHeight: `${maxH}px`, maxWidth: '240px', width: 'auto', height: 'auto', objectFit: 'contain' }}
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
                    {new Date().toLocaleDateString()}
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

            {/* RESUMEN DE CATERING - Per-Date Logistics */}
            {(proposal?.day_logistics?.length > 0) && (
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
                  {/* Date Header (if multi-day) */}
                  {dateKey !== "all" && config.groupByDate && (
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
                    
                    return (
                    <div key={sectionKey} className="category-section mb-4">
                      {/* Section Title with Date and Time */}
                      <div className="section-title border-b pb-2 mb-3" style={{ borderColor: company?.primary_color || '#3A4D3F' }}>
                        <h4 className="text-sm font-semibold" style={{ color: company?.primary_color || '#3A4D3F' }}>
                          {sectionTitle || getCategoryName(sectionKey)}
                        </h4>
                        {/* Show date and time if available */}
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
                                      ? `${language === "es" ? "Descuento" : "Discount"} -$${Number(dv).toFixed(2)}`
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

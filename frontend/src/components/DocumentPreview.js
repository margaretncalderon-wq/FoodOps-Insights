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
import { toast } from "sonner";
import { 
  FileText, Download, Printer, Eye, ChefHat, Utensils, 
  Package, Calendar, Users, MapPin, Phone, Mail, Building2,
  ClipboardList, ScrollText, Receipt, MenuSquare, Clock
} from "lucide-react";


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
    
    let items = [...proposal.items];
    
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
      subtotals[type].count += item.quantity || 1;
      subtotals[type].total += item.total_price || 0;
    });
    
    return subtotals;
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    const printWindow = window.open('', '_blank');
    // Use company primary color or fallback to default
    const primaryColor = company?.primary_color || '#3A4D3F';
    printWindow.document.write(`
      <html>
        <head>
          <title>${config.name[language]} - ${event?.name || 'Document'}</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; padding: 20px; color: #1a1a1a; }
            .header { border-bottom: 2px solid ${primaryColor}; padding-bottom: 20px; margin-bottom: 20px; }
            .company-name { font-size: 24px; font-weight: bold; color: ${primaryColor}; }
            .event-name { font-size: 20px; font-weight: 600; margin-top: 10px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 15px 0; }
            .info-item { display: flex; gap: 8px; }
            .info-label { font-weight: 600; color: #666; }
            .section { margin: 20px 0; }
            .section-title { font-size: 16px; font-weight: 600; color: ${primaryColor}; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; }
            .date-group { margin: 15px 0; padding: 10px; background: #f9f9f9; border-radius: 4px; }
            .date-title { font-weight: 600; color: ${primaryColor}; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; }
            th { background: ${primaryColor}; color: white; padding: 8px; text-align: left; font-size: 12px; }
            td { padding: 8px; border-bottom: 1px solid #eee; font-size: 13px; }
            .text-right { text-align: right; }
            .subtotals { margin-top: 20px; padding: 15px; background: #f5f5f5; border-radius: 4px; }
            .total-row { font-size: 18px; font-weight: bold; border-top: 2px solid ${primaryColor}; padding-top: 10px; margin-top: 10px; }
            .notes { margin-top: 20px; padding: 15px; background: #fffde7; border-left: 4px solid #ffc107; }
            .terms { margin-top: 20px; padding: 15px; background: #f5f5f5; font-size: 12px; }
            .payment-info { margin-top: 15px; padding: 15px; background: #e8f5e9; border-left: 4px solid ${primaryColor}; font-size: 12px; }
            .bank-details { margin-top: 15px; padding: 15px; background: #e3f2fd; border-radius: 4px; font-size: 12px; font-family: monospace; white-space: pre-wrap; }
            .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #666; border-top: 1px solid #ddd; padding-top: 15px; }
            .menu-item { font-size: 14px; padding: 5px 0; border-bottom: 1px dotted #ddd; }
            .checkbox { width: 14px; height: 14px; border: 1px solid #999; display: inline-block; margin-right: 8px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const groupedItems = groupItems();
  const subtotals = calculateSubtotals();
  const docName = config.name[language];

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString(language === "es" ? "es-ES" : "en-US", {
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
          <CardContent className="p-8" ref={printRef}>
            {/* Header */}
            <div className="header border-b-2 pb-6 mb-6" style={{ borderColor: company?.primary_color || '#3A4D3F' }}>
              <div className="flex justify-between items-start">
                <div>
                  {/* Logo - controlled by template */}
                  {template?.show_logo !== false && company?.logo_url && (
                    <img src={company.logo_url} alt={company.name} className="h-12 mb-2" />
                  )}
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
                                {new Date(sectionDate).toLocaleDateString(language === "es" ? "es" : "en", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}
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
                            <tr style={{ backgroundColor: template?.primary_color || '#3A4D3F', color: 'white' }}>
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
                              <tr key={idx} className="border-b border-muted/50 hover:bg-muted/20">
                                {/* Checkbox cell */}
                                {template?.show_checkboxes !== false && (selectedDocType === "packing_list" || selectedDocType === "kitchen_sheet") && (
                                  <td className="px-2 py-2 text-center">
                                    <span className="checkbox inline-block w-4 h-4 border border-gray-400 rounded-sm"></span>
                                  </td>
                                )}
                                {config.showQuantity && template?.show_quantities !== false && (
                                  <td className="px-3 py-2">{item.quantity}</td>
                                )}
                                <td className="px-3 py-2">
                                  <span className="font-medium">{item.description}</span>
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
                                      ${item.unit_price?.toFixed(2)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono font-medium">
                                      ${item.total_price?.toFixed(2)}
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
                  {Object.entries(subtotals).map(([type, data]) => (
                    <div key={type} className="flex justify-between text-sm">
                      <span>{type} ({data.count} {language === "es" ? "ítems" : "items"})</span>
                      <span className="font-mono">${data.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Totals */}
            {config.showTotals && (
              <div className="totals pt-4 mt-6 space-y-2" style={{ borderTopWidth: '2px', borderTopStyle: 'solid', borderTopColor: template?.primary_color || '#3A4D3F' }}>
                <div className="flex justify-between">
                  <span>{language === "es" ? "Subtotal" : "Subtotal"}</span>
                  <span className="font-mono">${proposal?.subtotal?.toFixed(2) || "0.00"}</span>
                </div>
                {proposal?.discount_amount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{language === "es" ? "Descuento" : "Discount"}</span>
                    <span className="font-mono">-${proposal.discount_amount?.toFixed(2)}</span>
                  </div>
                )}
                {proposal?.total_tax > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{language === "es" ? "Impuestos" : "Taxes"}</span>
                    <span className="font-mono">${proposal.total_tax?.toFixed(2)}</span>
                  </div>
                )}
                <div className="total-row flex justify-between text-lg font-bold pt-2 border-t">
                  <span>{language === "es" ? "TOTAL" : "TOTAL"}</span>
                  <span className="font-mono">${proposal?.total?.toFixed(2) || "0.00"}</span>
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
              <div className="payment-info p-4 rounded-lg mt-4 text-sm" style={{ borderLeftColor: template?.primary_color || '#3A4D3F', borderLeftWidth: '4px', borderLeftStyle: 'solid', backgroundColor: '#e8f5e9' }}>
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

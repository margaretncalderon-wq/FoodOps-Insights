// components/TimelineExport.js - Export Timeline to PDF
import { useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useLanguage } from "../contexts/LanguageContext";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  FileDown,
  Printer,
  FileText,
  Loader2,
  Calendar,
  Clock,
  Users,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateOnly } from "../utils/dates";

// Activity type colors for PDF
const ACTIVITY_COLORS = {
  setup: [156, 163, 175],      // gray
  ceremony: [168, 85, 247],    // purple
  cocktail: [59, 130, 246],    // blue
  dinner: [34, 197, 94],       // green
  entertainment: [249, 115, 22], // orange
  breakdown: [239, 68, 68],    // red
  general: [107, 114, 128],    // gray
};

const ACTIVITY_LABELS = {
  setup: { es: "Montaje", en: "Setup" },
  ceremony: { es: "Ceremonia", en: "Ceremony" },
  cocktail: { es: "Cóctel", en: "Cocktail" },
  dinner: { es: "Cena", en: "Dinner" },
  entertainment: { es: "Entretenimiento", en: "Entertainment" },
  breakdown: { es: "Desmontaje", en: "Breakdown" },
  general: { es: "General", en: "General" },
};

export default function TimelineExport({ 
  eventName, 
  eventDate, 
  guestCount,
  roomSetups, 
  masterTimeline,
  venueName 
}) {
  const { isEs } = useLanguage();
  const [exporting, setExporting] = useState(false);

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString(isEs ? "es-ES" : "en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const generatePDF = async (format = "detailed") => {
    setExporting(true);
    
    try {
      const doc = new jsPDF({
        orientation: format === "gantt" ? "landscape" : "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;

      // Header
      doc.setFillColor(58, 77, 63); // #3A4D3F
      doc.rect(0, 0, pageWidth, 35, "F");
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text(eventName || (isEs ? "Evento" : "Event"), margin, 18);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(
        `${isEs ? "Timeline del Evento" : "Event Timeline"} - ${isEs ? "Generado" : "Generated"}: ${formatDateOnly(new Date())}`,
        margin,
        28
      );

      // Event info
      let yPos = 45;
      doc.setTextColor(60, 60, 60);
      doc.setFontSize(10);

      const eventInfo = [];
      if (eventDate) eventInfo.push(`📅 ${formatDate(eventDate)}`);
      if (guestCount) eventInfo.push(`👥 ${guestCount} ${isEs ? "invitados" : "guests"}`);
      if (venueName) eventInfo.push(`📍 ${venueName}`);
      if (roomSetups?.length) eventInfo.push(`🚪 ${roomSetups.length} ${isEs ? "salón(es)" : "room(s)"}`);
      
      doc.text(eventInfo.join("  |  "), margin, yPos);
      yPos += 10;

      // Divider
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 8;

      if (format === "detailed") {
        // Detailed format - Group by room
        for (const setup of roomSetups) {
          // Room header
          doc.setFillColor(245, 245, 245);
          doc.rect(margin, yPos - 4, pageWidth - margin * 2, 12, "F");
          
          doc.setTextColor(58, 77, 63);
          doc.setFontSize(12);
          doc.setFont("helvetica", "bold");
          doc.text(`${setup.room_name}`, margin + 3, yPos + 3);
          
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 100, 100);
          const layoutLabel = setup.layout_type?.replace("_", " ").toUpperCase() || "";
          doc.text(`${layoutLabel} | ${setup.planned_guests || 0}/${setup.room_capacity || 0} ${isEs ? "pax" : "pax"}`, pageWidth - margin - 50, yPos + 3);
          
          yPos += 15;

          // Room timeline table
          const roomActivities = (setup.timeline || []).sort((a, b) => 
            (a.start_time || "").localeCompare(b.start_time || "")
          );

          if (roomActivities.length > 0) {
            const tableData = roomActivities.map((act) => {
              const typeLabel = ACTIVITY_LABELS[act.activity_type] || ACTIVITY_LABELS.general;
              return [
                act.start_time || "--:--",
                act.end_time || "--:--",
                act.title || "",
                isEs ? typeLabel.es : typeLabel.en,
                act.responsible || "-",
                act.notes || "",
              ];
            });

            autoTable(doc, {
              startY: yPos,
              head: [[
                isEs ? "Inicio" : "Start",
                isEs ? "Fin" : "End",
                isEs ? "Actividad" : "Activity",
                isEs ? "Tipo" : "Type",
                isEs ? "Responsable" : "Responsible",
                isEs ? "Notas" : "Notes",
              ]],
              body: tableData,
              margin: { left: margin, right: margin },
              styles: {
                fontSize: 8,
                cellPadding: 2,
              },
              headStyles: {
                fillColor: [58, 77, 63],
                textColor: [255, 255, 255],
                fontStyle: "bold",
              },
              columnStyles: {
                0: { cellWidth: 15 },
                1: { cellWidth: 15 },
                2: { cellWidth: 45 },
                3: { cellWidth: 25 },
                4: { cellWidth: 30 },
                5: { cellWidth: 'auto' },
              },
              didDrawCell: (data) => {
                // Color code by activity type
                if (data.section === "body" && data.column.index === 3) {
                  const actType = roomActivities[data.row.index]?.activity_type;
                  const color = ACTIVITY_COLORS[actType] || ACTIVITY_COLORS.general;
                  doc.setFillColor(...color);
                  doc.roundedRect(data.cell.x + 1, data.cell.y + 1, 3, data.cell.height - 2, 1, 1, "F");
                }
              },
            });

            yPos = doc.lastAutoTable.finalY + 10;
          } else {
            doc.setTextColor(150, 150, 150);
            doc.setFontSize(9);
            doc.text(isEs ? "Sin actividades programadas" : "No scheduled activities", margin + 5, yPos);
            yPos += 10;
          }

          // Needs section
          if (setup.needs?.length > 0) {
            doc.setTextColor(80, 80, 80);
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.text(isEs ? "Necesidades:" : "Requirements:", margin, yPos);
            doc.setFont("helvetica", "normal");
            
            const needsText = setup.needs.map(n => 
              `${n.name}${n.quantity > 1 ? ` x${n.quantity}` : ""}`
            ).join(" • ");
            
            doc.setFontSize(8);
            doc.text(needsText, margin + 25, yPos, { maxWidth: pageWidth - margin * 2 - 25 });
            yPos += 8;
          }

          yPos += 5;

          // Check for page break
          if (yPos > pageHeight - 40) {
            doc.addPage();
            yPos = 20;
          }
        }

      } else if (format === "summary") {
        // Summary format - All activities in one table
        const allActivities = masterTimeline
          .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));

        if (allActivities.length > 0) {
          doc.setFontSize(14);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(58, 77, 63);
          doc.text(isEs ? "Cronograma General" : "Master Schedule", margin, yPos);
          yPos += 8;

          const tableData = allActivities.map((act) => {
            const typeLabel = ACTIVITY_LABELS[act.activity_type] || ACTIVITY_LABELS.general;
            return [
              act.start_time || "--:--",
              act.end_time || "--:--",
              act.title || "",
              act.room_name || "-",
              isEs ? typeLabel.es : typeLabel.en,
              act.responsible || "-",
            ];
          });

          autoTable(doc, {
            startY: yPos,
            head: [[
              isEs ? "Inicio" : "Start",
              isEs ? "Fin" : "End",
              isEs ? "Actividad" : "Activity",
              isEs ? "Salón" : "Room",
              isEs ? "Tipo" : "Type",
              isEs ? "Responsable" : "Responsible",
            ]],
            body: tableData,
            margin: { left: margin, right: margin },
            styles: {
              fontSize: 9,
              cellPadding: 3,
            },
            headStyles: {
              fillColor: [58, 77, 63],
              textColor: [255, 255, 255],
              fontStyle: "bold",
            },
            alternateRowStyles: {
              fillColor: [250, 250, 250],
            },
          });
        }

      } else if (format === "gantt") {
        // Simple visual gantt representation
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(58, 77, 63);
        doc.text(isEs ? "Vista de Timeline" : "Timeline View", margin, yPos);
        yPos += 10;

        // Calculate time range
        let minHour = 24, maxHour = 0;
        masterTimeline.forEach(t => {
          if (t.start_time) {
            minHour = Math.min(minHour, parseInt(t.start_time.split(":")[0]));
          }
          if (t.end_time) {
            maxHour = Math.max(maxHour, parseInt(t.end_time.split(":")[0]) + 1);
          }
        });
        if (minHour > maxHour) { minHour = 8; maxHour = 22; }

        const hours = [];
        for (let h = minHour; h <= maxHour; h++) hours.push(h);
        const totalHours = maxHour - minHour;
        const chartWidth = pageWidth - margin * 2 - 40;
        const hourWidth = chartWidth / totalHours;
        const rowHeight = 12;
        const chartStartX = margin + 40;

        // Time header
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        hours.forEach((hour, i) => {
          doc.text(`${hour}:00`, chartStartX + i * hourWidth, yPos);
        });
        yPos += 5;

        // Draw grid
        doc.setDrawColor(230, 230, 230);
        hours.forEach((_, i) => {
          doc.line(chartStartX + i * hourWidth, yPos, chartStartX + i * hourWidth, yPos + roomSetups.length * (rowHeight + 5));
        });

        // Draw rooms and activities
        roomSetups.forEach((setup, roomIdx) => {
          const rowY = yPos + roomIdx * (rowHeight + 5);
          
          // Room name
          doc.setFontSize(8);
          doc.setTextColor(60, 60, 60);
          doc.text(setup.room_name?.substring(0, 12) || "", margin, rowY + 7);

          // Activities
          const roomActivities = masterTimeline.filter(t => t.room_id === setup.room_id);
          roomActivities.forEach((act) => {
            if (!act.start_time || !act.end_time) return;
            
            const [startH, startM] = act.start_time.split(":").map(Number);
            const [endH, endM] = act.end_time.split(":").map(Number);
            
            const startPos = ((startH - minHour) + startM / 60) * hourWidth;
            const endPos = ((endH - minHour) + endM / 60) * hourWidth;
            const width = endPos - startPos;

            const color = ACTIVITY_COLORS[act.activity_type] || ACTIVITY_COLORS.general;
            doc.setFillColor(...color);
            doc.roundedRect(chartStartX + startPos, rowY, width, rowHeight, 2, 2, "F");

            // Activity label (if fits)
            if (width > 20) {
              doc.setTextColor(255, 255, 255);
              doc.setFontSize(6);
              doc.text(act.title?.substring(0, 15) || "", chartStartX + startPos + 2, rowY + 7);
            }
          });
        });
      }

      // Footer
      const footerY = pageHeight - 10;
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `${isEs ? "Generado por" : "Generated by"} Kora OS - ${new Date().toLocaleString()}`,
        pageWidth / 2,
        footerY,
        { align: "center" }
      );

      // Save
      const fileName = `timeline_${eventName?.replace(/\s+/g, "_") || "evento"}_${new Date().toISOString().split("T")[0]}.pdf`;
      doc.save(fileName);
      
      toast.success(isEs ? "PDF exportado exitosamente" : "PDF exported successfully");
    } catch (error) {
      console.error("PDF export error:", error);
      toast.error(isEs ? "Error al exportar PDF" : "Error exporting PDF");
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!masterTimeline?.length && !roomSetups?.length) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={exporting} data-testid="export-timeline-btn">
          {exporting ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <FileDown className="w-4 h-4 mr-1" />
          )}
          {isEs ? "Exportar" : "Export"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => generatePDF("detailed")}>
          <FileText className="w-4 h-4 mr-2" />
          {isEs ? "PDF Detallado (por salón)" : "Detailed PDF (by room)"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => generatePDF("summary")}>
          <Calendar className="w-4 h-4 mr-2" />
          {isEs ? "PDF Resumen (cronograma)" : "Summary PDF (schedule)"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => generatePDF("gantt")}>
          <Clock className="w-4 h-4 mr-2" />
          {isEs ? "PDF Timeline Visual" : "Visual Timeline PDF"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePrint}>
          <Printer className="w-4 h-4 mr-2" />
          {isEs ? "Imprimir" : "Print"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { useState, useEffect, useRef } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Download, Printer, CheckCircle2 } from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";
const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PaymentReceiptModal({ open, onClose, payment }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const receiptRef = useRef(null);
  const [client, setClient] = useState(null);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companyInfo, setCompanyInfo] = useState(null);

  useEffect(() => {
    if (open && payment) {
      fetchReceiptData();
    }
  }, [open, payment]);

  const fetchReceiptData = async () => {
    setLoading(true);
    try {
      // Fetch company settings
      const companyRes = await axios.get(`${API}/api/settings/company`, { withCredentials: true }).catch(() => ({ data: null }));
      if (companyRes.data) {
        setCompanyInfo(companyRes.data);
      }
      
      // Fetch client details
      if (payment.client_id) {
        const clientRes = await axios.get(`${API}/api/crm/clients/${payment.client_id}`, { withCredentials: true }).catch(() => ({ data: null }));
        if (clientRes.data) setClient(clientRes.data);
      }
      
      // Fetch payment applications (invoices this payment was applied to)
      const appsRes = await axios.get(`${API}/api/business-clarity/payments/${payment.payment_id}/applications`, { withCredentials: true }).catch(() => ({ data: [] }));
      setApplications(appsRes.data || []);
      
    } catch (err) {
      console.error("Error fetching receipt data:", err);
    }
    setLoading(false);
  };

  const getPaymentMethodLabel = (method) => {
    const methods = {
      cash: isEs ? "Efectivo" : "Cash",
      transfer: isEs ? "Transferencia" : "Transfer",
      bank_transfer: isEs ? "Transferencia Bancaria" : "Bank Transfer",
      card: isEs ? "Tarjeta" : "Card",
      check: isEs ? "Cheque" : "Check",
      paypal: "PayPal",
      zelle: "Zelle",
      other: isEs ? "Otro" : "Other"
    };
    return methods[method] || method;
  };

  const handlePrint = () => {
    const printContent = receiptRef.current;
    if (!printContent) return;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>${isEs ? "Recibo de Pago" : "Payment Receipt"} - ${payment?.receipt_number || payment?.payment_id}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #1a1a1a; }
            .receipt-container { border: 1px solid #e5e7eb; border-radius: 8px; padding: 40px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb; }
            .company-info { text-align: left; }
            .company-name { font-size: 24px; font-weight: 700; color: #111; margin-bottom: 4px; }
            .company-details { font-size: 12px; color: #666; line-height: 1.6; }
            .receipt-title { text-align: right; }
            .receipt-title h1 { font-size: 28px; font-weight: 700; color: #16a34a; margin-bottom: 8px; }
            .receipt-number { font-size: 14px; color: #666; }
            .receipt-number strong { color: #111; }
            .client-section { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 24px; }
            .section-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; margin-bottom: 8px; font-weight: 600; }
            .client-name { font-size: 18px; font-weight: 600; color: #111; }
            .client-details { font-size: 13px; color: #666; margin-top: 4px; }
            .amount-section { background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: white; padding: 30px; border-radius: 8px; text-align: center; margin-bottom: 24px; }
            .amount-label { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.9; margin-bottom: 8px; }
            .amount-value { font-size: 42px; font-weight: 700; }
            .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
            .detail-item { padding: 16px; background: #f9fafb; border-radius: 6px; }
            .detail-label { font-size: 11px; text-transform: uppercase; color: #666; margin-bottom: 4px; font-weight: 600; }
            .detail-value { font-size: 15px; font-weight: 500; color: #111; }
            .reference-section { padding: 16px; background: #f9fafb; border-radius: 6px; margin-bottom: 24px; }
            .invoices-section { margin-bottom: 24px; }
            .invoices-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #111; }
            .invoices-table { width: 100%; border-collapse: collapse; }
            .invoices-table th { text-align: left; padding: 10px; font-size: 11px; text-transform: uppercase; color: #666; border-bottom: 2px solid #e5e7eb; font-weight: 600; }
            .invoices-table td { padding: 10px; font-size: 13px; border-bottom: 1px solid #e5e7eb; }
            .invoices-table .amount { text-align: right; font-weight: 500; }
            .footer { text-align: center; padding-top: 24px; border-top: 1px solid #e5e7eb; }
            .footer-text { font-size: 12px; color: #666; }
            .footer-date { font-size: 11px; color: #999; margin-top: 8px; }
            @media print { 
              body { padding: 20px; }
              .receipt-container { border: none; padding: 0; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const handleDownloadPDF = async () => {
    try {
      const { jsPDF } = await import("jspdf");
      await import("jspdf-autotable");
      
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      let y = 20;
      
      // Company Name (left aligned)
      doc.setFontSize(20);
      doc.setTextColor(17, 17, 17);
      doc.text(companyInfo?.name || companyInfo?.company_name || "-", margin, y);
      
      // Receipt title (right aligned)
      doc.setFontSize(24);
      doc.setTextColor(22, 163, 74);
      doc.text(isEs ? "RECIBO DE PAGO" : "PAYMENT RECEIPT", pageWidth - margin, y, { align: "right" });
      
      y += 8;
      
      // Company details
      doc.setFontSize(10);
      doc.setTextColor(102, 102, 102);
      if (companyInfo?.tax_id) {
        doc.text(`RNC: ${companyInfo.tax_id}`, margin, y);
        y += 5;
      }
      if (companyInfo?.address) {
        doc.text(companyInfo.address, margin, y);
        y += 5;
      }
      if (companyInfo?.phone) {
        doc.text(`Tel: ${companyInfo.phone}`, margin, y);
        y += 5;
      }
      
      // Receipt number (right)
      doc.setFontSize(10);
      doc.text(`No: ${payment?.receipt_number || payment?.payment_id}`, pageWidth - margin, 28, { align: "right" });
      doc.text(`${isEs ? "Fecha" : "Date"}: ${formatDateOnly(payment?.payment_date, language)}`, pageWidth - margin, 34, { align: "right" });
      
      y = Math.max(y, 45) + 10;
      
      // Separator line
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      y += 15;
      
      // Client section
      doc.setFillColor(249, 250, 251);
      doc.roundedRect(margin, y, pageWidth - (margin * 2), 25, 3, 3, "F");
      y += 8;
      doc.setFontSize(9);
      doc.setTextColor(102, 102, 102);
      doc.text(isEs ? "RECIBIDO DE:" : "RECEIVED FROM:", margin + 5, y);
      y += 7;
      doc.setFontSize(14);
      doc.setTextColor(17, 17, 17);
      doc.text(client?.display_name || client?.name || payment?.client_name || "-", margin + 5, y);
      if (client?.tax_id) {
        y += 6;
        doc.setFontSize(10);
        doc.setTextColor(102, 102, 102);
        doc.text(`RNC/Cédula: ${client.tax_id}`, margin + 5, y);
      }
      
      y += 20;
      
      // Amount box (green)
      doc.setFillColor(22, 163, 74);
      doc.roundedRect(margin, y, pageWidth - (margin * 2), 35, 3, 3, "F");
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(isEs ? "MONTO RECIBIDO" : "AMOUNT RECEIVED", pageWidth / 2, y + 12, { align: "center" });
      doc.setFontSize(28);
      doc.text(formatCurrency(payment?.amount), pageWidth / 2, y + 28, { align: "center" });
      
      y += 50;
      
      // Payment details grid
      const colWidth = (pageWidth - (margin * 2) - 10) / 2;
      
      // Date box
      doc.setFillColor(249, 250, 251);
      doc.roundedRect(margin, y, colWidth, 22, 2, 2, "F");
      doc.setFontSize(9);
      doc.setTextColor(102, 102, 102);
      doc.text(isEs ? "FECHA" : "DATE", margin + 5, y + 8);
      doc.setFontSize(12);
      doc.setTextColor(17, 17, 17);
      doc.text(formatDateOnly(payment?.payment_date, language), margin + 5, y + 17);
      
      // Method box
      doc.setFillColor(249, 250, 251);
      doc.roundedRect(margin + colWidth + 10, y, colWidth, 22, 2, 2, "F");
      doc.setFontSize(9);
      doc.setTextColor(102, 102, 102);
      doc.text(isEs ? "MÉTODO DE PAGO" : "PAYMENT METHOD", margin + colWidth + 15, y + 8);
      doc.setFontSize(12);
      doc.setTextColor(17, 17, 17);
      doc.text(getPaymentMethodLabel(payment?.payment_method), margin + colWidth + 15, y + 17);
      
      y += 30;
      
      // Reference
      if (payment?.reference) {
        doc.setFillColor(249, 250, 251);
        doc.roundedRect(margin, y, pageWidth - (margin * 2), 22, 2, 2, "F");
        doc.setFontSize(9);
        doc.setTextColor(102, 102, 102);
        doc.text(isEs ? "REFERENCIA" : "REFERENCE", margin + 5, y + 8);
        doc.setFontSize(12);
        doc.setTextColor(17, 17, 17);
        doc.text(payment.reference, margin + 5, y + 17);
        y += 30;
      }
      
      // Applied invoices table
      if (applications.length > 0) {
        doc.setFontSize(11);
        doc.setTextColor(17, 17, 17);
        doc.text(isEs ? "APLICADO A FACTURAS:" : "APPLIED TO INVOICES:", margin, y);
        
        doc.autoTable({
          startY: y + 5,
          head: [[isEs ? "Factura" : "Invoice", isEs ? "Fecha" : "Date", isEs ? "Monto" : "Amount"]],
          body: applications.map(app => [
            app.invoice_number || app.invoice_id || "-",
            app.applied_at ? formatDateOnly(app.applied_at, language) : "-",
            formatCurrency(app.amount_applied)
          ]),
          styles: { fontSize: 10 },
          headStyles: { fillColor: [59, 130, 246], textColor: 255 },
          margin: { left: margin, right: margin },
          columnStyles: { 2: { halign: 'right' } }
        });
        
        y = doc.lastAutoTable.finalY + 15;
      }
      
      // Credit balance (if any)
      if (payment?.unapplied_amount > 0) {
        doc.setFillColor(239, 246, 255); // Light blue
        doc.roundedRect(margin, y, pageWidth - (margin * 2), 28, 3, 3, "F");
        doc.setDrawColor(59, 130, 246);
        doc.roundedRect(margin, y, pageWidth - (margin * 2), 28, 3, 3, "S");
        
        doc.setFontSize(9);
        doc.setTextColor(37, 99, 235);
        doc.text(isEs ? "CRÉDITO A FAVOR" : "CREDIT BALANCE", margin + 10, y + 10);
        doc.setFontSize(8);
        doc.text(isEs ? "Disponible para futuras facturas" : "Available for future invoices", margin + 10, y + 18);
        
        doc.setFontSize(16);
        doc.text(formatCurrency(payment.unapplied_amount), pageWidth - margin - 10, y + 16, { align: "right" });
        
        y += 35;
      }
      
      // Footer
      doc.setDrawColor(229, 231, 235);
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;
      doc.setFontSize(10);
      doc.setTextColor(102, 102, 102);
      doc.text(isEs ? "Este recibo es un comprobante de pago válido." : "This receipt is a valid proof of payment.", pageWidth / 2, y, { align: "center" });
      y += 6;
      doc.setFontSize(9);
      doc.setTextColor(153, 153, 153);
      doc.text(`${isEs ? "Generado" : "Generated"}: ${new Date().toLocaleString()}`, pageWidth / 2, y, { align: "center" });
      
      // Save
      const clientName = (client?.display_name || client?.name || payment?.client_name || "cliente").replace(/\s+/g, "_");
      const fileName = `recibo_${payment?.receipt_number || payment?.payment_id}_${clientName}.pdf`;
      doc.save(fileName);
      toast.success(isEs ? "PDF descargado" : "PDF downloaded");
    } catch (err) {
      console.error("Error generating PDF:", err);
      toast.error(isEs ? "Error al generar PDF" : "Failed to generate PDF");
    }
  };

  if (!payment) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            {isEs ? "Recibo de Pago" : "Payment Receipt"}
          </DialogTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-1" />
              {isEs ? "Imprimir" : "Print"}
            </Button>
            <Button variant="default" size="sm" onClick={handleDownloadPDF} className="bg-green-600 hover:bg-green-700">
              <Download className="w-4 h-4 mr-1" />
              PDF
            </Button>
          </div>
        </DialogHeader>

        {/* Receipt Content */}
        <div ref={receiptRef} className="receipt-container bg-white border rounded-lg">
          {/* Header */}
          <div className="header flex justify-between items-start p-6 border-b">
            <div className="company-info">
              <h2 className="company-name text-2xl font-bold text-gray-900">
                {companyInfo?.name || companyInfo?.company_name || "-"}
              </h2>
              <div className="company-details text-sm text-gray-500 mt-1 space-y-0.5">
                {companyInfo?.tax_id && <p>RNC: {companyInfo.tax_id}</p>}
                {companyInfo?.address && <p>{companyInfo.address}</p>}
                {companyInfo?.phone && <p>Tel: {companyInfo.phone}</p>}
                {companyInfo?.email && <p>{companyInfo.email}</p>}
              </div>
            </div>
            <div className="receipt-title text-right">
              <h1 className="text-2xl font-bold text-green-600">
                {isEs ? "RECIBO DE PAGO" : "PAYMENT RECEIPT"}
              </h1>
              <p className="receipt-number text-sm text-gray-500 mt-1">
                <strong>No:</strong> {payment.receipt_number || payment.payment_id}
              </p>
              <p className="text-sm text-gray-500">
                <strong>{isEs ? "Fecha:" : "Date:"}</strong> {formatDateOnly(payment.payment_date, language)}
              </p>
            </div>
          </div>

          {/* Client Section */}
          <div className="client-section bg-gray-50 mx-6 mt-6 p-4 rounded-lg">
            <p className="section-label text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
              {isEs ? "Recibido de" : "Received from"}
            </p>
            <p className="client-name text-lg font-semibold text-gray-900">
              {client?.display_name || client?.name || payment.client_name || "-"}
            </p>
            {client?.tax_id && (
              <p className="client-details text-sm text-gray-600">RNC/Cédula: {client.tax_id}</p>
            )}
            {client?.address && (
              <p className="client-details text-sm text-gray-600">{client.address}</p>
            )}
          </div>

          {/* Amount Section */}
          <div className="amount-section bg-gradient-to-r from-green-600 to-green-700 mx-6 mt-4 p-6 rounded-lg text-center text-white">
            <p className="amount-label text-xs uppercase tracking-wider opacity-90 mb-2">
              {isEs ? "Monto Recibido" : "Amount Received"}
            </p>
            <p className="amount-value text-4xl font-bold">
              {formatCurrency(payment.amount)}
            </p>
          </div>

          {/* Payment Details Grid */}
          <div className="details-grid grid grid-cols-2 gap-4 mx-6 mt-4">
            <div className="detail-item bg-gray-50 p-4 rounded-lg">
              <p className="detail-label text-xs uppercase text-gray-500 font-semibold mb-1">
                {isEs ? "Fecha" : "Date"}
              </p>
              <p className="detail-value text-base font-medium text-gray-900">
                {formatDateOnly(payment.payment_date, language)}
              </p>
            </div>
            <div className="detail-item bg-gray-50 p-4 rounded-lg">
              <p className="detail-label text-xs uppercase text-gray-500 font-semibold mb-1">
                {isEs ? "Método de Pago" : "Payment Method"}
              </p>
              <p className="detail-value text-base font-medium text-gray-900">
                {getPaymentMethodLabel(payment.payment_method)}
              </p>
            </div>
          </div>

          {/* Reference */}
          {payment.reference && (
            <div className="reference-section bg-gray-50 mx-6 mt-4 p-4 rounded-lg">
              <p className="detail-label text-xs uppercase text-gray-500 font-semibold mb-1">
                {isEs ? "Referencia" : "Reference"}
              </p>
              <p className="detail-value text-base font-medium text-gray-900">
                {payment.reference}
              </p>
            </div>
          )}

          {/* Notes */}
          {payment.notes && (
            <div className="reference-section bg-gray-50 mx-6 mt-4 p-4 rounded-lg">
              <p className="detail-label text-xs uppercase text-gray-500 font-semibold mb-1">
                {isEs ? "Notas" : "Notes"}
              </p>
              <p className="detail-value text-base text-gray-900">
                {payment.notes}
              </p>
            </div>
          )}

          {/* Applied Invoices */}
          {applications.length > 0 && (
            <div className="invoices-section mx-6 mt-4">
              <p className="invoices-title text-sm font-semibold text-gray-900 mb-3">
                {isEs ? "Aplicado a Facturas:" : "Applied to Invoices:"}
              </p>
              <table className="invoices-table w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-2 text-xs uppercase text-gray-500 font-semibold">
                      {isEs ? "Factura" : "Invoice"}
                    </th>
                    <th className="text-left py-2 text-xs uppercase text-gray-500 font-semibold">
                      {isEs ? "Fecha" : "Date"}
                    </th>
                    <th className="text-right py-2 text-xs uppercase text-gray-500 font-semibold">
                      {isEs ? "Monto" : "Amount"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-2">{app.invoice_number || app.invoice_id}</td>
                      <td className="py-2 text-gray-600">
                        {app.applied_at ? formatDateOnly(app.applied_at, language) : "-"}
                      </td>
                      <td className="py-2 text-right font-medium">{formatCurrency(app.amount_applied)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Credit Balance - Only show if there's available credit */}
          {payment.unapplied_amount > 0 && (
            <div className="credit-section mx-6 mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs uppercase text-blue-600 font-semibold mb-1">
                    {isEs ? "Crédito a Favor" : "Credit Balance"}
                  </p>
                  <p className="text-sm text-blue-700">
                    {isEs ? "Disponible para aplicar a futuras facturas" : "Available to apply to future invoices"}
                  </p>
                </div>
                <p className="text-2xl font-bold text-blue-700">
                  {formatCurrency(payment.unapplied_amount)}
                </p>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="footer text-center p-6 mt-4 border-t border-gray-200">
            <p className="footer-text text-sm text-gray-600">
              {isEs ? "Este recibo es un comprobante de pago válido." : "This receipt is a valid proof of payment."}
            </p>
            <p className="footer-date text-xs text-gray-400 mt-2">
              {isEs ? "Generado" : "Generated"}: {new Date().toLocaleString()}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

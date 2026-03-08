import { useState, useEffect, useRef } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import { Download, Printer, X, CheckCircle2 } from "lucide-react";

import { API_BASE as API } from "../../utils/api";
const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PaymentReceiptModal({ open, onClose, payment, company }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const receiptRef = useRef(null);
  const [client, setClient] = useState(null);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companyInfo, setCompanyInfo] = useState(company || null);

  useEffect(() => {
    if (open && payment) {
      fetchReceiptData();
    }
  }, [open, payment]);

  const fetchReceiptData = async () => {
    setLoading(true);
    try {
      // Fetch client details
      if (payment.client_id) {
        const clientRes = await axios.get(`${API}/api/crm/clients/${payment.client_id}`, { withCredentials: true });
        setClient(clientRes.data);
      }
      
      // Fetch payment applications (invoices this payment was applied to)
      const appsRes = await axios.get(`${API}/api/business-clarity/payments/${payment.payment_id}/applications`, { withCredentials: true }).catch(() => ({ data: [] }));
      setApplications(appsRes.data || []);
      
      // Fetch company info if not provided
      if (!companyInfo) {
        const companyRes = await axios.get(`${API}/api/auth/me`, { withCredentials: true });
        if (companyRes.data?.company) {
          setCompanyInfo(companyRes.data.company);
        }
      }
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
          <title>${isEs ? "Recibo de Pago" : "Payment Receipt"} - ${payment?.payment_id}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
            .receipt-header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 15px; }
            .receipt-header h1 { font-size: 24px; margin: 0 0 5px 0; color: #1a1a1a; }
            .receipt-header .company-name { font-size: 18px; font-weight: bold; color: #333; }
            .receipt-header .company-info { font-size: 12px; color: #666; }
            .receipt-number { background: #f0f0f0; padding: 10px; text-align: center; margin: 15px 0; border-radius: 5px; }
            .receipt-number span { font-size: 20px; font-weight: bold; color: #16a34a; }
            .section { margin: 20px 0; }
            .section-title { font-size: 14px; font-weight: bold; color: #666; margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
            .info-row { display: flex; justify-content: space-between; margin: 8px 0; }
            .info-label { color: #666; }
            .info-value { font-weight: 500; }
            .amount-box { background: #16a34a; color: white; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; }
            .amount-box .label { font-size: 14px; opacity: 0.9; }
            .amount-box .amount { font-size: 32px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background: #f5f5f5; font-weight: 600; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #666; }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; }
            .badge-success { background: #dcfce7; color: #16a34a; }
            @media print { body { padding: 0; } }
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
      
      // Header
      doc.setFontSize(20);
      doc.setTextColor(26, 26, 26);
      doc.text(isEs ? "RECIBO DE PAGO" : "PAYMENT RECEIPT", pageWidth / 2, 20, { align: "center" });
      
      // Company info
      doc.setFontSize(12);
      doc.setTextColor(51, 51, 51);
      doc.text(companyInfo?.name || "Kora ERP", pageWidth / 2, 30, { align: "center" });
      doc.setFontSize(10);
      doc.setTextColor(102, 102, 102);
      if (companyInfo?.tax_id) {
        doc.text(`RNC: ${companyInfo.tax_id}`, pageWidth / 2, 36, { align: "center" });
      }
      
      // Receipt number box
      doc.setFillColor(240, 240, 240);
      doc.roundedRect(60, 42, pageWidth - 120, 15, 3, 3, "F");
      doc.setFontSize(14);
      doc.setTextColor(22, 163, 74);
      doc.text(`No. ${payment?.receipt_number || payment?.payment_id}`, pageWidth / 2, 52, { align: "center" });
      
      // Date
      doc.setFontSize(10);
      doc.setTextColor(102, 102, 102);
      doc.text(`${isEs ? "Fecha" : "Date"}: ${new Date(payment?.payment_date).toLocaleDateString()}`, pageWidth / 2, 65, { align: "center" });
      
      // Client info section
      doc.setFontSize(11);
      doc.setTextColor(51, 51, 51);
      doc.text(isEs ? "RECIBIDO DE:" : "RECEIVED FROM:", 14, 80);
      doc.setFontSize(12);
      doc.setTextColor(26, 26, 26);
      doc.text(client?.display_name || payment?.client_name || "-", 14, 88);
      doc.setFontSize(10);
      doc.setTextColor(102, 102, 102);
      if (client?.tax_id) {
        doc.text(`RNC/Cédula: ${client.tax_id}`, 14, 95);
      }
      if (client?.address) {
        doc.text(client.address, 14, client?.tax_id ? 102 : 95);
      }
      
      // Amount box
      const amountY = 115;
      doc.setFillColor(22, 163, 74);
      doc.roundedRect(14, amountY, pageWidth - 28, 30, 3, 3, "F");
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text(isEs ? "MONTO RECIBIDO" : "AMOUNT RECEIVED", pageWidth / 2, amountY + 10, { align: "center" });
      doc.setFontSize(22);
      doc.text(formatCurrency(payment?.amount), pageWidth / 2, amountY + 24, { align: "center" });
      
      // Payment details
      let detailY = amountY + 45;
      doc.setFontSize(11);
      doc.setTextColor(51, 51, 51);
      doc.text(isEs ? "DETALLES DEL PAGO:" : "PAYMENT DETAILS:", 14, detailY);
      
      detailY += 10;
      doc.setFontSize(10);
      doc.setTextColor(102, 102, 102);
      doc.text(isEs ? "Método de pago:" : "Payment method:", 14, detailY);
      doc.setTextColor(26, 26, 26);
      doc.text(getPaymentMethodLabel(payment?.payment_method), 70, detailY);
      
      if (payment?.reference) {
        detailY += 7;
        doc.setTextColor(102, 102, 102);
        doc.text(isEs ? "Referencia:" : "Reference:", 14, detailY);
        doc.setTextColor(26, 26, 26);
        doc.text(payment.reference, 70, detailY);
      }
      
      // Applied invoices table
      if (applications.length > 0) {
        detailY += 15;
        doc.setFontSize(11);
        doc.setTextColor(51, 51, 51);
        doc.text(isEs ? "APLICADO A:" : "APPLIED TO:", 14, detailY);
        
        doc.autoTable({
          startY: detailY + 5,
          head: [[isEs ? "Factura" : "Invoice", isEs ? "Fecha" : "Date", isEs ? "Monto Aplicado" : "Amount Applied"]],
          body: applications.map(app => [
            app.invoice_number || app.invoice_id,
            app.applied_at ? new Date(app.applied_at).toLocaleDateString() : "-",
            formatCurrency(app.amount_applied)
          ]),
          styles: { fontSize: 9 },
          headStyles: { fillColor: [59, 130, 246] },
          margin: { left: 14, right: 14 }
        });
      }
      
      // Footer
      const footerY = doc.internal.pageSize.getHeight() - 20;
      doc.setFontSize(9);
      doc.setTextColor(102, 102, 102);
      doc.text(isEs ? "Este recibo es un comprobante de pago válido." : "This receipt is a valid proof of payment.", pageWidth / 2, footerY, { align: "center" });
      doc.text(`${isEs ? "Generado" : "Generated"}: ${new Date().toLocaleString()}`, pageWidth / 2, footerY + 5, { align: "center" });
      
      // Save
      const fileName = `recibo_${payment?.receipt_number || payment?.payment_id}_${client?.display_name?.replace(/\s+/g, "_") || "cliente"}.pdf`;
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
        <div ref={receiptRef} className="bg-white p-6 border rounded-lg">
          {/* Header */}
          <div className="receipt-header text-center border-b-2 border-gray-800 pb-4 mb-4">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              {isEs ? "RECIBO DE PAGO" : "PAYMENT RECEIPT"}
            </h1>
            <p className="company-name text-lg font-semibold text-gray-700">
              {companyInfo?.name || "Kora ERP"}
            </p>
            <p className="company-info text-sm text-gray-500">
              {companyInfo?.tax_id && `RNC: ${companyInfo.tax_id}`}
              {companyInfo?.address && ` • ${companyInfo.address}`}
            </p>
          </div>

          {/* Receipt Number */}
          <div className="receipt-number bg-gray-100 p-3 text-center rounded-lg mb-4">
            <span className="text-xl font-bold text-green-600">
              No. {payment.receipt_number || payment.payment_id}
            </span>
            <Badge className="ml-3 badge badge-success bg-green-100 text-green-700">
              {isEs ? "Completado" : "Completed"}
            </Badge>
          </div>

          {/* Client Info */}
          <div className="section mb-4">
            <p className="section-title text-sm font-semibold text-gray-500 border-b pb-1 mb-2">
              {isEs ? "RECIBIDO DE" : "RECEIVED FROM"}
            </p>
            <p className="info-value text-lg font-medium">{client?.display_name || payment.client_name || "-"}</p>
            {client?.tax_id && <p className="info-label text-sm text-gray-600">RNC/Cédula: {client.tax_id}</p>}
            {client?.address && <p className="info-label text-sm text-gray-600">{client.address}</p>}
            {client?.email && <p className="info-label text-sm text-gray-600">{client.email}</p>}
          </div>

          {/* Amount */}
          <div className="amount-box bg-green-600 text-white p-5 text-center rounded-lg mb-4">
            <p className="label text-sm opacity-90">{isEs ? "MONTO RECIBIDO" : "AMOUNT RECEIVED"}</p>
            <p className="amount text-3xl font-bold">{formatCurrency(payment.amount)}</p>
          </div>

          {/* Payment Details */}
          <div className="section mb-4">
            <p className="section-title text-sm font-semibold text-gray-500 border-b pb-1 mb-2">
              {isEs ? "DETALLES DEL PAGO" : "PAYMENT DETAILS"}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="info-row">
                <span className="info-label text-gray-600">{isEs ? "Fecha:" : "Date:"}</span>
                <span className="info-value font-medium">{new Date(payment.payment_date).toLocaleDateString()}</span>
              </div>
              <div className="info-row">
                <span className="info-label text-gray-600">{isEs ? "Método:" : "Method:"}</span>
                <span className="info-value font-medium">{getPaymentMethodLabel(payment.payment_method)}</span>
              </div>
              {payment.reference && (
                <div className="info-row col-span-2">
                  <span className="info-label text-gray-600">{isEs ? "Referencia:" : "Reference:"}</span>
                  <span className="info-value font-medium">{payment.reference}</span>
                </div>
              )}
              {payment.notes && (
                <div className="info-row col-span-2">
                  <span className="info-label text-gray-600">{isEs ? "Notas:" : "Notes:"}</span>
                  <span className="info-value">{payment.notes}</span>
                </div>
              )}
            </div>
          </div>

          {/* Applied Invoices */}
          {applications.length > 0 && (
            <div className="section mb-4">
              <p className="section-title text-sm font-semibold text-gray-500 border-b pb-1 mb-2">
                {isEs ? "APLICADO A FACTURAS" : "APPLIED TO INVOICES"}
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-2 border-b">{isEs ? "Factura" : "Invoice"}</th>
                    <th className="text-left p-2 border-b">{isEs ? "Fecha" : "Date"}</th>
                    <th className="text-right p-2 border-b">{isEs ? "Monto" : "Amount"}</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app, idx) => (
                    <tr key={idx}>
                      <td className="p-2 border-b">{app.invoice_number || app.invoice_id}</td>
                      <td className="p-2 border-b">{app.applied_at ? new Date(app.applied_at).toLocaleDateString() : "-"}</td>
                      <td className="p-2 border-b text-right font-medium">{formatCurrency(app.amount_applied)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg mb-4">
            <div>
              <span className="text-sm text-gray-600">{isEs ? "Monto Aplicado:" : "Applied:"}</span>
              <span className="ml-2 font-medium text-green-600">{formatCurrency(payment.applied_amount)}</span>
            </div>
            <div>
              <span className="text-sm text-gray-600">{isEs ? "Disponible:" : "Available:"}</span>
              <span className="ml-2 font-medium text-amber-600">{formatCurrency(payment.unapplied_amount)}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="footer text-center pt-4 border-t text-xs text-gray-500">
            <p>{isEs ? "Este recibo es un comprobante de pago válido." : "This receipt is a valid proof of payment."}</p>
            <p className="mt-1">{isEs ? "Generado" : "Generated"}: {new Date().toLocaleString()}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { API } from "../utils/api";
import { useLanguage } from "../contexts/LanguageContext";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { AlertTriangle, CheckCircle, Download, FileUp, Loader2, X } from "lucide-react";

/**
 * RecipeImportDialog
 * 3-step flow: select → preview → result.
 *
 * Backend endpoints:
 *   GET  /api/recipes-bulk/import-template?format=csv|excel
 *   POST /api/recipes-bulk/validate-import-file (multipart)
 *   POST /api/recipes-bulk/import-from-file?update_existing=bool (multipart)
 */
export default function RecipeImportDialog({ open, onClose, onImported }) {
  const { language } = useLanguage();
  const [file, setFile] = useState(null);
  const [step, setStep] = useState("select"); // select | preview | result
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(true);

  const reset = () => {
    setFile(null);
    setStep("select");
    setPreview(null);
    setResult(null);
    setUpdateExisting(true);
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  const handleDownloadTemplate = (format = "csv") => {
    window.open(`${API}/recipes-bulk/import-template?format=${format}`, "_blank");
  };

  const handleValidate = async () => {
    if (!file) {
      toast.error(language === "es" ? "Selecciona un archivo" : "Select a file");
      return;
    }
    setValidating(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post(`${API}/recipes-bulk/validate-import-file`, fd, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(res.data);
      setStep("preview");
      if ((res.data.error_rows || 0) > 0) {
        toast.warning(
          language === "es"
            ? `${res.data.error_rows} fila(s) con errores`
            : `${res.data.error_rows} row(s) with errors`
        );
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error validando archivo");
    } finally {
      setValidating(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post(
        `${API}/recipes-bulk/import-from-file?update_existing=${updateExisting}`,
        fd,
        { withCredentials: true, headers: { "Content-Type": "multipart/form-data" } }
      );
      setResult(res.data);
      setStep("result");
      const { created = 0, updated = 0, skipped = 0 } = res.data;
      if (created || updated) {
        toast.success(
          language === "es"
            ? `Importadas: ${created} nuevas, ${updated} actualizadas${skipped ? `, ${skipped} omitidas` : ""}`
            : `Imported: ${created} new, ${updated} updated${skipped ? `, ${skipped} skipped` : ""}`
        );
        onImported?.();
      }
    } catch (e) {
      const msg = e.response?.data?.detail || "Import failed";
      toast.error(msg);
      setResult({ success: false, error: msg });
      setStep("result");
    } finally {
      setImporting(false);
    }
  };

  const t = (es, en) => (language === "es" ? es : en);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-hidden flex flex-col" data-testid="recipe-import-dialog">
        <DialogHeader>
          <DialogTitle>{t("Importar Recetas", "Import Recipes")}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {step === "select" && (
            <>
              <div className="rounded-lg border bg-amber-50/60 border-amber-200 p-4 space-y-2 text-sm">
                <p className="font-medium text-amber-900">{t("¿Cómo funciona?", "How it works")}</p>
                <ol className="list-decimal pl-5 space-y-1 text-amber-900/90">
                  <li>{t("Descarga la plantilla (CSV o Excel) con ejemplos.", "Download the template (CSV or Excel) with examples.")}</li>
                  <li>{t("Llena una receta por fila.", "Fill one recipe per row.")}</li>
                  <li>
                    {t(
                      "En la columna ingredientes usa el formato: ",
                      "In the ingredients column use the format: "
                    )}
                    <code className="bg-white px-1 rounded">Nombre: cantidad unidad; Nombre: cantidad unidad</code>
                  </li>
                  <li>
                    {t(
                      "Los ingredientes se buscan en tu inventario por nombre. Los que no se encuentren quedarán marcados ‘Por revisar’.",
                      "Ingredients are matched to your inventory by name. Unmatched ones will be flagged ‘To review’."
                    )}
                  </li>
                  <li>{t("Subes el archivo, ves un preview, y confirmas la importación.", "Upload the file, see a preview, and confirm the import.")}</li>
                </ol>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => handleDownloadTemplate("csv")} data-testid="recipe-import-template-csv">
                    <Download className="w-4 h-4 mr-1" /> {t("Plantilla CSV", "CSV template")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDownloadTemplate("excel")} data-testid="recipe-import-template-xlsx">
                    <Download className="w-4 h-4 mr-1" /> {t("Plantilla Excel", "Excel template")}
                  </Button>
                </div>
              </div>

              <div className="border-2 border-dashed rounded-lg p-6 text-center space-y-3">
                <input
                  id="recipe-import-file"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  data-testid="recipe-import-file-input"
                />
                <label htmlFor="recipe-import-file" className="cursor-pointer inline-flex items-center gap-2 text-sm font-medium">
                  <FileUp className="w-5 h-5" />
                  {file ? file.name : t("Elegir archivo CSV o Excel…", "Choose CSV or Excel file…")}
                </label>
                {file && (
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                )}
              </div>
            </>
          )}

          {step === "preview" && preview && (
            <>
              <div className="grid grid-cols-4 gap-3">
                <Stat label={t("Total", "Total")} value={preview.total_rows} />
                <Stat label={t("Listas", "Ready")} value={preview.valid_rows} tone="ok" />
                <Stat label={t("Con avisos", "With warnings")} value={preview.warning_rows} tone="warn" />
                <Stat label={t("Con errores", "With errors")} value={preview.error_rows} tone="err" />
              </div>

              <div className="flex items-center gap-2">
                <Switch id="rcp-update" checked={updateExisting} onCheckedChange={setUpdateExisting} />
                <Label htmlFor="rcp-update" className="cursor-pointer text-sm">
                  {t("Actualizar recetas existentes (por nombre)", "Update existing recipes (by name)")}
                </Label>
              </div>

              <div className="border rounded-lg max-h-[40vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 w-12">#</th>
                      <th className="text-left p-2">{t("Receta", "Recipe")}</th>
                      <th className="text-left p-2 w-32">{t("Ingredientes", "Ingredients")}</th>
                      <th className="text-left p-2">{t("Notas", "Notes")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.row_num} className="border-t align-top">
                        <td className="p-2 text-xs text-muted-foreground">{r.row_num}</td>
                        <td className="p-2">
                          <div className="font-medium">{r.name || <em className="text-red-500">{t("(vacío)", "(empty)")}</em>}</div>
                          <div className="text-xs text-muted-foreground">{r.category} · {r.servings} {t("porc.", "serv.")}</div>
                        </td>
                        <td className="p-2 text-xs">
                          <Badge variant={r.matched_count === r.ingredients_count && r.ingredients_count > 0 ? "default" : "outline"}>
                            {r.matched_count}/{r.ingredients_count}
                          </Badge>
                        </td>
                        <td className="p-2 text-xs space-y-0.5">
                          {r.errors.map((e, i) => (
                            <div key={i} className="text-red-600 flex items-start gap-1"><X className="w-3 h-3 mt-0.5 flex-shrink-0" /><span>{e}</span></div>
                          ))}
                          {r.warnings.map((w, i) => (
                            <div key={i} className="text-amber-700 flex items-start gap-1"><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /><span>{w}</span></div>
                          ))}
                          {r.status === "valid" && (
                            <div className="text-emerald-600 flex items-start gap-1"><CheckCircle className="w-3 h-3 mt-0.5" /><span>{t("Lista para importar", "Ready to import")}</span></div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {step === "result" && result && (
            <div className="space-y-3">
              {result.success !== false ? (
                <div className="rounded-lg border bg-emerald-50 border-emerald-200 p-4">
                  <p className="font-medium text-emerald-900 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" /> {t("Importación completada", "Import complete")}
                  </p>
                  <ul className="mt-2 text-sm text-emerald-900/90 space-y-1">
                    <li>{t("Nuevas", "New")}: <strong>{result.created || 0}</strong></li>
                    <li>{t("Actualizadas", "Updated")}: <strong>{result.updated || 0}</strong></li>
                    <li>{t("Omitidas", "Skipped")}: <strong>{result.skipped || 0}</strong></li>
                  </ul>
                </div>
              ) : (
                <div className="rounded-lg border bg-red-50 border-red-200 p-4 text-sm text-red-900">
                  <p className="font-medium">{t("Error al importar", "Import failed")}</p>
                  <p className="mt-1">{result.error}</p>
                </div>
              )}
              {(result.errors || []).length > 0 && (
                <div className="rounded-lg border p-3 max-h-48 overflow-auto">
                  <p className="text-sm font-medium mb-1">{t("Filas con errores:", "Rows with errors:")}</p>
                  <ul className="text-xs text-red-700 space-y-0.5">
                    {(result.errors || []).map((er, i) => (
                      <li key={i}>{t("Fila", "Row")} {er.row}: {er.error}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {t(
                  "Las recetas con ingredientes no encontrados quedaron marcadas como ‘Por revisar’. Ábrelas para enlazar el ingrediente correcto y recalcular el costo.",
                  "Recipes with unmatched ingredients are flagged ‘To review’. Open them to link the right ingredient and recalculate cost."
                )}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 border-t mt-2">
          {step === "select" && (
            <>
              <Button variant="outline" onClick={handleClose}>{t("Cancelar", "Cancel")}</Button>
              <Button onClick={handleValidate} disabled={!file || validating} data-testid="recipe-import-validate-btn">
                {validating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t("Validar archivo", "Validate file")}
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("select")}>{t("Atrás", "Back")}</Button>
              <Button
                onClick={handleImport}
                disabled={importing || (preview?.valid_rows || 0) + (preview?.warning_rows || 0) === 0}
                data-testid="recipe-import-confirm-btn"
              >
                {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileUp className="w-4 h-4 mr-2" />}
                {t(
                  `Importar ${(preview?.valid_rows || 0) + (preview?.warning_rows || 0)} receta(s)`,
                  `Import ${(preview?.valid_rows || 0) + (preview?.warning_rows || 0)} recipe(s)`
                )}
              </Button>
            </>
          )}
          {step === "result" && (
            <Button onClick={handleClose}>{t("Cerrar", "Close")}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }) {
  const cls =
    tone === "ok" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : tone === "warn" ? "bg-amber-50 text-amber-700 border-amber-200"
    : tone === "err" ? "bg-red-50 text-red-700 border-red-200"
    : "bg-muted/50 text-foreground";
  return (
    <div className={`rounded-md border p-2 text-center ${cls}`}>
      <div className="text-xs">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

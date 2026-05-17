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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Textarea } from "./ui/textarea";
import { Input } from "./ui/input";
import { AlertTriangle, CheckCircle, Download, FileUp, Keyboard, Loader2, Plus, Trash2, X } from "lucide-react";

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
  const [inputMode, setInputMode] = useState("manual"); // "manual" | "file" | "paste"
  const [file, setFile] = useState(null);
  const [step, setStep] = useState("select"); // select | preview | result
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(true);
  // Manual rows: each row is a recipe
  const blankRow = () => ({
    nombre: "",
    descripcion: "",
    categoria: "",
    tipo: "final_dish",
    porciones: 1,
    tiempo_preparacion: "",
    precio_por_porcion: "",
    ingredientes: "",
  });
  const [manualRows, setManualRows] = useState([blankRow(), blankRow()]);
  // Paste mode
  const [pasteText, setPasteText] = useState("");

  const reset = () => {
    setFile(null);
    setStep("select");
    setPreview(null);
    setResult(null);
    setUpdateExisting(true);
    setManualRows([blankRow(), blankRow()]);
    setPasteText("");
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  // CSV escape helper
  const csvEscape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes("\n") || s.includes('"')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  // Build a CSV File blob from the current input mode (manual rows or pasted text)
  const buildCsvFile = () => {
    const cols = ["nombre", "descripcion", "categoria", "tipo", "porciones", "tiempo_preparacion", "precio_por_porcion", "ingredientes"];
    let csv = cols.join(",") + "\n";

    if (inputMode === "manual") {
      const filled = manualRows.filter(r => (r.nombre || "").trim());
      if (filled.length === 0) return null;
      for (const r of filled) {
        csv += cols.map(c => csvEscape(r[c])).join(",") + "\n";
      }
    } else if (inputMode === "paste") {
      // Parse TSV (Excel default) or CSV pasted by the user, allowing partial column sets
      // Strategy: each line is a row; split by tab first, fallback to comma.
      const lines = pasteText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return null;
      // Detect if first line is a header (contains "nombre" or "name")
      let startIdx = 0;
      let headerCols = null;
      const first = lines[0].toLowerCase();
      if (first.includes("nombre") || first.includes("name") || first.includes("receta")) {
        const sep = lines[0].includes("\t") ? "\t" : ",";
        headerCols = lines[0].split(sep).map(s => s.trim().toLowerCase());
        startIdx = 1;
      }
      for (let i = startIdx; i < lines.length; i++) {
        const sep = lines[i].includes("\t") ? "\t" : ",";
        const parts = lines[i].split(sep).map(s => s.trim());
        let row = blankRow();
        if (headerCols) {
          // Map by header name (loose alias support)
          const aliasMap = {
            nombre: "nombre", name: "nombre", receta: "nombre",
            descripcion: "descripcion", "descripción": "descripcion", description: "descripcion",
            categoria: "categoria", "categoría": "categoria", category: "categoria",
            tipo: "tipo", type: "tipo",
            porciones: "porciones", servings: "porciones",
            tiempo_preparacion: "tiempo_preparacion", "tiempo de preparación": "tiempo_preparacion", prep_time: "tiempo_preparacion",
            precio_por_porcion: "precio_por_porcion", precio: "precio_por_porcion", price: "precio_por_porcion",
            ingredientes: "ingredientes", ingredients: "ingredientes",
          };
          headerCols.forEach((h, idx) => {
            const key = aliasMap[h];
            if (key) row[key] = parts[idx] || "";
          });
        } else {
          // Positional fallback in same order as cols
          cols.forEach((c, idx) => { row[c] = parts[idx] || ""; });
        }
        if ((row.nombre || "").trim()) {
          csv += cols.map(c => csvEscape(row[c])).join(",") + "\n";
        }
      }
      if (csv.trim().split("\n").length <= 1) return null;
    }

    const blob = new Blob([csv], { type: "text/csv" });
    return new File([blob], "recetas_inline.csv", { type: "text/csv" });
  };

  const updateRow = (idx, key, value) => {
    setManualRows(prev => prev.map((r, i) => i === idx ? { ...r, [key]: value } : r));
  };
  const addRow = () => setManualRows(prev => [...prev, blankRow()]);
  const removeRow = (idx) => setManualRows(prev => prev.filter((_, i) => i !== idx));

  const handleDownloadTemplate = (format = "csv") => {
    window.open(`${API}/recipes-bulk/import-template?format=${format}`, "_blank");
  };

  const getActiveFile = () => {
    if (inputMode === "file") return file;
    return buildCsvFile();
  };

  const handleValidate = async () => {
    const activeFile = getActiveFile();
    if (!activeFile) {
      toast.error(
        inputMode === "file"
          ? (language === "es" ? "Selecciona un archivo" : "Select a file")
          : (language === "es" ? "Agrega al menos una receta con nombre" : "Add at least one recipe with a name")
      );
      return;
    }
    setValidating(true);
    try {
      const fd = new FormData();
      fd.append("file", activeFile);
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
    const activeFile = getActiveFile();
    if (!activeFile) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", activeFile);
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
              <Tabs value={inputMode} onValueChange={setInputMode}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="manual" data-testid="rcp-mode-manual">
                    <Keyboard className="w-4 h-4 mr-2" />
                    {t("Escribir", "Type rows")}
                  </TabsTrigger>
                  <TabsTrigger value="paste" data-testid="rcp-mode-paste">
                    <Plus className="w-4 h-4 mr-2" />
                    {t("Pegar de Excel", "Paste from Excel")}
                  </TabsTrigger>
                  <TabsTrigger value="file" data-testid="rcp-mode-file">
                    <FileUp className="w-4 h-4 mr-2" />
                    {t("Subir archivo", "Upload file")}
                  </TabsTrigger>
                </TabsList>

                {/* MANUAL TYPING MODE */}
                <TabsContent value="manual" className="space-y-3">
                  <div className="rounded-lg border bg-amber-50/60 border-amber-200 p-3 text-xs text-amber-900">
                    {t(
                      "Llena una fila por receta. La columna ‘Ingredientes’ usa el formato: ",
                      "One row per recipe. The ‘Ingredients’ column uses the format: "
                    )}
                    <code className="bg-white px-1 rounded">Nombre: cantidad unidad; Nombre: cantidad unidad</code>
                  </div>
                  <div className="border rounded-lg max-h-[45vh] overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left p-2 min-w-[160px]">{t("Nombre *", "Name *")}</th>
                          <th className="text-left p-2 min-w-[200px]">{t("Descripción", "Description")}</th>
                          <th className="text-left p-2 min-w-[120px]">{t("Categoría", "Category")}</th>
                          <th className="text-left p-2 w-24">{t("Porciones", "Servings")}</th>
                          <th className="text-left p-2 w-24">{t("Tiempo", "Prep time")}</th>
                          <th className="text-left p-2 w-24">{t("$/porción", "$/serving")}</th>
                          <th className="text-left p-2 min-w-[260px]">{t("Ingredientes", "Ingredients")}</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {manualRows.map((row, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="p-1">
                              <Input
                                value={row.nombre}
                                onChange={(e) => updateRow(idx, "nombre", e.target.value)}
                                placeholder={t("Ej: Ensalada César", "E.g.: Caesar Salad")}
                                className="h-8 text-xs"
                                data-testid={`rcp-row-${idx}-nombre`}
                              />
                            </td>
                            <td className="p-1">
                              <Input
                                value={row.descripcion}
                                onChange={(e) => updateRow(idx, "descripcion", e.target.value)}
                                placeholder={t("Lechuga romana con aderezo César…", "Crisp romaine with Caesar dressing…")}
                                className="h-8 text-xs"
                                data-testid={`rcp-row-${idx}-descripcion`}
                              />
                            </td>
                            <td className="p-1">
                              <Input
                                value={row.categoria}
                                onChange={(e) => updateRow(idx, "categoria", e.target.value)}
                                placeholder={t("Ensaladas", "Salads")}
                                className="h-8 text-xs"
                              />
                            </td>
                            <td className="p-1">
                              <Input
                                type="number" min="1" step="1"
                                value={row.porciones}
                                onChange={(e) => updateRow(idx, "porciones", parseInt(e.target.value) || 1)}
                                className="h-8 text-xs"
                              />
                            </td>
                            <td className="p-1">
                              <Input
                                value={row.tiempo_preparacion}
                                onChange={(e) => updateRow(idx, "tiempo_preparacion", e.target.value)}
                                placeholder="15 min"
                                className="h-8 text-xs"
                              />
                            </td>
                            <td className="p-1">
                              <Input
                                type="number" min="0" step="0.01"
                                value={row.precio_por_porcion}
                                onChange={(e) => updateRow(idx, "precio_por_porcion", e.target.value)}
                                placeholder="12.50"
                                className="h-8 text-xs"
                              />
                            </td>
                            <td className="p-1">
                              <Input
                                value={row.ingredientes}
                                onChange={(e) => updateRow(idx, "ingredientes", e.target.value)}
                                placeholder={t(
                                  "Lechuga: 0.4 kg; Queso: 80 g",
                                  "Lettuce: 0.4 kg; Cheese: 80 g"
                                )}
                                className="h-8 text-xs font-mono"
                              />
                            </td>
                            <td className="p-1 text-center">
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => removeRow(idx)}
                                disabled={manualRows.length === 1}
                                data-testid={`rcp-row-${idx}-delete`}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button variant="outline" size="sm" onClick={addRow} data-testid="rcp-add-row-btn">
                    <Plus className="w-4 h-4 mr-1" /> {t("Agregar fila", "Add row")}
                  </Button>
                </TabsContent>

                {/* PASTE MODE */}
                <TabsContent value="paste" className="space-y-3">
                  <div className="rounded-lg border bg-amber-50/60 border-amber-200 p-3 text-xs text-amber-900">
                    <p className="font-medium mb-1">{t("Pega desde Excel o Google Sheets", "Paste from Excel or Google Sheets")}</p>
                    <p>
                      {t(
                        "Selecciona en tu hoja las columnas: nombre, descripcion, categoria, tipo, porciones, tiempo_preparacion, precio_por_porcion, ingredientes — y pega aquí. Detectamos tabs/comas automáticamente.",
                        "Select these columns in your sheet: name, description, category, type, servings, prep_time, price_per_serving, ingredients — and paste here. Tabs/commas auto-detected."
                      )}
                    </p>
                  </div>
                  <Textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={10}
                    className="font-mono text-xs"
                    placeholder={`nombre\tdescripcion\tcategoria\ttipo\tporciones\ttiempo_preparacion\tprecio_por_porcion\tingredientes
Ensalada César\tLechuga romana con aderezo César\tEnsaladas\tfinal_dish\t4\t15 min\t12.50\tLechuga: 0.4 kg; Queso parmesano: 80 g
Pollo al limón\tPechuga marinada en limón\tPlato principal\tfinal_dish\t2\t30 min\t18.00\tPechuga: 0.6 kg; Limón: 2 unit`}
                    data-testid="rcp-paste-textarea"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("Si pegaste un encabezado, lo detectaremos automáticamente.", "If you pasted a header row, we’ll detect it automatically.")}
                  </p>
                </TabsContent>

                {/* FILE UPLOAD MODE */}
                <TabsContent value="file" className="space-y-3">
                  <div className="rounded-lg border bg-amber-50/60 border-amber-200 p-3 space-y-2 text-sm">
                    <p className="font-medium text-amber-900">{t("Sube CSV o Excel", "Upload CSV or Excel")}</p>
                    <div className="flex flex-wrap gap-2">
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
                </TabsContent>
              </Tabs>
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
              <Button onClick={handleValidate} disabled={validating} data-testid="recipe-import-validate-btn">
                {validating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t("Revisar y validar", "Review & validate")}
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

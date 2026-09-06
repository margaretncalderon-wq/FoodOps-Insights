import React from "react";

/**
 * LogoPreviewGrid
 * -----------------------------------------------------------------------------
 * Renders 5 mini "sheets of paper" showing how the currently-configured logo
 * will look on each document type. This lets the user pick the right logo_size
 * without having to actually generate + open a PDF.
 *
 * IMPORTANT: The sizing math here must stay in sync with:
 *   - /app/frontend/src/components/DocumentPreview.js (sizeMap)
 *   - /app/frontend/src/pages/DocumentPreview.js (h-6/h-8 caps)
 *   - /app/backend/utils/print_templates.py (_LOGO_SIZE_PX + operational cap)
 *
 * Any change to those caps should be mirrored here so the preview matches
 * reality. A subtle mismatch here would erode the user's trust in the
 * preview and defeat the point of the feature.
 */
const CLIENT_CAP_PX = { small: 40, medium: 56, large: 80 };
const OP_CAP_PX = { small: 20, medium: 26, large: 34 };

// Mini papers are ~140px tall in the settings UI; real PDFs are ~1120px tall
// (A4 at 96dpi). We render at ~1/8th scale so the logo cap ratios feel true
// to what the user will actually see when printing.
const PREVIEW_SCALE = 0.42;

const DOC_TYPES = [
  { key: "quote",         name_es: "Propuesta",       name_en: "Quote",         operational: false, tone: "emerald" },
  { key: "invoice",       name_es: "Factura",         name_en: "Invoice",       operational: false, tone: "sky" },
  { key: "kitchen_sheet", name_es: "Hoja de Cocina",  name_en: "Kitchen Sheet", operational: true,  tone: "amber" },
  { key: "packing_list",  name_es: "Lista Montaje",   name_en: "Packing List",  operational: true,  tone: "orange" },
  { key: "beo",           name_es: "BEO",             name_en: "BEO",           operational: true,  tone: "rose" },
];

export default function LogoPreviewGrid({
  logoUrl,
  logoSize = "medium",
  logoPosition = "left",
  showLogo = true,
  primaryColor = "#3A4D3F",
  companyName = "",
  language = "es",
}) {
  const isEs = language === "es";

  const renderPaper = (doc) => {
    const capMap = doc.operational ? OP_CAP_PX : CLIENT_CAP_PX;
    const rawCap = capMap[logoSize] ?? capMap.medium;
    const renderedH = Math.max(8, Math.round(rawCap * PREVIEW_SCALE));
    const renderedMaxW = Math.round(renderedH * 3.2);
    const justifyMap = { left: "flex-start", center: "center", right: "flex-end" };

    return (
      <div
        key={doc.key}
        className="flex flex-col items-center gap-2"
        data-testid={`logo-preview-${doc.key}`}
      >
        <div
          className="w-[112px] h-[148px] bg-white rounded-md border border-slate-200 shadow-sm p-3 flex flex-col"
          style={{ borderTop: `3px solid ${primaryColor}` }}
        >
          {/* Header mimicking the doc template header */}
          <div
            className="flex items-center pb-1 mb-1.5 border-b border-slate-100"
            style={{ justifyContent: justifyMap[logoPosition] || "flex-start", minHeight: "18px" }}
          >
            {showLogo && logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                style={{
                  height: `${renderedH}px`,
                  maxWidth: `${renderedMaxW}px`,
                  width: "auto",
                  objectFit: "contain",
                }}
              />
            ) : (
              <span
                className="text-[7px] font-bold uppercase tracking-wide"
                style={{ color: primaryColor }}
              >
                {companyName || "Kora OS"}
              </span>
            )}
          </div>
          {/* Fake content lines to give the paper a "real doc" feel */}
          <div className="space-y-1 flex-1">
            <div className="h-1.5 rounded bg-slate-800/80" style={{ width: "72%" }} />
            <div className="h-1 rounded bg-slate-200" style={{ width: "50%" }} />
            <div className="h-1 rounded bg-slate-200" style={{ width: "62%" }} />
            <div className="my-2 h-px bg-slate-100" />
            <div className="space-y-0.5">
              <div className="h-0.5 rounded bg-slate-200" style={{ width: "90%" }} />
              <div className="h-0.5 rounded bg-slate-200" style={{ width: "78%" }} />
              <div className="h-0.5 rounded bg-slate-200" style={{ width: "84%" }} />
              <div className="h-0.5 rounded bg-slate-200" style={{ width: "70%" }} />
              <div className="h-0.5 rounded bg-slate-200" style={{ width: "88%" }} />
              <div className="h-0.5 rounded bg-slate-200" style={{ width: "60%" }} />
            </div>
          </div>
          {/* Footer with a mini "operational" badge so the user connects the
              tighter logo cap to why this doc type is treated differently. */}
          {doc.operational && (
            <div className="mt-1 flex justify-end">
              <span className="text-[6px] uppercase tracking-wider text-amber-700 bg-amber-100 rounded-full px-1 py-[1px] leading-none">
                {isEs ? "Cocina" : "Kitchen"}
              </span>
            </div>
          )}
        </div>
        <div className="text-center">
          <div className="text-[11px] font-medium text-slate-800 leading-tight">
            {isEs ? doc.name_es : doc.name_en}
          </div>
          <div className="text-[9px] text-slate-500 leading-tight mt-0.5">
            {isEs ? "Logo" : "Logo"} · {rawCap}px
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4"
      data-testid="logo-preview-grid"
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-semibold text-slate-800">
            {isEs ? "Vista previa del logo por tipo de documento" : "Logo preview by document type"}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {isEs
              ? "Los documentos operativos (cocina) usan un tamaño más discreto para que el contenido operativo domine la página."
              : "Operational docs (kitchen) cap the logo tighter so ops content leads the page."}
          </p>
        </div>
        {!showLogo && (
          <span className="text-[10px] uppercase tracking-wider bg-slate-200 text-slate-600 rounded-full px-2 py-0.5">
            {isEs ? "Logo oculto" : "Logo hidden"}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-3 justify-start">
        {DOC_TYPES.map(renderPaper)}
      </div>
    </div>
  );
}

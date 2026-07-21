import { API } from "./api";

/**
 * openBrandedPrintTab — abre el endpoint de print branded en una pestaña
 * nueva. La pestaña incluye el header/footer con logo y colores del tenant
 * y un botón "Imprimir / Guardar PDF" flotante.
 *
 * Ejemplos:
 *   openBrandedPrintTab("recipes", recipeId)
 *   openBrandedPrintTab("purchase-orders", poId)
 *   openBrandedPrintTab("delivery-notes", noteId)
 *
 * El endpoint backend hereda las cookies de sesión — el usuario no re-logea.
 */
export function openBrandedPrintTab(entity, id) {
  if (!id) return;
  const url = `${API}/${entity}/${id}/print`;
  window.open(url, "_blank", "noopener,noreferrer");
}

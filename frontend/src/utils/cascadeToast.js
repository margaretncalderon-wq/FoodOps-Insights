import { toast } from "sonner";

/**
 * Reads the X-Cascade-Recipes and X-Cascade-Formats response headers set by
 * the backend when an ingredient update triggers downstream recalculations,
 * and surfaces the count as a toast so the user sees the ripple effect.
 *
 * Usage:
 *   const res = await axios.put(`${API}/api/inventory/ingredients/${id}`, payload, { withCredentials: true });
 *   showCascadeToast(res, language);
 *
 * Headers are exposed via `Access-Control-Expose-Headers` from the backend,
 * so this works even with CORS.
 */
export function showCascadeToast(response, language = "es") {
  const headers = response?.headers || {};
  // Axios lowercases header keys.
  const recipes = parseInt(headers["x-cascade-recipes"] || "0", 10);
  const formats = parseInt(headers["x-cascade-formats"] || "0", 10);

  if (!recipes && !formats) return;

  const msg = language === "es"
    ? `${recipes} ${recipes === 1 ? "receta" : "recetas"} y ${formats} ${formats === 1 ? "formato" : "formatos"} actualizados`
    : `${recipes} ${recipes === 1 ? "recipe" : "recipes"} and ${formats} ${formats === 1 ? "portion format" : "portion formats"} updated`;

  toast.success(msg, {
    description: language === "es"
      ? "El nuevo costo se propagó automáticamente."
      : "The new cost cascaded automatically.",
    duration: 4500,
  });
}

// Centralized helper that converts pydantic/FastAPI validation errors
// (an array of {loc, msg, type, ...}) into a single human-readable string,
// with field names translated to user-friendly labels.
//
// Used by the global axios response interceptor in utils/api.js — so EVERY
// `error.response?.data?.detail` already arrives as a clean string.
// Existing form code (`toast.error(error.response?.data?.detail)`) keeps working.

// snake_case → { es, en } label map for the most common backend fields.
// Add new entries here as the surface area grows.
const FIELD_LABELS = {
  // generic
  display_name: { es: "nombre", en: "name" },
  name: { es: "nombre", en: "name" },
  email: { es: "correo", en: "email" },
  phone: { es: "teléfono", en: "phone" },
  password: { es: "contraseña", en: "password" },
  description: { es: "descripción", en: "description" },
  status: { es: "estado", en: "status" },
  notes: { es: "notas", en: "notes" },
  category: { es: "categoría", en: "category" },
  category_id: { es: "categoría", en: "category" },
  // identity / relations
  client_id: { es: "cliente", en: "client" },
  company_id: { es: "empresa", en: "company" },
  contact_id: { es: "contacto", en: "contact" },
  user_id: { es: "usuario", en: "user" },
  recipe_id: { es: "receta", en: "recipe" },
  ingredient_id: { es: "ingrediente", en: "ingredient" },
  proposal_id: { es: "cotización", en: "proposal" },
  // events
  event_type: { es: "tipo de evento", en: "event type" },
  engagement_type: { es: "tipo de compromiso", en: "engagement type" },
  event_date: { es: "fecha del evento", en: "event date" },
  end_date: { es: "fecha de cierre", en: "end date" },
  start_time: { es: "hora de inicio", en: "start time" },
  end_time: { es: "hora de fin", en: "end time" },
  venue: { es: "lugar", en: "venue" },
  guest_count: { es: "invitados", en: "guests" },
  budget: { es: "presupuesto", en: "budget" },
  // recipes
  recipe_type: { es: "tipo de receta", en: "recipe type" },
  yield_quantity: { es: "rendimiento", en: "yield" },
  yield_unit: { es: "unidad de rendimiento", en: "yield unit" },
  portions_per_yield: { es: "porciones por rendimiento", en: "portions per yield" },
  portion_size: { es: "tamaño de porción", en: "portion size" },
  sell_price: { es: "precio de venta", en: "sell price" },
  min_margin_pct: { es: "margen mínimo", en: "min margin" },
  target_portions: { es: "porciones objetivo", en: "target portions" },
  // ingredients / inventory
  unit: { es: "unidad", en: "unit" },
  cost_per_unit: { es: "costo por unidad", en: "cost per unit" },
  stock_quantity: { es: "cantidad en stock", en: "stock quantity" },
  // proposals / quotes
  proposal_number: { es: "número de cotización", en: "proposal number" },
  total: { es: "total", en: "total" },
  unit_price: { es: "precio unitario", en: "unit price" },
  quantity: { es: "cantidad", en: "quantity" },
  // tax / payment
  payment_terms: { es: "términos de pago", en: "payment terms" },
};

const ERROR_TYPE_MESSAGES = {
  missing: { es: "es obligatorio", en: "is required" },
  string_too_short: { es: "es muy corto", en: "is too short" },
  string_too_long: { es: "es muy largo", en: "is too long" },
  value_error: { es: "no es válido", en: "is invalid" },
  type_error: { es: "tiene formato incorrecto", en: "has wrong format" },
  greater_than: { es: "debe ser mayor", en: "must be greater" },
  less_than: { es: "debe ser menor", en: "must be smaller" },
  email: { es: "debe ser un correo válido", en: "must be a valid email" },
};

const looksSpanish = () => {
  try {
    return (
      (typeof navigator !== "undefined" &&
        (navigator.language || "").toLowerCase().startsWith("es")) ||
      (typeof localStorage !== "undefined" && localStorage.getItem("kora_lang") === "es")
    );
  } catch (e) {
    return true; // safer default for this Spanish-first app
  }
};

const labelFor = (field, isEs) => {
  if (!field) return "";
  const entry = FIELD_LABELS[field];
  if (entry) return isEs ? entry.es : entry.en;
  // Humanize unknown field name (snake_case → words)
  return String(field).replace(/_/g, " ");
};

const fieldFromLoc = (loc) => {
  if (!Array.isArray(loc)) return "";
  // Drop the leading "body" / "query" / "path" markers, keep the last leaf as the field.
  const filtered = loc.filter((x) => !["body", "query", "path", "header"].includes(x));
  return filtered.length ? String(filtered[filtered.length - 1]) : "";
};

/**
 * Convert a pydantic detail array into a single, human-readable string.
 * Example input: [{loc:["body","event_type"], msg:"Field required", type:"missing"}]
 * Example output: "Falta: tipo de evento"
 */
export const formatPydanticDetail = (detailArray, isEs = looksSpanish()) => {
  if (!Array.isArray(detailArray) || detailArray.length === 0) return "";
  const missing = [];
  const others = [];
  for (const item of detailArray) {
    if (!item || typeof item !== "object") continue;
    const field = fieldFromLoc(item.loc);
    const label = labelFor(field, isEs);
    const errType = item.type || "";
    if (errType === "missing") {
      if (label) missing.push(label);
      continue;
    }
    // Friendly translation for other error types when available
    const friendly = ERROR_TYPE_MESSAGES[errType];
    if (friendly) {
      others.push(label ? `${label} ${friendly[isEs ? "es" : "en"]}` : friendly[isEs ? "es" : "en"]);
    } else {
      // Fall back to backend message verbatim
      others.push(label ? `${label}: ${item.msg}` : (item.msg || ""));
    }
  }
  const parts = [];
  if (missing.length) {
    parts.push((isEs ? "Falta: " : "Missing: ") + missing.join(", "));
  }
  if (others.length) parts.push(others.join(" · "));
  return parts.join(" · ");
};

/**
 * Universal API-error → user-readable string. Handles:
 *   - pydantic 422 detail arrays
 *   - plain string detail
 *   - {error/message} shapes
 *   - network errors (no response)
 */
export const formatApiError = (error, fallback = null) => {
  const isEs = looksSpanish();
  if (!error) return fallback || (isEs ? "Error inesperado" : "Unexpected error");
  // Network / no response
  if (error.code === "ERR_NETWORK" || !error.response) {
    return fallback || (isEs ? "Sin conexión con el servidor" : "Cannot reach the server");
  }
  const data = error.response?.data;
  if (!data) return fallback || (isEs ? "Error del servidor" : "Server error");
  const detail = data.detail ?? data.message ?? data.error;
  if (Array.isArray(detail)) {
    return formatPydanticDetail(detail, isEs) || (fallback || (isEs ? "Datos inválidos" : "Invalid data"));
  }
  if (typeof detail === "string" && detail.trim()) return detail;
  if (typeof data === "string" && data.trim()) return data;
  return fallback || (isEs ? "Error del servidor" : "Server error");
};

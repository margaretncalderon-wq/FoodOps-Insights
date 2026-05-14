import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Mail, Phone, MapPin, Globe, Loader2, ChefHat, Send, CheckCircle2, X } from "lucide-react";

import { API_BASE as API } from "../utils/api";

/**
 * Public Catalog page — accessible without auth at /catalog/:slug
 * Shows the company's signature menu (is_on_menu recipes) and saved packages,
 * plus a quote-request form that creates a Lead in the company's CRM.
 */
export default function PublicCatalogPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [interest, setInterest] = useState([]); // [{type, id, name}]
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", company_name: "",
    event_date: "", guest_count: "", event_type: "", message: "",
  });

  useEffect(() => {
    axios.get(`${API}/api/public/catalog/${slug}`)
      .then((res) => setData(res.data))
      .catch((e) => setError(e?.response?.status === 404 ? "not_found" : "error"))
      .finally(() => setLoading(false));
  }, [slug]);

  const isEs = data?.company?.default_language === "es";
  const t = (es, en) => (isEs ? es : en);

  const toggleInterest = (item) => {
    setInterest((prev) => {
      const exists = prev.find((p) => p.id === item.id && p.type === item.type);
      return exists ? prev.filter((p) => !(p.id === item.id && p.type === item.type)) : [...prev, item];
    });
  };

  const isInterested = (type, id) => interest.some((p) => p.id === id && p.type === type);

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error(t("Nombre y email son requeridos", "Name and email are required"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/api/public/catalog/${slug}/quote-request`, {
        ...form,
        guest_count: form.guest_count ? parseInt(form.guest_count, 10) : null,
        interest_items: interest,
      });
      setSubmitResult(res.data);
      setSubmitted(true);
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message;
      toast.error(typeof msg === "string" ? msg : t("Error al enviar", "Failed to submit"));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }
  if (error === "not_found") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
        <ChefHat className="w-16 h-16 text-slate-300 mb-3" />
        <h1 className="text-2xl font-bold text-slate-700">Catalog not found</h1>
        <p className="text-sm text-slate-500 mt-1">The link is invalid or the catalog isn't published yet.</p>
      </div>
    );
  }
  if (!data) return null;

  const { company, catalog, recipes, menus, allergens } = data;
  const allergenById = Object.fromEntries((allergens || []).map((a) => [a.allergen_id, a]));
  const primary = company.primary_color || "#0F766E";

  // ── Page ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50" data-testid="public-catalog-page">
      {/* HERO */}
      <header className="relative overflow-hidden" style={{ backgroundColor: primary }}>
        {catalog.hero_image_url && (
          <img src={catalog.hero_image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
        )}
        <div className="relative max-w-5xl mx-auto px-6 py-16 sm:py-24 text-white">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {company.logo_url && (
              <img
                src={company.logo_url.startsWith("/api") ? `${API}${company.logo_url}` : company.logo_url}
                alt={company.name}
                className="w-20 h-20 rounded-xl bg-white p-2 object-contain shadow-lg"
              />
            )}
            <div className="flex-1">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight" data-testid="catalog-company-name">
                {company.name}
              </h1>
              {catalog.headline && (
                <p className="mt-3 text-lg sm:text-xl opacity-90 max-w-2xl">{catalog.headline}</p>
              )}
            </div>
          </div>
          {catalog.description && (
            <p className="mt-6 text-base opacity-90 max-w-3xl leading-relaxed">{catalog.description}</p>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              size="lg"
              className="bg-white hover:bg-slate-100 text-slate-900 font-semibold shadow-lg"
              onClick={() => setFormOpen(true)}
              data-testid="open-quote-form-hero"
            >
              <Send className="w-4 h-4 mr-2" />
              {t("Solicitar cotización", "Request a quote")}
            </Button>
            {company.phone && (
              <Button asChild size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                <a href={`tel:${company.phone}`}><Phone className="w-4 h-4 mr-2" />{company.phone}</a>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 space-y-16">
        {/* PACKAGES */}
        {menus.length > 0 && (
          <section data-testid="catalog-packages-section">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">{t("Paquetes destacados", "Featured packages")}</h2>
            <p className="text-slate-600 mb-8 text-sm">
              {t("Soluciones prearmadas para eventos completos.", "Ready-to-go solutions for full events.")}
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {menus.map((m) => {
                const price = m.is_fixed_price ? m.default_price : m.total_price;
                const sel = isInterested("menu", m.menu_id);
                return (
                  <Card
                    key={m.menu_id}
                    className={`group cursor-pointer transition-all hover:shadow-lg ${sel ? "ring-2 ring-emerald-500" : ""}`}
                    onClick={() => toggleInterest({ type: "menu", id: m.menu_id, name: (isEs && m.name_es) || m.name })}
                    data-testid={`catalog-menu-${m.menu_id}`}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-base">{(isEs && m.name_es) || m.name}</h3>
                        <Badge variant="secondary" className="text-[10px]">{m.menu_type}</Badge>
                      </div>
                      {(m.description || m.description_es) && (
                        <p className="text-xs text-slate-600 mb-3 line-clamp-2">{(isEs && m.description_es) || m.description}</p>
                      )}
                      <p className="text-[11px] text-slate-500 mb-3">{(m.items || []).length} {t("ítems incluidos", "items included")}</p>
                      {(m.variants || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {m.variants.map((v) => (
                            <Badge key={v.variant_id || v.name} variant="outline" className="text-[10px]">
                              {v.name}{v.discount_value > 0 ? ` −${v.discount_value}${v.discount_type === "percentage" ? "%" : "$"}` : ""}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-3 border-t">
                        {catalog.show_prices && price > 0 ? (
                          <span className="text-lg font-bold" style={{ color: primary }}>${price.toFixed(2)}</span>
                        ) : (
                          <span className="text-xs text-slate-500">{t("Precio bajo cotización", "Price on request")}</span>
                        )}
                        <Button
                          size="sm" variant={sel ? "default" : "outline"} className="h-7 text-[11px]"
                          onClick={(e) => { e.stopPropagation(); toggleInterest({ type: "menu", id: m.menu_id, name: (isEs && m.name_es) || m.name }); }}
                        >
                          {sel ? <><CheckCircle2 className="w-3 h-3 mr-1" />{t("Añadido", "Added")}</> : t("Me interesa", "Interested")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* RECIPES (BASE MENU) */}
        {recipes.length > 0 && (
          <section data-testid="catalog-recipes-section">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">{t("Nuestro menú", "Our menu")}</h2>
            <p className="text-slate-600 mb-8 text-sm">
              {t("Platos firma elaborados con ingredientes locales.", "Signature dishes made with local ingredients.")}
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {recipes.map((r) => {
                const img = r.photo_url || r.image_url;
                const formats = r.portion_formats || [];
                const minPrice = formats.length > 0
                  ? Math.min(...formats.map((f) => f.sell_price || f.suggested_price || 0).filter((x) => x > 0))
                  : (r.sell_price || r.default_portion_price || 0);
                const sel = isInterested("recipe", r.recipe_id);
                return (
                  <Card
                    key={r.recipe_id}
                    className={`group overflow-hidden transition-all hover:shadow-lg ${sel ? "ring-2 ring-emerald-500" : ""}`}
                    data-testid={`catalog-recipe-${r.recipe_id}`}
                  >
                    {img && (
                      <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                        <img
                          src={img.startsWith("/api") ? `${API}${img}` : img}
                          alt={r.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                    )}
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-semibold text-sm leading-tight">{(isEs && r.name_es) || r.name}</h3>
                        {(r.allergens || []).length > 0 && (
                          <span className="text-orange-500 text-xs" title={`${r.allergens.length} alérgenos`}>⚠</span>
                        )}
                      </div>
                      {(r.description || r.description_es) && (
                        <p className="text-[11px] text-slate-600 line-clamp-2 mb-2">{(isEs && r.description_es) || r.description}</p>
                      )}
                      {(r.allergens || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {r.allergens.slice(0, 3).map((aid) => {
                            const a = allergenById[aid];
                            if (!a) return null;
                            return (
                              <span key={aid} className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                                {a.icon} {isEs ? (a.name_es || a.name) : a.name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {formats.length > 0 && catalog.show_prices && (
                        <div className="flex flex-wrap gap-1.5 mb-3 text-[10px]">
                          {formats.map((f) => (
                            <span key={f.format_id} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                              {f.format_name}: ${(f.sell_price || f.suggested_price || 0).toFixed(2)}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-2 border-t">
                        {catalog.show_prices && minPrice > 0 ? (
                          <span className="text-sm font-bold" style={{ color: primary }}>
                            {formats.length > 1 ? t("desde ", "from ") : ""}${minPrice.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">{t("Bajo cotización", "On request")}</span>
                        )}
                        <Button
                          size="sm" variant={sel ? "default" : "outline"} className="h-7 text-[10px]"
                          onClick={() => toggleInterest({ type: "recipe", id: r.recipe_id, name: r.name })}
                          data-testid={`catalog-recipe-toggle-${r.recipe_id}`}
                        >
                          {sel ? <CheckCircle2 className="w-3 h-3 mr-1" /> : null}
                          {sel ? t("Añadido", "Added") : t("Me interesa", "Interested")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* CONTACT */}
        <section className="bg-white rounded-2xl border p-8" data-testid="catalog-contact-section">
          <h2 className="text-2xl font-bold mb-6">{t("¿Listos para tu evento?", "Ready for your event?")}</h2>
          <div className="grid sm:grid-cols-2 gap-4 mb-6 text-sm">
            {company.email && (
              <a href={`mailto:${company.email}`} className="flex items-center gap-3 text-slate-700 hover:text-slate-900">
                <Mail className="w-4 h-4" style={{ color: primary }} />
                {company.email}
              </a>
            )}
            {company.phone && (
              <a href={`tel:${company.phone}`} className="flex items-center gap-3 text-slate-700 hover:text-slate-900">
                <Phone className="w-4 h-4" style={{ color: primary }} />
                {company.phone}
              </a>
            )}
            {company.address && (
              <div className="flex items-start gap-3 text-slate-700">
                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: primary }} />
                <span>{company.address}{company.city ? `, ${company.city}` : ""}{company.country ? ` · ${company.country}` : ""}</span>
              </div>
            )}
            {company.website && (
              <a href={company.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-slate-700 hover:text-slate-900">
                <Globe className="w-4 h-4" style={{ color: primary }} />
                {company.website}
              </a>
            )}
          </div>
          <Button
            size="lg" className="w-full sm:w-auto"
            style={{ backgroundColor: primary }}
            onClick={() => setFormOpen(true)}
            data-testid="open-quote-form-bottom"
          >
            <Send className="w-4 h-4 mr-2" />
            {t("Solicitar cotización", "Request a quote")}
            {interest.length > 0 && ` (${interest.length} ${t("ítems", "items")})`}
          </Button>
        </section>

        <footer className="text-center text-xs text-slate-400 pt-8">
          {t("Powered by", "Powered by")} <span className="font-semibold">Kora OS</span>
        </footer>
      </main>

      {/* QUOTE REQUEST DIALOG */}
      <Dialog open={formOpen} onOpenChange={(o) => { if (!o) { setFormOpen(false); setSubmitted(false); } }}>
        <DialogContent className="max-w-lg" data-testid="quote-form-dialog">
          <DialogHeader>
            <DialogTitle>{t("Cuéntanos sobre tu evento", "Tell us about your event")}</DialogTitle>
          </DialogHeader>
          {submitted ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-lg font-bold mb-1">{t("¡Solicitud enviada!", "Request sent!")}</h3>
              <p className="text-sm text-slate-600">
                {t(`${company.name} te contactará pronto.`, `${company.name} will contact you soon.`)}
              </p>
              {submitResult?.whatsapp?.visitor_link && (
                <div className="mt-5 space-y-2">
                  <p className="text-xs text-slate-500">
                    {t("¿Prefieres adelantar conversación?", "Want to fast-track the conversation?")}
                  </p>
                  <Button
                    asChild
                    className="bg-[#25D366] hover:bg-[#1ea954] text-white"
                    data-testid="continue-whatsapp-btn"
                  >
                    <a href={submitResult.whatsapp.visitor_link} target="_blank" rel="noopener noreferrer">
                      <svg viewBox="0 0 24 24" className="w-4 h-4 mr-2 fill-current" aria-hidden="true">
                        <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.595 5.39l-.999 3.648 3.893-.737zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/>
                      </svg>
                      {t("Continuar por WhatsApp", "Continue on WhatsApp")}
                    </a>
                  </Button>
                </div>
              )}
              <Button variant="outline" className="mt-5" onClick={() => { setFormOpen(false); setSubmitted(false); setSubmitResult(null); setInterest([]); setForm({ name: "", email: "", phone: "", company_name: "", event_date: "", guest_count: "", event_type: "", message: "" }); }}>
                {t("Cerrar", "Close")}
              </Button>
            </div>
          ) : (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("Nombre", "Name")} *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="quote-form-name" />
                </div>
                <div>
                  <Label>{t("Empresa", "Company")}</Label>
                  <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("Email", "Email")} *</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="quote-form-email" />
                </div>
                <div>
                  <Label>{t("Teléfono", "Phone")}</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>{t("Fecha", "Date")}</Label>
                  <Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
                </div>
                <div>
                  <Label>{t("Invitados", "Guests")}</Label>
                  <Input type="number" min="0" value={form.guest_count} onChange={(e) => setForm({ ...form, guest_count: e.target.value })} />
                </div>
                <div>
                  <Label>{t("Tipo", "Type")}</Label>
                  <Input value={form.event_type} placeholder={t("Boda, corporativo...", "Wedding, corporate...")} onChange={(e) => setForm({ ...form, event_type: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>{t("Mensaje", "Message")}</Label>
                <Textarea rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder={t("Cuéntanos lo que tienes en mente...", "Tell us what you have in mind...")} />
              </div>
              {interest.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3">
                  <p className="text-xs font-semibold text-emerald-900 mb-1.5">{t("Te interesan:", "You're interested in:")}</p>
                  <div className="flex flex-wrap gap-1">
                    {interest.map((i) => (
                      <Badge key={`${i.type}-${i.id}`} variant="secondary" className="text-[10px] gap-1">
                        {i.name}
                        <button type="button" onClick={() => toggleInterest(i)} className="hover:bg-emerald-200 rounded-full">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <Button type="submit" disabled={submitting} className="w-full" style={{ backgroundColor: primary }} data-testid="quote-form-submit">
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                {t("Enviar solicitud", "Send request")}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

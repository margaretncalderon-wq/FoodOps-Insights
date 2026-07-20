# Kora OS — Roadmap

## ✅ Fase 1b · UI del pricing cascade — COMPLETA (Feb 20, 2026)

Fase 1a (backend + cascada determinística de menú) DONE y validada.
Fase 1b (UI) DONE y validada por testing_agent iteration_242.

**Alcance ejecutado:**
- Badges de origen de precio en Recipe editor, Portion Formats, PlatedMenuBuilder.
- Settings consolidado en "Política de Precio y Margen" con sub-bloques A y B.
- `sell_price` y `min_margin_pct` reubicados de tab Básico a tab Costeo.
- Suggested Price marcado como "referencia" + fórmula visible.

**Pendiente P2 (no crítico):**
- Fusión completa estilo Gastrokaizen (una sola tabla con PVP inline editable
  y margen bruto en vivo por fila). Actualmente PVP se edita a nivel receta,
  y el modal "Editar Formato" persiste. La consolidación total en una tabla
  única puede hacerse en una iteración posterior si el usuario lo pide.

## Próximas iteraciones sugeridas

- **P1** · Surface daily Culinary Insights (Variance, Staleness, Low Stock,
  unresolvable conversions) en System Pulse / FoodOps dashboard con
  deep-links a acción.
- **P1** · Smart empty states + onboarding para Menu Engineering y Cost
  Variance dialogs.
- **P1** · Data Capture Tour (wizard para agregar precios rápidamente a
  top recetas).
- **P1** · E-Invoicing Fase 1B+ (XML DGII + firma digital) — pausado
  hasta que el usuario provea certificados de prueba.

## Otras deudas registradas

- Sales report toggle "Ocultar inactivos" (Feb 2026) — ya DONE.
- Portion format cascade + PUT edit — ya DONE.
- Feature flag `PASE_A_ENABLED` — eliminar en commit de limpieza dentro
  de 2 semanas post-deploy estable.
- 3 aceites en producción de Ciano necesitan normalize-cost (endpoint ya
  existe; falta que usuario lo dispare).
- **P2** · Extraer secciones de `server.py` (~16k líneas) a routers
  dedicados: Menu Engineering, Cost Variance, Plated Menus.
- **P2** · Unified Contact Model & Communications components.
- **P2** · Fusión final Gastrokaizen (tabla única con PVP inline por
  formato + margen bruto en vivo).

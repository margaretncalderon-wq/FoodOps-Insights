# Kora OS — Roadmap

## Fase 1b · UI del pricing cascade (registrada Feb 20, 2026)

Fase 1a (backend + cascada determinística de menú) está DONE y validada.
Falta la parte visual — no perder entre turnos.

### Alcance Fase 1b

1. **Badges de fuente de precio** en la UI:
   - Receta (pestaña Costeo): badge junto al precio que diga
     `Manual` / `Formato` / `Método receta (Food Cost 30%)` / `Método empresa` / `Sólo costo`.
   - Formato de porción: mismo badge en cada fila.
   - Menú: badge junto a `price_per_guest` que diga `Manual` o `Sugerido calculado`.
   - Todos consumen `/api/pricing/resolve` (endpoint ya expuesto en Fase 1a).

2. **Settings — pantalla "Política de Precio y Margen"** consolidando dos sub-bloques:
   - Sub-bloque A · Motor de precio (método activo, targets Food/Prime/Markup, chef $/h, overhead %).
   - Sub-bloque B · Margen mínimo de alerta (Política de Margen por tipo/categoría/ítem).
   - Con rótulos explícitos: "Food 30% es TARGET DE CÁLCULO; Food 35% es PISO DE ALERTA".

3. **Receta — fusión estilo Gastrokaizen** del bloque "Costeo y Precio" + modal "Editar Formato":
   - Una sola tabla en la pestaña Costeo: `Formato | Raciones obtenidas | PVP editable | Costo ración | Margen bruto en vivo`.
   - Override por fila; eliminar `sell_price` + `min_margin_pct` sueltos de la pestaña Básico.

4. **Menú — eliminar "3 números casi iguales"**:
   - Uno oficial (Sugerido Calculado, del cascade), otros como referencia rotulada.
   - "Precio Base por Invitado" pasa a ser override explícito claramente marcado.

### Otras deudas registradas

- Sales report toggle "Ocultar inactivos" (Feb 2026) — ya DONE.
- Portion format cascade + PUT edit — ya DONE.
- Feature flag `PASE_A_ENABLED` — eliminar en commit de limpieza dentro de 2 semanas post-deploy estable.
- 3 aceites en producción de Ciano necesitan normalize-cost (endpoint ya existe; falta que usuario lo dispare).

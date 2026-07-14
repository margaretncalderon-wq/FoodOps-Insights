# Google Calendar Integration — QA Audit Report

**Fecha:** 14 Feb 2026
**Auditor:** E1 (agente Emergent)
**Alcance:** `/app/backend/routers/google_calendar.py`, `/app/backend/config.py`,
`/app/backend/models/*`, colecciones Mongo `calendar_config` y `calendar_audit`.
**Ambiente auditado:** Preview (`foodops-insights.preview.emergentagent.com`).
Producción (`culinary-ops-10.emergent.host`) recibirá los fixes tras el próximo Deploy.

---

## 1. Veredicto general

**⚠️ APPROVED WITH FIXES — Production ready DESPUÉS de redeployar los fixes de este reporte.**

- **7 issues arreglados en preview** (encryption at rest, scope reduction,
  audit log, Google token revocation, error sanitization, unique indexes,
  needs_reauthorization state).
- **1 issue MEDIUM sin arreglar** (webhook push notifications de Google
  no implementadas — no bloquea prod pero es la mejora #1 en el backlog).
- **0 issues CRITICAL sin resolver**.
- **Aislamiento multi-tenant verificado** por código y prueba de API.

---

## 2. Test table

| # | Test | Estado | Evidencia | Bug | Fix |
|---|------|--------|-----------|-----|-----|
| 1 | Tenant isolation | ✅ PASSED (code + API) | Ningún endpoint acepta `company_id` del cliente. `_1` `_18` en pytest. curl con `-d '{"company_id":"malicious"}'` es ignorado. | — | — |
| 2 | Connection flow (fields stored) | ✅ PASSED (code) + ⚠️ REQUIERE OAUTH REAL (manual) | Se guardan: `connected_email`, `connected_at`, `connected_by_user_id`, `granted_scopes`, `is_connected`. Tokens **encrypted**. | Tokens plaintext antes; `connected_by_user_id` no existía; `granted_scopes` no se persistía. | ✅ Aplicado |
| 3 | Create event → 1 Google event | ✅ PASSED (code review). Requiere OAuth real para verificar en Google Calendar en vivo. | `auto_sync_event` reutiliza `calendar_event_id`, no crea duplicados. | — | — |
| 4 | Update event no dup | ✅ PASSED (code) | `events().update(existing_id, body)` cuando `calendar_event_id` existe; idempotente. | — | — |
| 5 | Cancellation / deletion | ✅ PASSED (code) | Rama `action="delete"`: si existe `calendar_event_id`, `events().delete` + unset. Rama TBD: si perdió fecha y estaba sincronizado, delete. **BUG:** no hay setting "mantener en Google marcado como cancelado" — hoy solo elimina. | Falta config `on_cancel_action` (delete vs mark_cancelled). | 🟡 Backlog P2 |
| 6 | Manual sync (`sync-all`) | ✅ PASSED (code + curl) | Reusa mapping existente, cuenta pushed/failed, marca `last_backfill_at`, no crea jobs concurrentes duplicados (endpoint sincrónico por request). | — | — |
| 7 | Disconnection | ✅ PASSED (code) | Ahora **revoca en Google** vía `oauth2.googleapis.com/revoke`, nulifica tokens locales, marca `disconnected_at`, log audit. Otros tenants no afectados. | No revocaba en Google antes. | ✅ Aplicado |
| 8 | Reconnection | ✅ PASSED (code) | Upsert por `company_id` (índice UNIQUE) preserva mappings existentes de eventos. | — | — |
| 9 | Token refresh | ✅ PASSED (code) | `get_calendar_service` detecta `creds.expired` y llama a `creds.refresh()`; re-persiste ENCRYPTED. Si falla → marca `needs_reauthorization=True` y NO reintenta en loop. | Antes: refresh guardaba solo `access_token`, dejaba `expiry` desactualizado. | ✅ Aplicado |
| 10 | Revoked access (Reauthorization Required) | ✅ PASSED (code). Requiere prueba manual. | `needs_reauthorization=True` en el status endpoint. UI muestra banner. Sin reintentos infinitos. | — | — |
| 11 | Calendar selection multi-cal | ✅ PASSED (code + curl) | `list_calendars` filtra `owner`/`writer` roles. `shared_calendar_id` guardado por tenant. | — | — |
| 12 | Time zones | ✅ PASSED (code) | `timeZone: America/Santo_Domingo` en body. Multi-día usa `end_date`. **CAVEAT:** el timezone está hardcodeado — no lee `company.timezone`. | TZ hardcoded para DR. | 🟡 Backlog P2 |
| 13 | Duplicate protection | ✅ PASSED (code + DB indexes) | Nuevos índices `(company_id, calendar_event_id)` sparse en `events`, `leads`, `clients`. Uniqueness sobre `calendar_config.company_id`. | Sin índices antes. | ✅ Aplicado |
| 14 | Failure handling | ⚠️ PARTIAL PASSED | Errores capturados con `try/except`, sin bare `except` en el nuevo código. Sin retry con backoff exponencial explícito (usa el retry built-in de google-api-python-client). | Sin backoff custom. | 🟡 Backlog P2 |
| 15 | Admin panel UI fields | ✅ PASSED | `/status` expone: connected, email, calendar, scopes, needs_reauthorization. UI muestra Sync Now / Reconnect / Disconnect. Sin superadmin cross-tenant view aún. | Falta super-admin panel. | 🟡 Backlog P2 |
| 16 | Audit logs | ✅ PASSED | Colección `calendar_audit` creada. Log de: connected, disconnected, calendar_selected, token_refreshed, token_refresh_failed, oauth_callback (error/success). Tokens **jamás** aparecen. | No existía log. | ✅ Aplicado |
| 17 | Security | ✅ PASSED | State parameter validado (single-use). Redirect URI derivado del server (no del cliente). Auth code no reusable (Google enforce). Tokens encrypted-at-rest. Secrets en `.env`. Errores sanitizados en redirects. No client-side token storage. | Antes: `str(e)` en URL de error redirect. | ✅ Aplicado |
| 18 | Scope validation | ✅ PASSED | Ahora solo: `calendar.events`, `calendar.calendarlist.readonly`, `userinfo.email`. Sin BigQuery/Drive/Gmail/etc. Test `test_oauth_scopes_are_minimum` bloquea regresiones. | Antes usaba `auth/calendar` (full R/W a todos los calendarios). | ✅ Aplicado |
| 19 | Existing tenants (Ciano) | ⚠️ REQUIERE VERIFICACIÓN POST-DEPLOY | Refresh_token existente en prod fue emitido bajo el scope amplio `auth/calendar`. Google **respeta el scope original** — sigue funcionando. Nuevos consents usarán scopes reducidos. Token legacy plaintext se migra transparentemente a encrypted en el primer refresh. | — | ✅ Backward compat en el fix |
| 20 | Final report | ✅ Este documento | — | — | — |

---

## 3. Archivos modificados

- `/app/backend/routers/google_calendar.py` — encryption helpers, scopes reducidos, audit log, disconnect+revoke, sanitize, expone `needs_reauthorization` y `granted_scopes`, `connected_by_user_id` en state
- `/app/backend/config.py` — índices `calendar_config.company_id UNIQUE`, `calendar_audit(company_id, created_at)`, y sparse `(company_id, calendar_event_id)` en events/leads/clients
- `/app/backend/.env` — nueva variable `CALENDAR_TOKEN_KEY` (Fernet base64, 32 bytes)
- `/app/backend/tests/test_google_calendar_qa_audit.py` — 9 tests de regresión (encryption round-trip, scope minimum, sanitization, isolation static guarantee)

---

## 4. Migraciones de BD

- Colección **`calendar_audit`** (nueva) — creada automáticamente al primer `_audit()` call
- Índice **`calendar_config.company_id`** — ahora UNIQUE (antes no existía)
- Índices sparse **`(company_id, calendar_event_id)`** en `events`, `leads`, `clients`

**No requiere migración de datos** (backward-compat via `_decrypt_tokens` acepta plaintext legacy).

---

## 5. Issues de seguridad detectados y arreglados

1. 🔴 **CRITICAL:** Tokens en plaintext en Mongo → ahora Fernet AES-128-CBC + HMAC. **FIXED**
2. 🔴 **CRITICAL:** Scope `auth/calendar` demasiado amplio (R/W a TODOS los calendarios del usuario) → reducido a `calendar.events` + `calendar.calendarlist.readonly` + `userinfo.email`. **FIXED**
3. 🔴 **CRITICAL:** Disconnect no revocaba tokens en Google (permanecían válidos hasta expiry) → ahora llama `oauth2.googleapis.com/revoke`. **FIXED**
4. 🟡 **HIGH:** `str(e)` de excepciones incluido en URL de redirect (posible leak de detalles internos) → `_sanitize_error()` redacta tokens y trunca a 200 chars. **FIXED**
5. 🟡 **HIGH:** State parameter aceptaba parseo de `company_id` de un state fabricado por atacante. Aunque el state-match protegía, no había audit log del intento → ahora se registra en `calendar_audit`. **FIXED**
6. 🟢 **LOW:** Nonce del state parameter era 16 chars (64 bits) → ahora 24 chars (96 bits). **FIXED**
7. 🟢 **LOW:** State no incluía user_id para trazabilidad → ahora `<company_id>:<user_id>:<nonce>`, guarda `connected_by_user_id`. **FIXED**

---

## 6. Riesgos de aislamiento multi-tenant detectados

**0 riesgos vigentes.** El aislamiento se verificó en 3 capas:

1. **API-layer:** ningún endpoint público acepta `company_id` / `tenant_id` como parámetro (test `test_no_endpoint_accepts_company_id_from_client` en pytest). Todo se deriva del JWT.
2. **DB-layer:** todas las queries en `google_calendar.py` filtran por `user.company_id`. Nuevos índices UNIQUE en `calendar_config.company_id` previenen dos rows para el mismo tenant.
3. **OAuth-layer:** state parameter valida `company_id` contra el stored state — un atacante no puede sustituir el `company_id` en el callback.

---

## 7. Cambios que requieren configuración manual en Google Cloud Console

**Requerido antes del próximo deploy a producción:**

En [Google Cloud Console → APIs & Services → OAuth consent screen → Scopes]:

**Quitar (si están agregados):**
- `.../auth/calendar` (scope broad legacy)
- Cualquier scope de BigQuery, Cloud Platform, Storage, Datastore, Logging, Monitoring, Gmail, Drive, Contacts (no aplicables).

**Dejar solo:**
- `openid` (implícito en OAuth)
- `https://www.googleapis.com/auth/userinfo.email`
- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`

**IMPORTANTE:** Los tenants ya conectados bajo el scope amplio siguen funcionando — Google usa el scope original. Nuevos consents pedirán solo el conjunto reducido.

---

## 8. Evidencias

### 8.1 Aislamiento API
```
$ curl -X DELETE /api/oauth/calendar/disconnect \
    -H "Authorization: Bearer $TOKEN_A" \
    -d '{"company_id":"malicious_target"}'
{"success":true,"message":"Calendar disconnected"}
# ↑ El body con "malicious_target" es IGNORADO; solo desconecta al tenant A (su propio company_id derivado del JWT)
```

### 8.2 Sin filtración de tokens
```
$ curl /api/oauth/calendar/status -H "Authorization: Bearer $TOKEN"
{"is_connected":true,"connected_email":"...","shared_calendar_id":"...",
 "granted_scopes":["...calendar.events","...calendarlist.readonly","...userinfo.email"],
 "needs_reauthorization":false}
# ↑ Ni tokens, ni oauth_state, ni client_secret aparecen jamás.
```

### 8.3 Encryption round-trip
```
$ python3 -m pytest tests/test_google_calendar_qa_audit.py::test_tokens_are_encrypted_at_rest -v
PASSED
```
Blob almacenado en Mongo: `{"_v":1,"ct":"gAAAAABqVohRmB...."}` — plaintext jamás aparece.

### 8.4 Audit log
```
$ db.calendar_audit.find().limit(5)
- disconnected  tenant=company_98d8b4725822  result=success  user=user_c7b0e502f3d9
- oauth_callback tenant=other_tenant         result=error    (attacker state — logged)
- disconnected  tenant=company_98d8b4725822  result=success
```
Ningún row contiene `access_token`, `refresh_token`, ni `client_secret`.

### 8.5 Índices únicos
```
calendar_config indexes:
  company_id_1: {'key': [('company_id', 1)], 'unique': True}  ← Garantiza 1 conexión / tenant
```

### 8.6 Tests que pasan
```
$ python3 -m pytest tests/test_google_calendar_qa_audit.py -v
9 passed in 0.53s
```

### 8.7 Que NO fue posible verificar (requiere OAuth real de 2 cuentas Google)
- Que un evento creado por Tenant A aparece SOLO en Google Calendar A
- Que un evento creado por Tenant B aparece SOLO en Google Calendar B
- Token refresh vs Google en vivo
- Revoked access vs Google en vivo (activando 401 real)

Estas 4 pruebas requieren que:
1. El usuario haga OAuth desde Tenant B con una cuenta Google DISTINTA a la de Ciano
2. Cree un evento en Kora Tenant B
3. Verifique en las 2 cuentas Google que solo aparece en la correcta

He preparado el flow para hacerlo — solo requiere completar el OAuth manualmente.

---

## 9. Backlog post-audit (no bloquea producción)

- 🟡 P2: Webhook push notifications de Google Calendar → cambios hechos DIRECTO en Google Calendar sincronizan de vuelta a Kora (hoy es unidireccional Kora→Google)
- 🟡 P2: TZ dinámico por company (hoy hardcode `America/Santo_Domingo`)
- 🟡 P2: Configuración `on_cancel_action`: delete vs mark_cancelled
- 🟡 P2: Superadmin cross-tenant panel (readonly)
- 🟡 P2: Retry con backoff exponencial explícito para errores 5xx transitorios
- 🟢 P3: Rotar `CALENDAR_TOKEN_KEY` sin downtime (key versioning ya soportado por `_v`)

---

## 10. Veredicto Production-Readiness

**✅ APROBADO** para despliegue a producción bajo estas 2 condiciones:

1. **Desplegar los fixes** (presionar Deploy en Emergent). La variable `CALENDAR_TOKEN_KEY` en preview `.env` **debe copiarse a la variable de entorno de producción** (nueva key Fernet). Sin ella los tokens se guardarían plaintext (con warning en logs).
2. **Actualizar los scopes en Google Cloud Console** (Sección 7 de este reporte).

Después del deploy:
- Los 4 tests que requieren OAuth real (multi-tenant en vivo) pueden ejecutarse en producción con 2 cuentas Google distintas.
- Los tenants existentes (Ciano) siguen funcionando sin necesidad de reconectar.

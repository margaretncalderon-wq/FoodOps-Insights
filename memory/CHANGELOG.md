# Kora OS - Changelog

## March 14-15, 2026

### Feature: Rich Text Content Editor for Posts & Ideas (Demand Studio)
- Added `content_body` field to SocialPostCreate, SocialPost, ContentIdeaCreate, ContentIdea models
- Enhanced RichTextEditor with Strikethrough, Checklist, multi-color highlight picker (9 colors)
- Integrated as "Contenido / Script" section in Post and Idea dialogs
- Fixed Enter key and bullet points visibility in editor

### Feature: RichTextEditor + File Attachments in Execution Hub
- Integrated RichTextEditor for Goal Notes, Task Descriptions, and Task Notes
- File attachments in notes (images, PDFs, Word, Excel, video - max 15MB)
- NoteAttachments component with image thumbnails and document download links

### Bug Fix: Full CRUD Access for Shared Company Profiles (Demand Studio)
- Fixed 8 backend endpoints to accept `org_id` query param with membership fallback
- Frontend: All CRUD calls now send org_id via getOrgParam()

### Bug Fix: Missing Memberships for Company Owners (Ciano Gourmet)
- Root cause: Users who owned companies had no membership record, breaking aggregated visibility
- Fix: `ensure_owner_membership()` auto-creates admin membership on first API call
- Migration: Backfilled 40 missing memberships across all users

### Feature: New "Calendarizado/Calendar" Status
- Added between "Idea" and "Production" for scheduling workflow

### Feature: Renamed "Borrador/Drafted" to "Listo/Ready"
- Status label updated across all views and dropdowns

### Feature: Archived Tab in Demand Studio
- New tab between Feed and Metrics shows archived posts and ideas
- Edit, restore, or delete archived items directly

### Feature: Platform Icons in Calendar
- Calendar post cards show platform icons (Instagram, TikTok, etc.) instead of colored dots
- Channel filter dropdown shows platform icons next to account names

### Bug Fix: Text Overflow in Execution Hub
- Fixed horizontal overflow in tasks, notes, decisions, dependencies

### Bug Fix: Delete Tasks in Execution Hub
- New DELETE /api/execution-hub/tasks/{id} endpoint with task count update

## March 12, 2026
### Previous session fixes (auth, visibility, notifications, UI)

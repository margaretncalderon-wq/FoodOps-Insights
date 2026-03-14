# Kora OS - Changelog

## March 14, 2026

### Feature: Rich Text Content Editor for Posts & Ideas (Demand Studio)
- Added `content_body` field to SocialPostCreate, SocialPost, ContentIdeaCreate, ContentIdea models
- Enhanced RichTextEditor with Strikethrough and Checklist buttons
- Integrated as "Contenido / Script" section in Post and Idea dialogs
- All CRUD endpoints handle content_body (create, update, duplicate, convert)

### Bug Fix: Full CRUD Access for Shared Company Profiles (Demand Studio)
- Fixed 8 backend endpoints to accept `org_id` query param with membership fallback
- Frontend: All CRUD calls now send org_id via getOrgParam()

### Bug Fix: RichTextEditor Issues
- Fixed Enter key not creating new lines (manual br insertion)
- Fixed bullet points and numbered lists not visible (explicit CSS list-style-type)
- Added multi-color highlight picker (9 colors + remove option)

### Feature: RichTextEditor in Execution Hub
- Integrated RichTextEditor for Goal Notes, Task Descriptions, and Task Notes
- Replaced plain Textarea/Input with full rich text editing capabilities
- Notes/descriptions now render HTML with dangerouslySetInnerHTML

### Bug Fix: Text Overflow in Execution Hub
- Fixed horizontal text overflow in task cards, note cards, decisions, and dependencies
- Added break-words, overflow-hidden, min-w-0 to all text containers

### Feature: File Attachments in Execution Hub Notes
- New upload endpoint: POST /api/execution-hub/upload-attachment (images, PDFs, Word, Excel, PPT, CSV, video, max 15MB)
- New serve route: GET /api/uploads/exec_attachments/{filename}
- NoteAttachments component: upload UI with preview (image thumbnails) and download links (documents)
- Integrated in Goal Notes and Task Notes with "Adjuntar archivo" button
- Backend: goal notes and task notes now store `attachments` array
- Tests: Backend 7/7, Frontend 100%

## March 12, 2026

### Feature: Sub-Audiences in Metrics/Insights
### Feature: Quick Status Change Buttons  
### Feature: Calendar Drag & Drop
### Bug Fix: Unstable User Sessions (P1 recurring 6+)
### Bug Fix: Team Visibility in Demand Studio
### Bug Fix: Production Login Failure
### Bug Fix: Incomplete Modules for Invited Users
### Bug Fix: Incorrect Company Name in Org Switcher
### Bug Fix: Save Dialog Issues
### Bug Fix: Deleted Posts on Calendar

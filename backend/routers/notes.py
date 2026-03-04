# routers/notes.py - Notes endpoints for Demand Studio
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from config import db
from models.auth import User
from routers.auth import get_current_user

notes_router = APIRouter(prefix="/demand-studio/notes", tags=["notes"])


async def get_effective_company_id(user: User, org_id: Optional[str] = None):
    """Get the effective company_id based on user's access"""
    own_company_id = user.company_id or user.active_org_id
    
    if not org_id or org_id == own_company_id:
        return own_company_id, "owner"
    
    # Check if user has membership to the requested org
    membership = await db.memberships.find_one(
        {
            "user_id": user.user_id,
            "$or": [{"company_id": org_id}, {"organization_id": org_id}]
        },
        {"_id": 0, "role": 1}
    )
    
    if not membership:
        return None, None
    
    return org_id, membership.get("role", "viewer")

class NoteCreate(BaseModel):
    title: str
    content: Optional[str] = ""
    folder_id: Optional[str] = None
    color: Optional[str] = "default"
    tags: Optional[List[str]] = []
    linked_campaign_id: Optional[str] = None
    attachments: Optional[List[dict]] = []

class FolderCreate(BaseModel):
    name: str

class AISummarizeRequest(BaseModel):
    content: str

class AIExtractActionsRequest(BaseModel):
    content: str

# ============== FOLDERS ==============

@notes_router.get("/folders")
async def get_folders(
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all note folders for the organization"""
    if org_id:
        effective_company_id, role = await get_effective_company_id(user, org_id)
        if not effective_company_id:
            raise HTTPException(status_code=403, detail="No access to this organization")
        company_id = effective_company_id
    else:
        company_id = user.company_id or user.active_org_id
    
    folders = await db.note_folders.find(
        {"company_id": company_id},
        {"_id": 0}
    ).to_list(100)
    return folders

@notes_router.post("/folders")
async def create_folder(data: FolderCreate, user: User = Depends(get_current_user)):
    """Create a new folder"""
    company_id = user.company_id or user.active_org_id
    now = datetime.now(timezone.utc)
    
    folder = {
        "folder_id": f"folder_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "name": data.name,
        "created_by": user.user_id,
        "created_at": now.isoformat()
    }
    
    await db.note_folders.insert_one(folder)
    folder.pop("_id", None)
    return folder

@notes_router.delete("/folders/{folder_id}")
async def delete_folder(folder_id: str, user: User = Depends(get_current_user)):
    """Delete a folder (notes in it become unorganized)"""
    company_id = user.company_id or user.active_org_id
    
    result = await db.note_folders.delete_one({
        "folder_id": folder_id,
        "company_id": company_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Remove folder reference from notes
    await db.notes.update_many(
        {"folder_id": folder_id, "company_id": company_id},
        {"$set": {"folder_id": None}}
    )
    
    return {"status": "deleted"}

# ============== NOTES ==============

@notes_router.get("")
async def get_notes(
    folder_id: Optional[str] = None,
    tag: Optional[str] = None,
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all notes for the organization"""
    if org_id:
        effective_company_id, role = await get_effective_company_id(user, org_id)
        if not effective_company_id:
            raise HTTPException(status_code=403, detail="No access to this organization")
        company_id = effective_company_id
    else:
        company_id = user.company_id or user.active_org_id
    
    query = {"company_id": company_id}
    if folder_id:
        query["folder_id"] = folder_id
    if tag:
        query["tags"] = tag
    
    notes = await db.notes.find(query, {"_id": 0}).sort("updated_at", -1).to_list(500)
    return notes

@notes_router.get("/{note_id}")
async def get_note(note_id: str, user: User = Depends(get_current_user)):
    """Get a specific note"""
    company_id = user.company_id or user.active_org_id
    
    note = await db.notes.find_one(
        {"note_id": note_id, "company_id": company_id},
        {"_id": 0}
    )
    
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    return note

@notes_router.post("")
async def create_note(data: NoteCreate, user: User = Depends(get_current_user)):
    """Create a new note"""
    company_id = user.company_id or user.active_org_id
    now = datetime.now(timezone.utc)
    
    note = {
        "note_id": f"note_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "title": data.title,
        "content": data.content,
        "folder_id": data.folder_id,
        "color": data.color,
        "tags": data.tags or [],
        "linked_campaign_id": data.linked_campaign_id,
        "attachments": data.attachments or [],
        "created_by": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.notes.insert_one(note)
    note.pop("_id", None)
    return note

@notes_router.put("/{note_id}")
async def update_note(note_id: str, data: NoteCreate, user: User = Depends(get_current_user)):
    """Update a note"""
    company_id = user.company_id or user.active_org_id
    now = datetime.now(timezone.utc)
    
    update_data = {
        "title": data.title,
        "content": data.content,
        "folder_id": data.folder_id,
        "color": data.color,
        "tags": data.tags or [],
        "linked_campaign_id": data.linked_campaign_id,
        "attachments": data.attachments or [],
        "updated_at": now.isoformat()
    }
    
    result = await db.notes.update_one(
        {"note_id": note_id, "company_id": company_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    
    return await db.notes.find_one({"note_id": note_id}, {"_id": 0})

@notes_router.delete("/{note_id}")
async def delete_note(note_id: str, user: User = Depends(get_current_user)):
    """Delete a note"""
    company_id = user.company_id or user.active_org_id
    
    result = await db.notes.delete_one({
        "note_id": note_id,
        "company_id": company_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    
    return {"status": "deleted"}

# ============== AI FEATURES ==============

@notes_router.post("/ai/summarize")
async def ai_summarize_note(data: AISummarizeRequest, user: User = Depends(get_current_user)):
    """Use AI to summarize note content"""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    import os
    import uuid
    
    if not data.content.strip():
        raise HTTPException(status_code=400, detail="Content is required")
    
    try:
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI not configured")
        
        session_id = f"summarize_{uuid.uuid4().hex[:8]}"
        llm = LlmChat(
            api_key=api_key, 
            session_id=session_id,
            system_message="You are a helpful assistant that summarizes content concisely."
        )
        llm = llm.with_model("openai", "gpt-4o-mini")
        
        response = await llm.send_message(UserMessage(text=f"""Summarize the following note content in a concise way. 
Keep the summary to 2-3 sentences maximum. Be direct and focus on the key points.

Note content:
{data.content}

Summary:"""))
        
        return {"summary": response.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")

@notes_router.post("/ai/extract-actions")
async def ai_extract_actions(data: AIExtractActionsRequest, user: User = Depends(get_current_user)):
    """Use AI to extract action items from note content"""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    import os
    import uuid
    
    if not data.content.strip():
        raise HTTPException(status_code=400, detail="Content is required")
    
    try:
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI not configured")
        
        session_id = f"actions_{uuid.uuid4().hex[:8]}"
        llm = LlmChat(
            api_key=api_key, 
            session_id=session_id,
            system_message="You are a helpful assistant that extracts action items from notes."
        )
        llm = llm.with_model("openai", "gpt-4o-mini")
        
        response = await llm.send_message(UserMessage(text=f"""Extract action items from the following note content.
Return only actionable tasks, one per line. Be specific and concise.
If there are no clear action items, respond with "No action items found."

Note content:
{data.content}

Action items:"""))
        
        # Parse the response into a list
        actions_text = response.strip()
        if "no action items" in actions_text.lower():
            return {"actions": []}
        
        actions = [
            line.strip().lstrip("-•*").strip() 
            for line in actions_text.split("\n") 
            if line.strip() and not line.strip().lower().startswith("action items")
        ]
        
        return {"actions": actions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")

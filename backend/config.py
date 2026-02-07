# config.py - Database connection and settings
import os
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'eep-evoque-secret-key')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7

# Google OAuth
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

# CORS Origins
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "").split(",") if os.environ.get("CORS_ORIGINS") else []


# Create indexes for better query performance
async def create_indexes():
    """Create database indexes for optimal query performance"""
    try:
        # Users indexes
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id")
        await db.users.create_index("company_id")
        
        # Events indexes
        await db.events.create_index("company_id")
        await db.events.create_index("event_id", unique=True)
        await db.events.create_index([("company_id", 1), ("stage", 1)])
        await db.events.create_index([("company_id", 1), ("event_date", -1)])
        
        # Clients indexes
        await db.clients.create_index("company_id")
        await db.clients.create_index("client_id", unique=True)
        await db.clients.create_index([("company_id", 1), ("client_type", 1)])
        
        # Invoices indexes
        await db.invoices.create_index("company_id")
        await db.invoices.create_index("invoice_id", unique=True)
        await db.invoices.create_index([("company_id", 1), ("status", 1)])
        await db.invoices.create_index([("company_id", 1), ("event_id", 1)])
        
        # Ingredients/Inventory indexes
        await db.ingredients.create_index("company_id")
        await db.ingredients.create_index("ingredient_id", unique=True)
        await db.ingredients.create_index([("company_id", 1), ("inventory_type", 1)])
        
        # Recipes indexes
        await db.recipes.create_index("company_id")
        await db.recipes.create_index("recipe_id", unique=True)
        
        # Organizations indexes
        await db.organizations.create_index("company_id", unique=True)
        
        # Memberships indexes
        await db.memberships.create_index("user_id")
        await db.memberships.create_index("company_id")
        await db.memberships.create_index([("user_id", 1), ("company_id", 1)])
        
        # Notifications indexes
        await db.notifications.create_index("company_id")
        await db.notifications.create_index([("company_id", 1), ("read", 1)])
        await db.notifications.create_index([("company_id", 1), ("created_at", -1)])
        
        # Suppliers indexes
        await db.suppliers.create_index("company_id")
        await db.suppliers.create_index("supplier_id", unique=True)
        
        # Delivery notes indexes
        await db.delivery_notes.create_index("company_id")
        await db.delivery_notes.create_index("note_id", unique=True)
        await db.delivery_notes.create_index([("company_id", 1), ("status", 1)])
        
        # Execution Hub indexes
        await db.execution_goals.create_index("company_id")
        await db.execution_goals.create_index("goal_id", unique=True)
        await db.execution_goals.create_index("owner_id")
        await db.execution_goals.create_index([("company_id", 1), ("status", 1)])
        await db.execution_goals.create_index([("company_id", 1), ("created_at", -1)])
        
        await db.execution_tasks.create_index("goal_id")
        await db.execution_tasks.create_index("task_id", unique=True)
        await db.execution_tasks.create_index("assignees.user_id")
        await db.execution_tasks.create_index([("goal_id", 1), ("status", 1)])
        
        await db.execution_decisions.create_index("goal_id")
        await db.execution_decisions.create_index("decision_id", unique=True)
        
        await db.execution_dependencies.create_index("goal_id")
        await db.execution_dependencies.create_index("dependency_id", unique=True)
        
        await db.execution_access.create_index("goal_id")
        await db.execution_access.create_index("user_id")
        await db.execution_access.create_index([("goal_id", 1), ("user_id", 1)])
        
        # Add-ons indexes
        await db.addon_definitions.create_index("addon_id", unique=True)
        await db.addon_definitions.create_index("is_active")
        
        await db.organization_addons.create_index("org_addon_id", unique=True)
        await db.organization_addons.create_index("company_id")
        await db.organization_addons.create_index([("company_id", 1), ("status", 1)])
        await db.organization_addons.create_index([("company_id", 1), ("addon_type", 1)])
        
        print("✓ Database indexes created successfully")
    except Exception as e:
        print(f"Warning: Could not create indexes: {e}")

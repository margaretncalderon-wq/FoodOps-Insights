import asyncio
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


FIXTURE_EVENT_ID = "event_qa_print_spacing_20260729"
FIXTURE_PROPOSAL_ID = "prop_qa_print_spacing_20260729"


async def main():
    load_dotenv(Path('/app/backend/.env'))
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ.get('DB_NAME', 'test_database')]

    user = await db.users.find_one({'email': 'demo.agency@kora.com'}, {'_id': 0, 'company_id': 1})
    if not user:
        raise RuntimeError('demo.agency@kora.com not found')
    company_id = user['company_id']
    existing_client = await db.clients.find_one({'company_id': company_id}, {'_id': 0, 'client_id': 1, 'display_name': 1, 'email': 1, 'phone': 1})
    if not existing_client:
        existing_client = {
            'client_id': 'client_qa_print_spacing_20260729',
            'company_id': company_id,
            'display_name': 'Cliente QA Print',
            'name': 'Cliente QA Print',
            'email': 'qa-print@example.com',
            'phone': '+1 555 0100',
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }
        await db.clients.insert_one(existing_client)

    now = datetime.now(timezone.utc).isoformat()
    event_doc = {
        'event_id': FIXTURE_EVENT_ID,
        'company_id': company_id,
        'client_id': existing_client['client_id'],
        'name': 'QA Print Spacing Proposal Event',
        'event_type': 'corporate',
        'engagement_type': 'event',
        'event_date': '2026-08-15T00:00:00+00:00',
        'event_date_tbd': False,
        'end_date': '2026-08-16T00:00:00+00:00',
        'event_dates': ['2026-08-15', '2026-08-16'],
        'start_time': '18:00',
        'end_time': '22:00',
        'is_booking': True,
        'venue': 'Salón QA Espaciado',
        'guest_count': 120,
        'budget': 18000.0,
        'notes': 'Fixture for DocumentPreview proposal print spacing verification.',
        'status': 'planning',
        'stage': 'Scope Drafted',
        'timeline': [],
        'tasks': [],
        'menu_items': [],
        'documents': [],
        'created_at': now,
        'updated_at': now,
    }
    await db.events.update_one(
        {'event_id': FIXTURE_EVENT_ID, 'company_id': company_id},
        {'$set': event_doc},
        upsert=True,
    )

    proposal_doc = {
        'proposal_id': FIXTURE_PROPOSAL_ID,
        'event_id': FIXTURE_EVENT_ID,
        'company_id': company_id,
        'proposal_number': 'QA-PRINT-2026-0729',
        'status': 'Draft',
        'valid_until': None,
        'client_notes': 'Notas QA: validar que el PDF impreso mantiene el mismo espaciado que la vista previa.',
        'payment_terms': '50% anticipo, 50% contra entrega.',
        'subtotal': 0,
        'discount_amount': 0,
        'tax_details': [],
        'total_tax': 0,
        'total': 0,
        'total_cost': 0,
        'total_margin': 0,
        'margin_percentage': 0,
        'custom_field_values': {},
        'day_logistics': [
            {
                'event_date': '2026-08-15',
                'delivery_time': '17:00',
                'delivery_end_time': '18:00',
                'address': 'Salón QA Espaciado, Santo Domingo',
                'instructions': 'Montaje de bienvenida y cena principal.',
                'guest_count': 120,
                'service_type': 'Cena',
            },
            {
                'event_date': '2026-08-16',
                'delivery_time': '09:00',
                'delivery_end_time': '10:00',
                'address': 'Salón QA Espaciado, Santo Domingo',
                'instructions': 'Brunch de cierre.',
                'guest_count': 80,
                'service_type': 'Brunch',
            },
        ],
        'last_edited_at': now,
        'created_at': now,
        'updated_at': now,
    }
    await db.proposals.update_one(
        {'proposal_id': FIXTURE_PROPOSAL_ID, 'company_id': company_id},
        {'$set': proposal_doc},
        upsert=True,
    )

    await db.order_items.delete_many({'proposal_id': FIXTURE_PROPOSAL_ID, 'company_id': company_id})
    items = [
        ('Cena Principal', '2026-08-15', '19:00', 'Menú de 3 tiempos QA', 'Entrada, plato fuerte y postre con servicio emplatado.', 120, 85, 42, 0),
        ('Cena Principal', '2026-08-15', '19:00', 'Estación de bebidas QA', 'Mocktails, aguas saborizadas y café.', 120, 18, 7, 1),
        ('Brunch de Cierre', '2026-08-16', '10:30', 'Brunch buffet QA', 'Selección dulce y salada para cierre de evento.', 80, 45, 20, 2),
    ]
    for section, event_date, section_time, description, long_description, qty, unit, cost, sort in items:
        total_price = qty * unit
        total_cost = qty * cost
        await db.order_items.insert_one({
            'item_id': f"oi_qa_print_{uuid.uuid4().hex[:8]}",
            'event_id': FIXTURE_EVENT_ID,
            'proposal_id': FIXTURE_PROPOSAL_ID,
            'company_id': company_id,
            'item_type': 'Food',
            'reference_id': '',
            'description': description,
            'long_description': long_description,
            'quantity': float(qty),
            'unit_price': float(unit),
            'internal_cost': float(cost),
            'discount_type': 'percentage',
            'discount_value': 0.0,
            'discount_amount': 0.0,
            'tax_exempt': False,
            'total_price': float(total_price),
            'total_cost': float(total_cost),
            'margin_amount': float(total_price - total_cost),
            'margin_percentage': float((total_price - total_cost) / total_price * 100),
            'category_id': '',
            'category_name': None,
            'internal_notes': '',
            'event_date': event_date,
            'section_title': section,
            'section_time': section_time,
            'section_end_time': None,
            'parent_item_id': None,
            'sort_order': sort,
            'created_at': now,
            'updated_at': now,
        })

    print({
        'event_id': FIXTURE_EVENT_ID,
        'proposal_id': FIXTURE_PROPOSAL_ID,
        'client_id': existing_client['client_id'],
        'company_id': company_id,
        'items_seeded': len(items),
    })


if __name__ == '__main__':
    asyncio.run(main())
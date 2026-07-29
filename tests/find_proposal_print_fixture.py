import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    load_dotenv(Path('/app/backend/.env'))
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ.get('DB_NAME', 'test_database')
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    user = await db.users.find_one({'email': 'demo.agency@kora.com'}, {'_id': 0, 'company_id': 1, 'email': 1})
    if not user:
        print('NO_USER')
        return

    company_id = user['company_id']
    candidates = []
    async for proposal in db.proposals.find({'company_id': company_id}, {'_id': 0, 'proposal_id': 1, 'event_id': 1, 'proposal_number': 1}):
        item_count = await db.order_items.count_documents({'proposal_id': proposal['proposal_id']})
        if item_count < 1:
            continue
        event = await db.events.find_one({'company_id': company_id, 'event_id': proposal['event_id']}, {'_id': 0, 'event_id': 1, 'name': 1, 'event_date': 1, 'client_id': 1})
        if not event:
            continue
        day_logistics = await db.proposal_day_logistics.count_documents({'proposal_id': proposal['proposal_id']})
        # Some deployments store logistics inline/elsewhere; keep proposal even if zero.
        candidates.append((day_logistics, item_count, event, proposal))

    candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
    if not candidates:
        print('NO_CANDIDATES')
        return
    day_logistics, item_count, event, proposal = candidates[0]
    print({
        'company_id': company_id,
        'event_id': event['event_id'],
        'event_name': event.get('name'),
        'proposal_id': proposal['proposal_id'],
        'proposal_number': proposal.get('proposal_number'),
        'item_count': item_count,
        'day_logistics_count': day_logistics,
    })


if __name__ == '__main__':
    asyncio.run(main())
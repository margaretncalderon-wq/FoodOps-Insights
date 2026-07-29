import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    load_dotenv(Path('/app/backend/.env'))
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ.get('DB_NAME', 'test_database')]
    names = await db.list_collection_names()
    print('collections', sorted([n for n in names if n in {'users','events','proposals','order_items','proposal_day_logistics','clients'}]))
    for name in ['users', 'events', 'proposals', 'order_items', 'proposal_day_logistics', 'clients']:
        print(name, await db[name].count_documents({}))
    user = await db.users.find_one({'email': 'demo.agency@kora.com'}, {'_id': 0, 'email': 1, 'company_id': 1})
    print('demo_user', user)
    if user:
        company_id = user['company_id']
        for name in ['events', 'proposals', 'order_items', 'proposal_day_logistics', 'clients']:
            print(name, 'for_company', await db[name].count_documents({'company_id': company_id}))
        sample_event = await db.events.find_one({'company_id': company_id}, {'_id': 0})
        print('sample_event_keys', sorted(sample_event.keys()) if sample_event else None)
        sample_prop = await db.proposals.find_one({'company_id': company_id}, {'_id': 0})
        print('sample_proposal', sample_prop)
        sample_item = await db.order_items.find_one({'company_id': company_id}, {'_id': 0})
        print('sample_item', sample_item)
        if sample_item:
            linked_prop = await db.proposals.find_one({'proposal_id': sample_item.get('proposal_id')}, {'_id': 0, 'company_id': 1, 'event_id': 1, 'proposal_id': 1})
            linked_event = await db.events.find_one({'event_id': sample_item.get('event_id')}, {'_id': 0, 'company_id': 1, 'event_id': 1, 'name': 1})
            print('linked_prop', linked_prop)
            print('linked_event', linked_event)


if __name__ == '__main__':
    asyncio.run(main())
"""Real PostgreSQL integration tests, exclusively against a disposable local database.

This exercises production SQL functions and grants. JWT/Edge Function identity
resolution still needs separate authenticated HTTP tests against homologation.
"""
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from uuid import uuid4
from urllib.parse import urlparse

import psycopg
from psycopg.types.json import Jsonb

DSN = os.environ['NEXUS_TEST_DATABASE_URL']
parsed = urlparse(DSN)
if parsed.hostname not in ('localhost', '127.0.0.1') or parsed.path != '/nexus_test':
    raise RuntimeError('Tests require disposable localhost/nexus_test database')
ROOT = Path(__file__).resolve().parents[2]
A, B = str(uuid4()), str(uuid4())


def connection():
    return psycopg.connect(DSN, autocommit=True)


def scalar(sql, params=()):
    with connection() as db:
        return db.execute(sql, params).fetchone()[0]


def execute(sql, params=()):
    with connection() as db:
        db.execute(sql, params)


def expect_error(message, action):
    try:
        action()
    except psycopg.Error as exc:
        assert message in str(exc), str(exc)
    else:
        raise AssertionError('Expected database rejection: ' + message)


def checkout(store, key=None, items=None):
    key = key or str(uuid4())
    items = items or [{'productId': 'last-unit', 'qty': 1}]
    with connection() as db:
        db.execute('SET ROLE service_role')
        return db.execute(
            'SELECT checkout_order_atomic(%s,%s,%s,%s,%s,%s,%s)',
            (store, Jsonb(items), 'dinheiro', 'synthetic test', '', 'pendente', key),
        ).fetchone()[0]


def transition(store, order_id, action='advance', status=None, code=None):
    with connection() as db:
        db.execute('SET ROLE service_role')
        return db.execute('SELECT transition_order_atomic(%s,%s,%s,%s,%s)',
                          (store, order_id, action, status, code)).fetchone()[0]


def movement(store, quantity=1, action='entry'):
    with connection() as db:
        db.execute('SET ROLE service_role')
        return db.execute('SELECT move_inventory_atomic(%s,%s,%s,%s,%s)',
                          (store, 'last-unit', action, quantity, 'synthetic test')).fetchone()[0]


def parallel(functions):
    barrier = Barrier(len(functions))
    def run(fn):
        barrier.wait(timeout=15)
        try:
            return ('ok', fn())
        except psycopg.Error as exc:
            return ('error', str(exc))
    with ThreadPoolExecutor(max_workers=len(functions)) as pool:
        return list(pool.map(run, functions))


def quantity(store=A):
    return scalar('SELECT quantidade FROM stock WHERE establishment_id=%s AND product_id=%s',
                  (store, 'last-unit'))


def reset_quantity(value):
    execute('UPDATE stock SET quantidade=%s WHERE establishment_id=%s AND product_id=%s',
            (value, A, 'last-unit'))


with connection() as db:
    db.execute((ROOT / 'supabase/tests/baseline.sql').read_text())
    # Catalog tables and final checkout implementations are repository migrations.
    for name in (
        '20261103113020_add_product_variants_modifiers_and_checkout_snapshots.sql',
        '20261103113319_allow_multiple_customized_lines_per_product.sql',
        '20261103113500_fix_checkout_duplicate_product_validation.sql',
        '20261103113614_reject_inactive_product_modifiers_and_bound_promotions.sql',
        '20261106184508_atomic_order_transitions_and_inventory.sql',
    ):
        db.execute((ROOT / 'supabase/migrations' / name).read_text())
    db.execute('INSERT INTO establishments VALUES (%s,\'ativo\'),(%s,\'ativo\')', (A, B))
    for store in (A, B):
        db.execute("INSERT INTO products(id,establishment_id,name,price) VALUES ('last-unit',%s,'Synthetic product',10)", (store,))
        db.execute("INSERT INTO stock(establishment_id,product_id,name,quantidade) VALUES (%s,'last-unit','Synthetic product',1)", (store,))

# Repeat contention with independent connections and distinct request keys.
for attempt in range(5):
    reset_quantity(1)
    results = parallel([lambda: checkout(A) for _ in range(8)])
    assert sum(status == 'ok' for status, _ in results) == 1, results
    assert all(status == 'ok' or 'STOCK_INSUFFICIENT' in value for status, value in results), results
    assert quantity() == 0
print('PASS last unit: 5 rounds, 8 independent connections, exactly one sale each')

reset_quantity(1)
key = str(uuid4())
results = parallel([lambda: checkout(A, key) for _ in range(8)])
assert all(status == 'ok' for status, _ in results), results
assert len({order['id'] for _, order in results}) == 1
assert quantity() == 0
print('PASS identical retries: 8 requests, one order and one stock decrement')

# A failure after order/items/stock changes must roll back the entire RPC.
reset_quantity(1)
before_orders = scalar('SELECT count(*) FROM orders')
execute('ALTER TABLE transactions ADD CONSTRAINT qa_reject_transaction CHECK(false) NOT VALID')
expect_error('qa_reject_transaction', lambda: checkout(A))
execute('ALTER TABLE transactions DROP CONSTRAINT qa_reject_transaction')
assert quantity() == 1
assert scalar('SELECT count(*) FROM orders') == before_orders
print('PASS failed financial insert rolls back order, items and stock')

# Same product IDs in separate stores must stay independent.
original_b = quantity(B)
order = checkout(A)
assert order['establishment_id'] == A
assert quantity(B) == original_b
expect_error('ORDER_NOT_FOUND', lambda: transition(B, order['id']))
assert scalar('SELECT status FROM orders WHERE establishment_id=%s AND id=%s', (A, order['id'])) == 'recebido'
for role in ('anon', 'authenticated'):
    with connection() as db:
        db.execute('SET ROLE ' + role)
        expect_error('permission denied', lambda: db.execute('SELECT checkout_order_atomic(%s,%s,%s,%s,%s,%s,%s)',
            (B, Jsonb([{'productId':'last-unit','qty':1}]), 'dinheiro', '', '', 'pendente', str(uuid4()))))
print('PASS tenant product isolation, foreign order rejection and public RPC denial')

# Two UI retries based on the same visible status may only advance one step.
results = parallel([lambda: transition(A, order['id'], status='recebido') for _ in range(2)])
assert all(status == 'ok' for status, _ in results), results
assert scalar('SELECT status FROM orders WHERE id=%s', (order['id'],)) == 'preparo'
print('PASS concurrent advance with expected status advances exactly one step')

for expected in ('pronto', 'retirado'):
    updated = transition(A, order['id'])
    assert updated['status'] == expected
    assert scalar('SELECT status FROM orders WHERE establishment_id=%s AND id=%s', (A, order['id'])) == expected
expect_error('INVALID_TRANSITION', lambda: transition(A, order['id'], 'set-status', 'preparo'))
print('PASS persisted lifecycle recebido/preparo/pronto/retirado and terminal-state protection')

reset_quantity(1)
cancelled = checkout(A)
execute("UPDATE transactions SET status='confirmado' WHERE order_id=%s", (cancelled['id'],))
execute("ALTER TABLE transactions ADD CONSTRAINT qa_reject_cancel CHECK(status <> 'estornado') NOT VALID")
expect_error('qa_reject_cancel', lambda: transition(A, cancelled['id'], 'set-status', 'cancelado'))
assert scalar('SELECT status FROM orders WHERE id=%s', (cancelled['id'],)) == 'recebido'
execute('ALTER TABLE transactions DROP CONSTRAINT qa_reject_cancel')
assert transition(A, cancelled['id'], 'set-status', 'cancelado')['status'] == 'cancelado'
assert scalar('SELECT status FROM transactions WHERE order_id=%s', (cancelled['id'],)) == 'estornado'
expect_error('INVALID_TRANSITION', lambda: transition(A, cancelled['id'], 'set-status', 'preparo'))
print('PASS cancellation and accounting share one transaction; cancelled orders cannot reopen')

# Persist the configured variant and modifier as immutable order snapshots.
variant, group, modifier = str(uuid4()), str(uuid4()), str(uuid4())
execute('INSERT INTO product_variants(id,establishment_id,product_id,name,price_delta) VALUES (%s,%s,%s,%s,2)',
        (variant, A, 'last-unit', 'Grande'))
execute('INSERT INTO product_modifier_groups(id,establishment_id,product_id,name,required,min_select,max_select) VALUES (%s,%s,%s,%s,true,1,1)',
        (group, A, 'last-unit', 'Molho'))
execute('INSERT INTO product_modifiers(id,establishment_id,product_id,group_id,name,price_delta) VALUES (%s,%s,%s,%s,%s,1)',
        (modifier, A, 'last-unit', group, 'Ervas'))
reset_quantity(1)
configured = checkout(A, items=[{'productId':'last-unit','qty':1,'variantId':variant,'modifierIds':[modifier]}])
assert configured['total'] == 13
assert configured['items'][0]['price'] == 13
assert [item['name'] for item in configured['items'][0]['customizations']] == ['Grande', 'Ervas']
execute('UPDATE product_variants SET name=%s,price_delta=20 WHERE id=%s', ('Changed after sale',variant))
assert scalar('SELECT customizations FROM order_items WHERE order_id=%s',(configured['id'],))[0]['name'] == 'Grande'
execute('UPDATE product_variants SET active=false WHERE id=%s',(variant,))
execute('UPDATE product_modifier_groups SET active=false WHERE id=%s',(group,))
execute('UPDATE product_modifiers SET active=false WHERE id=%s',(modifier,))
print('PASS variant/modifier prices and immutable order snapshots')

# Inventory changes and checkout must share the same row lock.
for attempt in range(5):
    reset_quantity(1)
    results = parallel([lambda: checkout(A), lambda: movement(A)])
    assert all(status == 'ok' for status, _ in results), results
    assert quantity() == 1
reset_quantity(0)
results = parallel([lambda: movement(A) for _ in range(8)])
assert all(status == 'ok' for status, _ in results), results
assert quantity() == 8
results = parallel([lambda: movement(A, action='waste') for _ in range(8)])
assert all(status == 'ok' for status, _ in results), results
assert quantity() == 0
expect_error('STOCK_INSUFFICIENT', lambda: movement(A, action='waste'))
reset_quantity(1)
execute('ALTER TABLE stock_history ADD CONSTRAINT qa_reject_history CHECK(false) NOT VALID')
expect_error('qa_reject_history', lambda: movement(A))
execute('ALTER TABLE stock_history DROP CONSTRAINT qa_reject_history')
assert quantity() == 1
print('PASS inventory/checkout race, concurrent entry/waste and history failure rollback')

print('ALL POSTGRESQL INTEGRITY TESTS PASSED')

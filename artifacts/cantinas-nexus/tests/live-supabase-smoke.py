"""Real browser -> Edge Function -> Postgres -> pickup smoke on disposable Supabase.
No production credentials or hosts are ever contacted. GitHub Pages requests
are fulfilled from the freshly built local dist, preserving production Origin.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import json
import mimetypes
import os
import re
import shutil
import time

API = os.environ['API_URL'].rstrip('/')
ANON = os.environ['ANON_KEY']
fixture_path = Path(os.environ['NEXUS_E2E_OUTPUT'])
assert API in ('http://127.0.0.1:54321', 'http://localhost:54321'), API
fixture = json.loads(fixture_path.read_text())
root = Path('artifacts/cantinas-nexus/dist/public')
assert (root / 'index.html').is_file()
BASE = 'https://vnsants.github.io/Nexus-ERP-CRM'
errors = []


def edge(action, **body):
    payload = json.dumps(dict(action=action, **body)).encode()
    req = Request(API + '/functions/v1/pedidos', data=payload, headers={
        'apikey': ANON,
        'Authorization': 'Bearer ' + fixture['employeeTokenA'],
        'Content-Type': 'application/json',
    }, method='POST')
    with urlopen(req, timeout=15) as response:
        return json.load(response)


def local_only_route(route):
    parsed = urlparse(route.request.url)
    if parsed.hostname == 'vnsants.github.io' and parsed.path.startswith('/Nexus-ERP-CRM'):
        relative = parsed.path.removeprefix('/Nexus-ERP-CRM').lstrip('/')
        file = root / relative
        if not file.is_file():
            file = root / 'index.html'
        return route.fulfill(path=file, content_type=mimetypes.guess_type(file)[0] or 'text/html')
    if parsed.hostname in ('localhost', '127.0.0.1') and parsed.port == 54321:
        return route.continue_()
    # Never fetch remote fonts: deterministic, network-isolated typography fallback.
    if parsed.hostname == 'fonts.googleapis.com':
        return route.fulfill(body='', content_type='text/css', status=200)
    if parsed.hostname == 'fonts.gstatic.com':
        return route.abort()
    errors.append('Blocked unexpected remote request: ' + route.request.url)
    return route.abort()


with sync_playwright() as pw:
    chrome = shutil.which('google-chrome') or shutil.which('chromium')
    assert chrome, 'Chrome or Chromium required on disposable runner'
    browser = pw.chromium.launch(executable_path=chrome, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
    page.on('pageerror', lambda exc: errors.append(str(exc)))
    page.route('**/*', local_only_route)
    page.add_init_script(
        "sessionStorage.setItem('nexus:deviceToken','qa-device');"
        "sessionStorage.setItem('nexus:establishmentId'," +
        json.dumps(fixture['tenantA']) + ");"
    )
    page.goto(BASE + '/cardapio-tablet', wait_until='domcontentloaded')
    card = page.get_by_role('article', name='Test item a', exact=True)
    expect(card).to_be_visible(timeout=20000)
    card.get_by_role('button', name='Adicionar', exact=True).click()
    page.get_by_role('button', name='Abrir carrinho', exact=True).click()
    page.get_by_role('button', name='Escolher Pagamento →', exact=True).click()
    page.get_by_role('button', name=re.compile('Dinheiro', re.I)).click()

    new_order = None
    for _ in range(30):
        orders = edge('list')
        new_order = next((o for o in orders if o['id'] != fixture['alreadyCreatedOrderId']), None)
        if new_order:
            break
        time.sleep(0.5)
    assert new_order is not None, 'Checkout from real browser did not create an order'
    assert new_order['establishmentId'] == fixture['tenantA']
    assert new_order['status'] == 'recebido'
    expect(page.get_by_text(new_order['code'], exact=True)).to_be_visible(timeout=15000)
    assert not errors, errors
    print('PASS REAL CHROME -> FRONTEND -> EDGE -> POSTGRES CHECKOUT', flush=True)
    browser.close()

assert edge('advance', id=new_order['id'], expectedStatus='recebido')['status'] == 'preparo'
assert edge('advance', id=new_order['id'], expectedStatus='preparo')['status'] == 'pronto'
assert edge('confirm-pickup', code=new_order['code'])['ok'] is True
final = next(o for o in edge('list') if o['id'] == new_order['id'])
assert final['status'] == 'retirado'
print('PASS BROWSER ORDER -> AUTHENTICATED KITCHEN -> PICKUP', flush=True)

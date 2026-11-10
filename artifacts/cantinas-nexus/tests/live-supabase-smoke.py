"""Real browser -> Edge Function -> Postgres -> pickup smoke on disposable Supabase.
No production credentials or hosts are ever contacted. GitHub Pages assets are fulfilled from the local dist under a loopback origin.
This avoids Chrome public-origin to loopback restrictions without hitting production.
"""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright, expect
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen
import json
import os
import re
import shutil
import time

API = os.environ['API_URL'].rstrip('/')
ANON = os.environ['ANON_KEY']
fixture_path = Path(os.environ['NEXUS_E2E_OUTPUT'])
assert API in ('http://127.0.0.1:54321', 'http://localhost:54321'), API
fixture = json.loads(fixture_path.read_text())
root = Path('artifacts/cantinas-nexus/dist/public').resolve()
assert (root / 'index.html').is_file()
BASE = 'http://127.0.0.1:8766/Nexus-ERP-CRM'
errors = []
recovery_requests = []

# Serve a real loopback origin: a route.fulfill() page has no actual local
# network endpoint, so modern Chromium can classify it as public and deny
# calls to the local Supabase API via Local Network Access safeguards.
class LocalSite(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        relative = urlparse(path).path.removeprefix('/Nexus-ERP-CRM').lstrip('/')
        candidate = (root / relative).resolve()
        if candidate != root and root not in candidate.parents:
            return str(root / 'index.html')
        return str(candidate if candidate.is_file() else root / 'index.html')

    def log_message(self, *_args):
        pass

site = ThreadingHTTPServer(('127.0.0.1', 8766), LocalSite)
Thread(target=site.serve_forever, daemon=True).start()


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
    if parsed.hostname == '127.0.0.1' and parsed.port == 8766:
        return route.continue_()
    if parsed.hostname in ('localhost', '127.0.0.1') and parsed.port == 54321:
        if parsed.path == '/auth/v1/recover' and route.request.method == 'POST':
            recovery_requests.append({
                'url': route.request.url,
                'body': json.loads(route.request.post_data or '{}'),
            })
            return route.fulfill(status=200, content_type='application/json', body='{}')
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
    page.on('pageerror', lambda exc: errors.append('PAGEERROR ' + str(exc)))
    page.on('console', lambda msg: errors.append('CONSOLE ' + msg.text) if msg.type == 'error' else None)
    page.on('requestfailed', lambda req: errors.append('REQUESTFAIL ' + req.url.split('?')[0] + ' ' + str(req.failure)))
    page.on('response', lambda resp: errors.append('HTTP ' + str(resp.status) + ' ' + resp.url.split('?')[0]) if resp.status >= 400 else None)
    page.route('**/*', local_only_route)
    page.add_init_script(
        "sessionStorage.setItem('nexus:deviceToken','qa-device');"
        "sessionStorage.setItem('nexus:establishmentId'," +
        json.dumps(fixture['tenantA']) + ");"
    )
    page.goto(BASE + '/cardapio-tablet', wait_until='domcontentloaded')
    card = page.get_by_role('article', name='Test item a', exact=True)
    try:
        expect(card).to_be_visible(timeout=20000)
    except AssertionError:
        print('BROWSER URL:', page.url, flush=True)
        print('BROWSER TEXT:', page.locator('body').inner_text(timeout=3000)[:1000], flush=True)
        print('BROWSER ERRORS:', json.dumps(errors[-24:], ensure_ascii=False), flush=True)
        raise
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

    # Verify admin recovery UX against local Auth without sending email.
    recovery_page = browser.new_page(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
    recovery_page.route('**/*', local_only_route)
    recovery_page.goto(BASE + '/nxs', wait_until='domcontentloaded')
    expect(recovery_page.get_by_role('heading', name='Acesso restrito')).to_be_visible(timeout=15000)
    recovery_page.get_by_role('textbox').fill('admin.synthetic@example.test')
    recovery_page.get_by_role('button', name='Esqueci minha senha').click()
    expect(recovery_page.get_by_text(re.compile('Se o e-mail estiver cadastrado'))).to_be_visible(timeout=10000)
    assert len(recovery_requests) == 1, recovery_requests
    assert recovery_requests[0]['body']['email'] == 'admin.synthetic@example.test'
    redirect_to = parse_qs(urlparse(recovery_requests[0]['url']).query).get('redirect_to')
    assert redirect_to == [BASE + '/'], redirect_to
    print('PASS /nxs password recovery uses local Auth and the current app base URL', flush=True)
    browser.close()

assert edge('advance', id=new_order['id'], expectedStatus='recebido')['status'] == 'preparo'
assert edge('advance', id=new_order['id'], expectedStatus='preparo')['status'] == 'pronto'
assert edge('confirm-pickup', code=new_order['code'])['ok'] is True
final = next(o for o in edge('list') if o['id'] == new_order['id'])
assert final['status'] == 'retirado'
print('PASS BROWSER ORDER -> AUTHENTICATED KITCHEN -> PICKUP', flush=True)

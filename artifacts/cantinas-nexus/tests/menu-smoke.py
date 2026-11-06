"""Exercise the built frontend with synthetic data. All outbound requests are intercepted."""
from playwright.sync_api import sync_playwright, expect
from pathlib import Path
from urllib.parse import urlparse
import re, json, mimetypes, shutil, os
published = os.getenv('CHECK_PUBLISHED') == '1'
essential = os.getenv('ESSENTIAL_ONLY') == '1'
engine = os.getenv('BROWSER_ENGINE', 'chromium')
device = os.getenv('TEST_DEVICE', 'iPhone 13')
base = 'https://vnsants.github.io/Nexus-ERP-CRM' if published else 'https://nexus.test'
root = Path('artifacts/cantinas-nexus/dist/public')
themes = re.findall("id: '([\\w-]+)', name: '([^']+)'.*?primary: '(#\\w+)', background: '(#\\w+)'", Path('artifacts/cantinas-nexus/src/lib/menu-templates.ts').read_text())
products = [dict(id=i, name=n, categoria=c, description='Produto para teste local', price='10.00', disponivel=True, sazonal=False) for i, n, c in [('a', 'Sanduíche', 'lanche'), ('b', 'Suco', 'bebida'), ('c', 'Combo teste', 'combo')]]
products[0].update(variants=[dict(id='v', name='Grande', priceDelta=2)], modifierGroups=[dict(id='g', name='Extras', minSelect=1, maxSelect=1, modifiers=[dict(id='m', name='Queijo', priceDelta=1)])])
stock = [dict(productId=i['id'], quantidade=5) for i in products]
emp = dict(id='employee-test', role='admin', nome='Teste', **{'acesso' + k: True for k in 'Caixa Cozinha Produtos Estoque Relatorios Crm Configuracoes Promocoes Funcionarios Fornecedores'.split()})
settings = dict(nomeLoja='Loja de teste', whatsappNumero='')
orders = []
saved = []
failed_chunks = []
staff_writes = []
errors = []

def route(r):
    u = urlparse(r.request.url)
    path = u.path
    if engine != 'webkit' and u.hostname in ('nexus.test', 'vnsants.github.io') and '/assets/Kitchen-' in path and not failed_chunks:
        failed_chunks.append(path)
        return r.abort()
    if published and u.hostname == 'vnsants.github.io' and path.startswith('/Nexus-ERP-CRM/') and r.request.method == 'GET':
        return r.continue_()
    if not published and u.hostname == 'nexus.test':
        f = root / path.lstrip('/')
        if not f.is_file():
            f = root / 'index.html'
        return r.fulfill(path=f, content_type=mimetypes.guess_type(f)[0] or 'application/octet-stream')
    if u.hostname and u.hostname.endswith('.supabase.co'):
        body = r.request.post_data_json or {}
        act = body.get('action')
        result = []
        if act == 'menu':
            result = dict(settings=settings, products=products, stock=stock, promotions=[], establishmentId='store-test')
        if act == 'checkout':
            orders.append(body)
            result = dict(id='order-test', code='QA123', paymentCode='MOCK', trackingToken='fixture-token', paymentMethod='dinheiro')
        if act in ('manual', 'upsert'):
            staff_writes.append(body)
            if act == 'manual' and len(staff_writes) == 1:
                return r.abort()
            result = {'code':'STAFF-QA', 'ok':True}
        if act == 'get-settings':
            result = settings
        if act == 'update-settings':
            settings.update({k: v for k, v in body.items() if k != 'action'})
            saved.append(body)
            result = settings
        if act == 'list-products':
            result = products
        if act == 'report-waste':
            result = {'summary': [], 'log': []}
        if act == 'report-daily':
            result = {}
        return r.fulfill(json=result, content_type='application/json', headers={'access-control-allow-origin': '*'})
    return r.abort()
with sync_playwright() as pw:
    browser = pw.webkit.launch() if engine == 'webkit' else pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'), args=['--no-sandbox'])
    pg = browser.new_page(**pw.devices[device], reduced_motion='reduce') if essential else browser.new_page()
    pg.route('**/*', route)
    pg.set_default_timeout(10000 if engine == 'webkit' else 4500)
    pg.on('pageerror', lambda e: (errors.append(str(e)), print('JS:', str(e), flush=True)))
    pg.add_init_script("sessionStorage.setItem('nexus:deviceToken','fixture');sessionStorage.setItem('nexus:establishmentId','store-test');localStorage.setItem('nexus-erp-crm:employee-token','fixture');localStorage.setItem('nexus-erp-crm:employee-profile'," + json.dumps(json.dumps(emp)) + ');')
    btn = lambda n: pg.get_by_role('button', name=n, exact=True)
    assert len(themes) == 6
    if essential:
        themes = themes[:1]
    viewports = [(pg.viewport_size['width'], pg.viewport_size['height'])] if essential else [(390, 844), (768, 1024), (1440, 900)]
    for width, height in viewports:
        pg.set_viewport_size(dict(width=width, height=height))
        for id, name, color, bg in themes:
            settings.update(menuPrimaryColor=color, menuBackgroundColor=bg)
            pg.goto(base + '/cardapio-tablet')
            pg.locator('.menu-template-' + id).wait_for()
            card = pg.get_by_role('article', name='Suco', exact=True)
            expect(card).to_be_visible()
            assert pg.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert pg.locator('.nexus-category-icon svg').count() >= 4
            if width == 390:
                expect(card.get_by_role('button', name='Adicionar', exact=True)).to_be_in_viewport()
                btn('Ampliar QR code do cardápio').click()
                expect(pg.get_by_role('dialog')).to_be_visible()
                pg.get_by_role('dialog').get_by_role('button', name='Fechar', exact=True).click()
                expect(pg.get_by_role('dialog')).to_have_count(0)
            if not essential:
                pg.screenshot(path=f'menu-screens/{width}-{id}.png', animations='disabled')
            btn('Bebidas').click()
            expect(pg.get_by_role('article')).to_have_count(1)
            btn('Favoritar Suco').click()
            expect(btn('Remover Suco dos favoritos')).to_have_attribute('aria-pressed', 'true')
            pg.locator('#menu-search').fill('inexistente')
            expect(pg.get_by_text('Nenhum resultado', exact=True)).to_be_visible()
            print(width, name, 'OK', flush=True)
    pg.goto(base + '/cardapio-tablet')
    card = pg.get_by_role('article', name='Sanduíche', exact=True)
    card.get_by_role('button', name='Adicionar', exact=True).click()
    dlg = pg.get_by_role('dialog')
    expect(dlg.get_by_role('button', name='Adicionar', exact=True)).to_be_disabled()
    dlg.get_by_role('checkbox').check()
    dlg.get_by_role('button', name='Adicionar', exact=True).click()
    pg.get_by_role('article', name='Combo teste', exact=True).get_by_role('button', name='Adicionar', exact=True).click()
    btn('Abrir carrinho').click()
    btn('Adicionar mais Combo teste').click()
    expect(dlg.get_by_text(re.compile('33,00'))).to_be_visible()
    btn('Diminuir Combo teste').click()
    btn('Escolher Pagamento →').click()
    pg.get_by_role('button', name=re.compile('Dinheiro', re.I)).click()
    expect(pg.get_by_text('QA123', exact=True)).to_be_visible()
    assert len(orders) == 1 and orders[0]['establishmentId'] == 'store-test' and (orders[0]['cartItems'][0]['modifierIds'] == ['m'])
    print('mock checkout OK', flush=True)
    pg.goto(base + '/cozinha')
    pg.get_by_role('navigation').wait_for(state='visible', timeout=15000)
    areas = ['Pedidos', 'Caixa Rápido', 'CRM', 'Produtos', 'Configurações'] if essential else ['Pedidos', 'Tarefas', 'Dashboard', 'Caixa Rápido', 'Estoque', 'CRM', 'Fornecedores', 'Produtos', 'Promoções', 'Funcionários', 'Relatórios', 'Configurações']
    for label in areas:
        b = pg.locator('nav').get_by_role('button', name=label, exact=True)
        b.click()
        expect(b).to_have_attribute('aria-pressed', 'true')
        assert pg.locator('main').inner_text().strip()
        if label == 'Caixa Rápido':
            btn('Adicionar Suco').click()
            btn('Confirmar Pedido').click()
            expect(pg.get_by_text('Erro ao criar pedido.', exact=True)).to_be_visible()
            btn('Confirmar Pedido').click()
            expect(pg.get_by_text('Pedido #STAFF-QA criado!')).to_be_visible()
        if label == 'Produtos':
            btn('Novo Produto').click()
            pg.get_by_label('Nome', exact=True).fill('Produto QA')
            expect(btn('Salvar')).to_be_disabled()
            pg.get_by_label(re.compile('Emoji')).fill('🥪')
            expect(btn('Salvar')).to_be_enabled()
            btn('Cancelar').click()
        if label == 'CRM':
            btn('Novo Cliente').click()
            dlg.get_by_label('Telefone').fill('+5500000000000')
            dlg.get_by_label('Nome', exact=True).fill('Cliente de teste')
            expect(dlg.get_by_label('Telefone')).to_be_visible()
            dlg.get_by_role('button', name='Salvar').click()
            expect(dlg).to_have_count(0)
        print('ERP', label, flush=True)
    for id, name, color, bg in themes:
        b = pg.get_by_role('button', name=re.compile(name))
        b.click()
        expect(b).to_have_attribute('aria-pressed', 'true')
        expect(b).to_be_enabled()
    assert [(s['menuPrimaryColor'], s['menuBackgroundColor']) for s in saved] == [(t[2], t[3]) for t in themes]
    assert [entry['action'] for entry in staff_writes] == ['manual', 'manual', 'upsert']
    assert staff_writes[0]['idempotencyKey'] == staff_writes[1]['idempotencyKey']
    assert len(staff_writes[0]['idempotencyKey']) >= 16
    assert len(failed_chunks) == (0 if engine == 'webkit' else 1)
    assert not errors, errors
    print('OK all')

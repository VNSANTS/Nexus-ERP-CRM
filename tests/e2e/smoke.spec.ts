import { expect, test, type Page } from '@playwright/test';

type RuntimeDiagnostics = { errors: string[]; expectedHttpErrors: number; browserHttpErrorMessages: number };
const runtimeDiagnostics = new WeakMap<Page, RuntimeDiagnostics>();

test.beforeEach(async ({ page }) => {
  const diagnostics: RuntimeDiagnostics = { errors: [], expectedHttpErrors: 0, browserHttpErrorMessages: 0 };
  runtimeDiagnostics.set(page, diagnostics);
  page.on('pageerror', (error) => diagnostics.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      if (message.text().startsWith('Failed to load resource: the server responded with a status of')) {
        diagnostics.browserHttpErrorMessages++;
      } else {
        diagnostics.errors.push(message.text());
      }
    }
  });
  page.on('requestfailed', (request) => diagnostics.errors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'request failed'}`));
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ status: 200, body: '' }));
  await page.route('https://e2e.supabase.co/**', async (route) => {
    const url = route.request().url();

    if (url.includes('/functions/v1/cozinha-login')) {
      diagnostics.expectedHttpErrors++;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'not_employee', error: 'Conta não encontrada.' }),
      });
      return;
    }

    if (url.includes('/auth/v1/token?grant_type=password')) {
      diagnostics.expectedHttpErrors++;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'invalid_credentials', message: 'Invalid login credentials' }),
      });
      return;
    }

    if (url.includes('/functions/v1/pedidos')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Pedido não encontrado.' }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === 'passed') {
    const diagnostics = runtimeDiagnostics.get(page);
    expect(diagnostics?.errors ?? [], 'unexpected browser console, page, or network errors').toEqual([]);
    expect(diagnostics?.browserHttpErrorMessages ?? 0, 'browser HTTP errors should only come from the expected mocked authentication rejection').toBe(diagnostics?.expectedHttpErrors ?? 0);
  }
});

test('cliente vê a tela de login e pode abrir cadastro', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Nexus' })).toBeVisible();
  await expect(page.getByText('Entre para continuar')).toBeVisible();
  await page.screenshot({ path: 'test-results/evidence/login-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar conta', exact: true }).last()).toBeVisible();
});

test('login administrativo mostra o modo correto', async ({ page }) => {
  await page.goto('/estabelecimento/login', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Nexus' })).toBeVisible();
  await expect(page.getByText('Acesso administrativo do estabelecimento')).toBeVisible();
  await expect(page.getByLabel('E-mail do responsável')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar conta' })).toHaveCount(0);
});

test('rota do cardápio exige sessão de cliente', async ({ page }) => {
  await page.goto('/cardapio', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Nexus' })).toBeVisible();
});

test('login inválido é recusado e permanece na tela', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('E-mail, usuário, telefone ou CPF').fill('e2e@example.invalid');
  await page.getByRole('textbox', { name: 'Senha' }).fill('senha-ficticia-invalida');
  await page.getByRole('button', { name: 'Entrar', exact: true }).last().click();
  await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test('token público inválido não revela dados do pedido', async ({ page }) => {
  await page.goto('/acompanhar/00000000-0000-4000-8000-000000000000', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Pedido não encontrado' })).toBeVisible();
  await expect(page.getByText('e2e@example.invalid')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/evidence/tracking-invalid-token.png', fullPage: true });
});

test('login continua utilizável nos cinco tamanhos solicitados', async ({ page }) => {
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Nexus' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth, `horizontal overflow at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(dimensions.clientWidth);
  }
  await page.screenshot({ path: 'test-results/evidence/login-mobile-360x800.png', fullPage: true });
});

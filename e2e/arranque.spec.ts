import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

/**
 * Humo de la fase 0: el build de producción arranca sin errores de consola, dice lo que es y ofrece
 * WebGL2 (SwiftShader en CI), que la formación de imagen necesitará desde la fase 1.
 */
test('arranca sin errores, se presenta y tiene WebGL2', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page).toHaveTitle(/lus-sim/);
  await expect(page.getByRole('heading', { name: 'lus-sim' })).toBeVisible();
  await expect(page.getByText('no es un dispositivo médico')).toBeVisible();
  await expect(page.getByTestId('webgl2')).toHaveAttribute('data-available', 'true');
  await expect(page.getByTestId('build')).toContainText(`v${version}`);
  expect(errors).toEqual([]);
});

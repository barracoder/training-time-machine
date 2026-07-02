/**
 * Screen-level smoke tests: every page renders real content from the API and
 * the core interactions work. Assertions check shapes ("some activities",
 * "a table row"), not dataset-specific values, so they pass against both the
 * CI fixture export and a real archive.
 */
import { test, expect, type Page } from '@playwright/test';

function failOnPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

test('dashboard shows totals, charts and recent activities', async ({ page }) => {
  const errors = failOnPageErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Distance', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent activities' })).toBeVisible();
  await expect(page.locator('table tbody tr').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('trends renders year-over-year table and metric/interval toggles work', async ({ page }) => {
  const errors = failOnPageErrors(page);
  await page.goto('/trends');
  await expect(page.getByRole('heading', { name: 'Trends' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Year over year' })).toBeVisible();
  await expect(page.locator('table tbody tr').first()).toBeVisible();
  await page.getByRole('button', { name: 'Weekly' }).click();
  await page.getByRole('button', { name: 'Avg speed' }).click();
  await expect(page.locator('table tbody tr').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('calendar renders a year grid with a summary line', async ({ page }) => {
  const errors = failOnPageErrors(page);
  await page.goto('/calendar');
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();
  await expect(page.getByText(/\d+ activities · .+ · \d+ active days/)).toBeVisible();
  const yearSelect = page.getByRole('combobox');
  await expect(yearSelect).toBeVisible();
  expect((await yearSelect.locator('option').count())).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('activities table lists rows and search filters them', async ({ page }) => {
  const errors = failOnPageErrors(page);
  await page.goto('/activities');
  await expect(page.getByText(/\d+ matching activities/)).toBeVisible();
  await expect(page.locator('table tbody tr').first()).toBeVisible();

  const search = page.getByPlaceholder('Search by name…');
  await search.fill('no-activity-is-called-this-zzz');
  await expect(page.getByText('0 matching activities')).toBeVisible();
  await search.fill('');
  await expect(page.getByText(/[1-9]\d* matching activities/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('activity detail shows stats and profiles for a GPS activity', async ({ page }) => {
  const errors = failOnPageErrors(page);
  await page.goto('/activities');
  await page.locator('table tbody tr a').first().click();
  await expect(page.getByText('Moving time')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Route' })).toBeVisible();
  await expect(page.getByRole('link', { name: '← All activities' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('unknown activity id shows a not-found message, not a blank page', async ({ page }) => {
  await page.goto('/activities/999999999999');
  await expect(page.getByText(/not found/i)).toBeVisible();
});

test('heatmap aggregates GPS points onto the map', async ({ page }) => {
  const errors = failOnPageErrors(page);
  await page.goto('/heatmap');
  await expect(page.getByRole('heading', { name: 'Heatmap' })).toBeVisible();
  await expect(page.getByText(/\d+ grid cells/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Leaflet' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('records shows personal bests, gear totals and goals', async ({ page }) => {
  const errors = failOnPageErrors(page);
  await page.goto('/records');
  await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible();
  await expect(page.getByText('Longest ride')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Distance milestones' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Per-gear totals' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Goals' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('sidebar navigation reaches every screen', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Trends', 'Calendar', 'Activities', 'Heatmap', 'Records', 'Dashboard']) {
    await page.getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  }
});

import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test("add a fiscal year, filter reports, drill down and export", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Your name").fill("Reporting Owner");
  await page.getByLabel("Company name", { exact: true }).fill("Reporting Demo");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`${randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic-report-password!");
  await page
    .getByRole("button", { name: "Create development workspace" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your business, at a glance" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const year = new Date().getUTCFullYear() + 1;
  await page.getByLabel("Period name", { exact: true }).fill(`FY ${year}`);
  await page.getByLabel("Period starts").fill(`${year}-01-01`);
  await page.getByLabel("Period ends").fill(`${year}-12-31`);
  await page.getByRole("button", { name: "Add fiscal period" }).click();
  await expect(page.getByRole("status")).toContainText("Fiscal period created");
  await page
    .getByRole("button", { name: "General ledger", exact: true })
    .click();
  await page.getByRole("button", { name: "Manual journal" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Date", { exact: true })
    .fill(`${year}-01-10`);
  await page.getByLabel("Memo", { exact: true }).fill("New year capital");
  await page.getByLabel("Amount · PHP", { exact: true }).fill("5000.00");
  await page.getByRole("button", { name: "Post balanced journal" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Balanced journal posted",
  );
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Trial balance", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Reporting fiscal period" })
    .selectOption({ label: `FY ${year}` });
  await page.getByRole("button", { name: "Apply dates" }).click();
  await expect(
    page.getByText(`Showing ${year}-01-01 through ${year}-12-31`, {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "1000 · Cash and bank", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Account activity · Cash and bank" }),
  ).toBeVisible();
  await expect(
    page.getByText("New year capital", { exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    `trial-balance-${year}-01-01-to-${year}-12-31.csv`,
  );
  await page.getByLabel("From date", { exact: true }).fill(`${year}-02-01`);
  await page.getByLabel("Through date", { exact: true }).fill(`${year}-02-28`);
  await page.getByRole("button", { name: "Apply dates" }).click();
  await expect(
    page.getByText(`Showing ${year}-02-01 through ${year}-02-28`, {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "1000 · Cash and bank", exact: true })
    .click();
  await expect(page.getByText("No activity in this date range.")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

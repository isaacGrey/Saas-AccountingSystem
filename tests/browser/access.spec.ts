import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test("create separate books, switch company and persist selected context", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Your name").fill("Company Owner");
  await page
    .getByLabel("Company name", { exact: true })
    .fill("Original Company");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`company-${randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic-owner-password!");
  await page
    .getByRole("button", { name: "Create development workspace" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your business, at a glance" }),
  ).toBeVisible();
  const picker = page.getByRole("combobox", { name: "Active company" });
  const first = await picker.inputValue();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Company access", exact: true }),
  ).toBeVisible();
  await page.getByLabel("New company name").fill("Second Company");
  await page.getByRole("button", { name: "Create separate company" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Separate company created",
  );
  const second = await picker.inputValue();
  expect(second).not.toBe(first);
  await expect(page.getByText("A fresh set of books")).toBeVisible();
  await page.reload();
  await expect(picker).toHaveValue(second);
  await picker.selectOption(first);
  await expect(picker).toHaveValue(first);
  await expect(
    page.getByRole("heading", { name: "Your business, at a glance" }),
  ).toBeVisible();
  await page.reload();
  await expect(picker).toHaveValue(first);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(picker).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

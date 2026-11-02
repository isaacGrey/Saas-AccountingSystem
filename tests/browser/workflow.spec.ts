import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test("company signup → invoice → collection → reports → saved theme, on desktop and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("Your name").fill("Isaac Santos");
  await page.getByLabel("Company name").fill("Mayumi Trading · Demo");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`browser-${randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic-browser-password-123!");
  await page
    .getByRole("button", { name: "Create development workspace" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your business, at a glance" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New invoice" }).click();
  await page
    .getByLabel("Customer", { exact: true })
    .fill("Mayumi Creative Studio");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Brand design services");
  await page.getByRole("button", { name: "Post document & journal" }).click();
  await expect(page.getByRole("status")).toContainText("Document posted");
  await page
    .getByRole("button", { name: "Mayumi Creative Studio", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("₱11,200.00");
  await page.getByRole("button", { name: "Record collection" }).click();
  await page.getByLabel("Cash amount").fill("11000.00");
  await page.getByLabel("Withheld").fill("200.00");
  await page
    .getByLabel("Reference", { exact: true })
    .fill("DEV bank collection");
  await page.getByRole("button", { name: "Post settlement" }).click();
  await expect(page.getByRole("status")).toContainText("Settlement posted");
  await page
    .getByRole("button", { name: "Bills & payments", exact: false })
    .first()
    .click();
  await page.getByRole("button", { name: "New bill" }).click();
  await page
    .getByLabel("Supplier", { exact: true })
    .fill("Bayan Office Supplies");
  await page.getByLabel("Description", { exact: true }).fill("Office supplies");
  await page.getByLabel("Net amount").fill("4000.00");
  await page.getByRole("button", { name: "Post document & journal" }).click();
  await expect(page.getByRole("status")).toContainText("Document posted");
  await page
    .getByRole("button", { name: "Bayan Office Supplies", exact: true })
    .click();
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByLabel("Cash amount").fill("4400.00");
  await page.getByLabel("Withheld").fill("80.00");
  await page
    .getByLabel("Reference", { exact: true })
    .fill("DEV supplier payment");
  await page.getByRole("button", { name: "Post settlement" }).click();
  await expect(page.getByRole("status")).toContainText("Settlement posted");
  await page
    .getByRole("button", { name: "Reports", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Trial balance" }),
  ).toBeVisible();
  await expect(page.getByText("✓ Reconciled")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Settings", exact: false })
    .first()
    .click();
  await page.getByLabel("Colour preset").selectOption("emerald");
  await page
    .getByRole("combobox", { name: "Mode", exact: true })
    .selectOption("dark");
  await page.getByRole("button", { name: "Save appearance" }).click();
  await expect(page.getByRole("status")).toContainText("saved");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "emerald");
  await page
    .getByRole("button", { name: "Settings", exact: false })
    .first()
    .click();
  await page
    .getByRole("combobox", { name: "Mode", exact: true })
    .selectOption("light");
  await page.getByLabel("Colour preset").selectOption("ocean");
  await page.getByRole("button", { name: "Save appearance" }).click();
  await expect(page.getByRole("status")).toContainText("saved");
  await page
    .getByRole("button", { name: "Overview", exact: false })
    .first()
    .click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "docs/workspace-preview.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Your business, at a glance" }),
  ).toBeVisible();
  const overflow = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll("*")]
      .filter(
        (e) =>
          e.getBoundingClientRect().right > innerWidth + 1 &&
          getComputedStyle(e).position !== "absolute",
      )
      .map((e) => ({
        tag: e.tagName,
        cls: e.className,
        right: e.getBoundingClientRect().right,
      }))
      .slice(0, 12),
  }));
  expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(
    overflow.width,
  );
  expect(errors).toEqual([]);
});

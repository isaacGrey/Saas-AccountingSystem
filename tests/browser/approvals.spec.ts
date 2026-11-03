import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test("two owners review and post a draft with required approval", async ({
  page,
  browser,
}) => {
  const origin = "http://localhost:3000";
  await page.goto("/");
  await page.getByLabel("Your name").fill("Draft Author");
  await page
    .getByLabel("Company name", { exact: true })
    .fill("Approval Browser Demo");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`${randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic-approval-password!");
  await page
    .getByRole("button", { name: "Create development workspace" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your business, at a glance" }),
  ).toBeVisible();
  const company = await page
    .getByRole("combobox", { name: "Active company" })
    .inputValue();
  const reviewerContext = await browser.newContext();
  try {
    const email = `${randomUUID()}@example.test`;
    const date = new Date().toISOString().slice(0, 10);
    const signup = await reviewerContext.request.post(
      `${origin}/api/auth/register`,
      {
        headers: { Origin: origin },
        data: {
          name: "Independent Reviewer",
          email,
          password: "Synthetic-review-password!",
          company: "Reviewer Demo",
          date,
        },
      },
    );
    expect(signup.status()).toBe(201);
    const grant = await page.request.post(
      `${origin}/api/companies/${company}/members`,
      { headers: { Origin: origin }, data: { email, role: "owner" } },
    );
    expect(grant.status()).toBe(201);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByLabel("Policy change reason")
      .fill("Require independent document approval");
    await page
      .getByRole("button", { name: "Require independent approval" })
      .click();
    await expect(
      page.getByText("Independent approval required", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Sales & collections", exact: true })
      .click();
    await page.getByRole("button", { name: "New invoice" }).click();
    await page
      .getByLabel("Customer", { exact: true })
      .fill("Approval Customer");
    await page
      .getByLabel("Description", { exact: true })
      .fill("Independently reviewed service");
    await page.getByRole("button", { name: "Save draft for approval" }).click();
    await expect(page.getByRole("status")).toContainText("Draft saved");
    await page
      .getByRole("button", { name: "Drafts & approvals", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Approval Customer", exact: true })
      .click();
    await page.getByRole("button", { name: "Submit for approval" }).click();
    await expect(
      page.getByText("Draft submitted.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Approval Customer", exact: true })
      .click();
    await expect(
      page.getByText(
        "Awaiting an owner who did not create or edit this draft.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Approve draft", exact: true }),
    ).toHaveCount(0);
    const reviewer = await reviewerContext.newPage();
    await reviewer.goto(origin);
    await expect(
      reviewer.getByRole("heading", { name: "Your business, at a glance" }),
    ).toBeVisible();
    await reviewer
      .getByRole("combobox", { name: "Active company" })
      .selectOption(company);
    await reviewer
      .getByRole("button", { name: "Drafts & approvals", exact: true })
      .click();
    await reviewer
      .getByRole("button", { name: "Approval Customer", exact: true })
      .click();
    await reviewer
      .getByLabel("Decision reason")
      .fill("Checked service amount and sample tax treatment");
    await reviewer
      .getByRole("button", { name: "Approve draft", exact: true })
      .click();
    await expect(
      reviewer.getByText("Draft approved.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: "Drafts & approvals", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Approval Customer", exact: true })
      .click();
    await page.getByRole("button", { name: "Post approved document" }).click();
    await expect(
      page.getByText("Approved document and balanced journal posted."),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Sales & collections", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Approval Customer", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Drafts & approvals", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  } finally {
    await reviewerContext.close();
  }
});

import type { PoolClient } from "pg";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { date } from "./ledger.js";
export const reportRange = z
  .object({ from: date, to: date })
  .strict()
  .refine((v) => v.from <= v.to, {
    message: "Start date must be on or before end date",
  });
export async function financialReport(
  db: PoolClient,
  from: string,
  to: string,
) {
  // One SQL statement gives the ledger and both subledgers the same MVCC snapshot.
  const result = await db.query(
    `WITH posted AS (
 SELECT l.account_id,l.debit,l.credit,j.business_date FROM journal_lines l JOIN journals j ON j.id=l.journal_id WHERE j.status='posted' AND j.business_date<=$2::date
 ), trial AS (
 SELECT a.id,a.code,a.name,a.kind,
 coalesce(sum(p.debit-p.credit) FILTER(WHERE p.business_date<$1::date),0)::text opening,
 coalesce(sum(p.debit) FILTER(WHERE p.business_date>=$1::date),0)::text debit,
 coalesce(sum(p.credit) FILTER(WHERE p.business_date>=$1::date),0)::text credit,
 coalesce(sum(p.debit-p.credit),0)::text closing
 FROM accounts a LEFT JOIN posted p ON p.account_id=a.id GROUP BY a.id
 ), settlements AS (SELECT document_id,sum(cash+withholding) amount FROM payments WHERE business_date<=$2::date GROUP BY document_id),
 outstanding AS (SELECT d.kind,sum(d.gross-coalesce(p.amount,0))::text amount FROM documents d LEFT JOIN settlements p ON p.document_id=d.id WHERE d.business_date<=$2::date GROUP BY d.kind)
 SELECT coalesce((SELECT jsonb_agg(t ORDER BY t.code) FROM trial t),'[]') trial,
 coalesce((SELECT amount FROM outstanding WHERE kind='sale'),'0') receivables,
 coalesce((SELECT amount FROM outstanding WHERE kind='bill'),'0') payables`,
    [from, to],
  );
  const { trial, receivables, payables } = result.rows[0];
  const sum = (kind: string, activity = false) =>
    trial
      .filter((r: any) => r.kind === kind)
      .reduce(
        (a: Decimal, r: any) =>
          a.plus(activity ? new Decimal(r.debit).minus(r.credit) : r.closing),
        new Decimal(0),
      );
  const income = sum("income", true).neg(),
    expenses = sum("expense", true),
    assets = sum("asset"),
    liabilities = sum("liability").neg(),
    equity = sum("equity").neg(),
    accumulatedProfit = sum("income").plus(sum("expense")).neg();
  const control = (code: string) =>
    new Decimal(trial.find((r: any) => r.code === code)?.closing || 0);
  return {
    from,
    to,
    trialBalance: trial,
    income: {
      revenue: income.toFixed(2),
      expenses: expenses.toFixed(2),
      netIncome: income.minus(expenses).toFixed(2),
    },
    position: {
      assets: assets.toFixed(2),
      liabilities: liabilities.toFixed(2),
      equity: equity.toFixed(2),
      accumulatedProfit: accumulatedProfit.toFixed(2),
      difference: assets
        .minus(liabilities)
        .minus(equity)
        .minus(accumulatedProfit)
        .toFixed(2),
    },
    reconciliation: [
      {
        kind: "sale",
        subledger: new Decimal(receivables).toFixed(2),
        control: control("1100").toFixed(2),
        difference: control("1100").minus(receivables).toFixed(2),
      },
      {
        kind: "bill",
        subledger: new Decimal(payables).toFixed(2),
        control: control("2000").neg().toFixed(2),
        difference: control("2000").neg().minus(payables).toFixed(2),
      },
    ],
  };
}
export function trialCsv(report: Awaited<ReturnType<typeof financialReport>>) {
  // Quote every cell and neutralize spreadsheet formula prefixes in text fields.
  const cell = (v: string) =>
    '"' +
    (/^[=+@\-\t\r]/.test(v) && !/^-[0-9]+(\.[0-9]+)?$/.test(v)
      ? "'" + v
      : v
    ).replaceAll('"', '""') +
    '"';
  const rows = [
    ["From", report.from, "Through", report.to],
    [
      "Code",
      "Account",
      "Opening net debit",
      "Debit activity",
      "Credit activity",
      "Closing net debit",
    ],
    ...report.trialBalance.map((r: any) => [
      r.code,
      r.name,
      r.opening,
      r.debit,
      r.credit,
      r.closing,
    ]),
  ];
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

import "reflect-metadata";
import {
  Body,
  Catch,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Req,
  Module,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  ArgumentsHost,
  ExceptionFilter,
  Headers,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  DocumentBuilder,
  SwaggerModule,
  ApiBody,
  ApiHeader,
} from "@nestjs/swagger";
import session from "express-session";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { Request } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { pool, transaction, scoped, accounts } from "./db.js";
import {
  documentInput,
  paymentInput,
  date,
  money,
  createDocument,
  settle,
  idempotent,
  post,
  audit,
  Scope,
} from "./ledger.js";
import type { PoolClient } from "pg";
declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}
const origin = process.env.APP_ORIGIN || "http://localhost:3000";
function user(req: Request) {
  if (!req.session.userId) throw new UnauthorizedException("Please sign in");
  return req.session.userId;
}
const companyId = (value: string) => z.uuid().parse(value);
@Catch()
class Errors implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (error instanceof z.ZodError)
      return res.status(400).json({
        message: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    if (error instanceof HttpException)
      return res.status(error.getStatus()).json({ message: error.message });
    if (error.code === "23505")
      return res.status(409).json({ message: "This record already exists" });
    if (error.code === "42501")
      return res
        .status(403)
        .json({ message: "Company owner permission required" });
    if (["23514", "23503", "P0001", "42501", "22003"].includes(error.code))
      return res.status(400).json({
        message: "The operation violates an accounting or access control",
      });
    console.error("Request failed:", error.code || error.name);
    return res
      .status(500)
      .json({ message: "Unable to complete this operation" });
  }
}
@Controller("api")
class AppController {
  @Get("health") async health() {
    await pool.query("SELECT 1");
    return { status: "ok", mode: "development" };
  }
  @Post("auth/register") async register(
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const data = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.email().max(200),
        password: z.string().min(12).max(72),
        company: z.string().trim().min(2).max(160),
        date,
      })
      .strict()
      .parse(body);
    const id = randomUUID(),
      hash = await bcrypt.hash(data.password, 12);
    const company = await transaction(id, async (db) => {
      await db.query("INSERT INTO users VALUES($1,$2,$3,$4)", [
        id,
        data.email.toLowerCase(),
        hash,
        data.name,
      ]);
      const c = (
        await db.query("SELECT provision_company($1,$2,$3) id", [
          id,
          data.company,
          data.date,
        ])
      ).rows[0].id;
      const t = (
        await db.query(
          "SELECT tenant_id FROM memberships WHERE user_id=$1 AND company_id=$2",
          [id, c],
        )
      ).rows[0].tenant_id;
      await db.query(
        "SELECT set_config('app.tenant',$1,true),set_config('app.company',$2,true)",
        [t, c],
      );
      await audit(
        db,
        { user: id, tenant: t, company: c },
        "company.created",
        c,
        { name: data.company },
      );
      return c;
    });
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.userId = id;
    return { id, company };
  }
  @Post("auth/login") async login(@Body() body: unknown, @Req() req: Request) {
    const data = z
      .object({ email: z.email(), password: z.string().max(72) })
      .parse(body);
    const result = await pool.query(
      "SELECT id,password_hash FROM users WHERE email=$1",
      [data.email.toLowerCase()],
    );
    const hash =
      result.rows[0]?.password_hash ||
      "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";
    if (!(await bcrypt.compare(data.password, hash)) || !result.rowCount)
      throw new UnauthorizedException("Invalid email or password");
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.userId = result.rows[0].id;
    return { ok: true };
  }
  @Post("auth/logout") async logout(@Req() req: Request) {
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((e) => (e ? reject(e) : resolve())),
    );
    return { ok: true };
  }
  @Get("me") me(@Req() req: Request) {
    return transaction(user(req), async (db) => {
      const profile = await db.query(
        "SELECT id,name,email FROM users WHERE id=$1",
        [user(req)],
      );
      const companies = await db.query(
        "SELECT c.*,m.role FROM companies c JOIN memberships m ON c.id=m.company_id WHERE m.user_id=$1 ORDER BY c.name",
        [user(req)],
      );
      return { user: profile.rows[0], companies: companies.rows };
    });
  }
  @Get("companies/:company/members") members(
    @Req() req: Request,
    @Param("company") company: string,
  ) {
    return scoped(
      user(req),
      companyId(company),
      false,
      async (db) =>
        (await db.query("SELECT * FROM company_members($1)", [company])).rows,
    );
  }
  @Post("companies/:company/members") member(
    @Req() req: Request,
    @Param("company") company: string,
    @Body() body: unknown,
  ) {
    const input = z
      .object({
        email: z.email().max(200),
        role: z.enum(["owner", "accountant", "auditor", "remove"]),
      })
      .strict()
      .parse(body);
    return scoped(user(req), companyId(company), true, async (db, tenant) => {
      const target = (
        await db.query("SELECT set_company_member($1,$2,$3) id", [
          company,
          input.email,
          input.role,
        ])
      ).rows[0].id;
      await audit(
        db,
        { user: user(req), tenant, company },
        input.role === "remove" ? "membership.revoked" : "membership.updated",
        target,
        { role: input.role },
      );
      return { id: target, role: input.role };
    });
  }
  @Post("companies/:company/companies") addCompany(
    @Req() req: Request,
    @Param("company") company: string,
    @Headers("idempotency-key") key: string,
    @Body() body: unknown,
  ) {
    const input = z
      .object({ name: z.string().trim().min(2).max(160), date })
      .strict()
      .parse(body);
    return this.command(
      req,
      company,
      key,
      { action: "company.create", input },
      async (db, s) => {
        // Recheck ownership under the database lock, including on first creation.
        const id = (
          await db.query("SELECT add_legal_company($1,$2,$3) id", [
            company,
            input.name,
            input.date,
          ])
        ).rows[0].id;
        await audit(db, s, "company.added", id, { name: input.name });
        return { id };
      },
    );
  }
  @Get("companies/:company/workspace") workspace(
    @Req() req: Request,
    @Param("company") company: string,
  ) {
    return scoped(user(req), companyId(company), false, async (db) => {
      const docs = await db.query(
        `SELECT d.*,coalesce(p.settled,0)::text settled,(d.gross-coalesce(p.settled,0))::text outstanding FROM documents d LEFT JOIN (SELECT document_id,sum(cash+withholding) settled FROM payments GROUP BY document_id) p ON p.document_id=d.id ORDER BY d.number DESC LIMIT 100`,
      );
      const trial = await db.query(
        `SELECT a.id,a.code,a.name,a.kind,coalesce(sum(l.debit),0)::text debit,coalesce(sum(l.credit),0)::text credit,(coalesce(sum(l.debit),0)-coalesce(sum(l.credit),0))::text balance FROM accounts a LEFT JOIN (journal_lines l JOIN journals j ON j.id=l.journal_id AND j.status='posted') ON l.account_id=a.id GROUP BY a.id ORDER BY a.code`,
      );
      const journals = await db.query(
        `SELECT j.*, (EXISTS(SELECT 1 FROM documents d WHERE d.journal_id=j.id) OR EXISTS(SELECT 1 FROM payments p WHERE p.journal_id=j.id)) source_linked, coalesce(jsonb_agg(jsonb_build_object('code',a.code,'name',a.name,'debit',l.debit::text,'credit',l.credit::text)) FILTER(WHERE l.id IS NOT NULL),'[]') lines FROM journals j LEFT JOIN journal_lines l ON l.journal_id=j.id LEFT JOIN accounts a ON a.id=l.account_id GROUP BY j.id ORDER BY j.number DESC LIMIT 100`,
      );
      const reconciliation = await db.query(
        `SELECT d.kind,(sum(d.gross)-coalesce(sum(p.settled),0))::text outstanding FROM documents d LEFT JOIN (SELECT document_id,sum(cash+withholding) settled FROM payments GROUP BY document_id) p ON p.document_id=d.id GROUP BY d.kind`,
      );
      return {
        reconciliation: reconciliation.rows,
        documents: docs.rows,
        trialBalance: trial.rows,
        journals: journals.rows,
        accounts: (await accounts(db)).rows,
        taxRules: (await db.query("SELECT * FROM tax_rules ORDER BY code"))
          .rows,
        periods: (await db.query("SELECT * FROM periods ORDER BY starts")).rows,
        branches: (await db.query("SELECT * FROM branches")).rows,
        audit: (
          await db.query(
            "SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 100",
          )
        ).rows,
      };
    });
  }
  private command(
    req: Request,
    company: string,
    key: string,
    payload: unknown,
    work: (db: PoolClient, s: Scope) => Promise<unknown>,
  ) {
    return scoped(user(req), companyId(company), true, (db, tenant) => {
      const s = { user: user(req), tenant, company };
      return idempotent(db, s, key, payload, () => work(db, s));
    });
  }
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiBody({ schema: z.toJSONSchema(documentInput) as any })
  @Post("companies/:company/documents")
  document(
    @Req() req: Request,
    @Param("company") company: string,
    @Headers("idempotency-key") key: string,
    @Body() body: unknown,
  ) {
    const input = documentInput.parse(body);
    return this.command(
      req,
      company,
      key,
      { action: "document", input },
      (db, s) => createDocument(db, s, input),
    );
  }
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiBody({ schema: z.toJSONSchema(paymentInput) as any })
  @Post("companies/:company/documents/:id/payments")
  payment(
    @Req() req: Request,
    @Param("company") company: string,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string,
    @Body() body: unknown,
  ) {
    const input = paymentInput.parse(body);
    companyId(id);
    return this.command(
      req,
      company,
      key,
      { action: "payment", id, input },
      (db, s) => settle(db, s, id, input),
    );
  }
  @Post("companies/:company/journals") journal(
    @Req() req: Request,
    @Param("company") company: string,
    @Headers("idempotency-key") key: string,
    @Body() body: unknown,
  ) {
    const input = z
      .object({
        date,
        memo: z.string().min(3).max(500),
        lines: z
          .array(
            z.object({ code: z.string().max(10), debit: money, credit: money }),
          )
          .min(2)
          .max(100),
      })
      .strict()
      .parse(body);
    if (input.lines.some((l) => ["1100", "2000"].includes(l.code)))
      throw new BadRequestException(
        "Receivable and payable control accounts require a source document",
      );
    return this.command(
      req,
      company,
      key,
      { action: "journal", input },
      (db, s) => post(db, s, input.date, input.memo, input.lines),
    );
  }
  @Post("companies/:company/journals/:id/reverse") reverse(
    @Req() req: Request,
    @Param("company") company: string,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string,
    @Body() body: unknown,
  ) {
    const input = z
      .object({ date, reason: z.string().min(5).max(500) })
      .strict()
      .parse(body);
    companyId(id);
    return this.command(
      req,
      company,
      key,
      { action: "reverse", id, input },
      async (db, s) => {
        const source = await db.query(
          "SELECT id FROM documents WHERE journal_id=$1 UNION ALL SELECT id FROM payments WHERE journal_id=$1",
          [id],
        );
        if (source.rowCount)
          throw new BadRequestException(
            "Source documents require a credit-note or payment-correction workflow",
          );
        const found = await db.query(
          "SELECT id FROM journals WHERE id=$1 AND status='posted' AND reversal_of IS NULL",
          [id],
        );
        if (!found.rowCount)
          throw new BadRequestException("Original journal not found");
        const lines = await db.query(
          "SELECT a.code,l.credit::text debit,l.debit::text credit FROM journal_lines l JOIN accounts a ON a.id=l.account_id WHERE l.journal_id=$1",
          [id],
        );
        return post(db, s, input.date, input.reason, lines.rows, id);
      },
    );
  }
  @Post("companies/:company/periods/:id/close") close(
    @Req() req: Request,
    @Param("company") company: string,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string,
  ) {
    companyId(id);
    return this.command(
      req,
      company,
      key,
      { action: "close", id },
      async (db, s) => {
        const row = await db.query(
          "SELECT id FROM periods WHERE id=$1 FOR UPDATE",
          [id],
        );
        if (!row.rowCount) throw new BadRequestException("Period not found");
        await db.query("UPDATE periods SET closed=true WHERE id=$1", [id]);
        await audit(db, s, "period.closed", id, {});
        return { ok: true };
      },
    );
  }
  @Patch("companies/:company/theme") theme(
    @Req() req: Request,
    @Param("company") company: string,
    @Body() body: unknown,
  ) {
    const theme = z
      .object({
        mode: z.enum(["light", "dark", "system"]),
        preset: z.enum(["ocean", "emerald", "indigo", "graphite", "warm"]),
      })
      .strict()
      .parse(body);
    return scoped(user(req), companyId(company), true, async (db, tenant) => {
      await db.query("UPDATE companies SET theme=$1 WHERE id=$2", [
        theme,
        company,
      ]);
      await audit(
        db,
        { user: user(req), tenant, company },
        "theme.updated",
        company,
        theme,
      );
      return theme;
    });
  }
}
@Module({ controllers: [AppController] })
class AppModule {}
async function main() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
    throw new Error("Generate a session secret with npm run setup");
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn"],
  });
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 40,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use((req: any, res: any, next: any) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== origin
    )
      return res.status(403).json({ message: "Untrusted request origin" });
    next();
  });
  const Store = connectPg(session);
  app.use(
    session({
      store: new Store({ pool, tableName: "sessions" }),
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      name: "tala.sid",
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  );
  app.useGlobalFilters(new Errors());
  SwaggerModule.setup(
    "api/docs",
    app,
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("Tala development API")
        .setVersion("0.1")
        .addCookieAuth("tala.sid")
        .build(),
    ),
  );
  await app.listen(Number(process.env.PORT || 4000), "127.0.0.1");
  console.log("Tala API listening on http://127.0.0.1:4000");
}
main();

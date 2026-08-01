import fs from "node:fs";

function update(path, transform) {
  const source = fs.readFileSync(path, "utf8");
  const next = transform(source);
  if (next === source) throw new Error(`No changes applied to ${path}`);
  fs.writeFileSync(path, next);
  console.log(`updated ${path}`);
}

function replaceOnce(source, before, after, path) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Pattern not found in ${path}: ${before.slice(0, 120)}`);
  if (source.indexOf(before, index + before.length) >= 0) {
    throw new Error(`Pattern appears more than once in ${path}`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

update("prisma/schema.prisma", (source) =>
  replaceOnce(
    source,
    "  emailVerified         Boolean       @default(false) @map(\"email_verified\")\n  currentRefreshTokenId String?       @map(\"current_refresh_token_id\") @db.Uuid @unique",
    "  emailVerified         Boolean       @default(false) @map(\"email_verified\")\n  preferredLanguage     String        @default(\"en\") @map(\"preferred_language\") @db.VarChar(5)\n  currentRefreshTokenId String?       @map(\"current_refresh_token_id\") @db.Uuid @unique",
    "prisma/schema.prisma",
  ),
);

update("src/modules/auth/auth.service.ts", (source) => {
  let next = replaceOnce(
    source,
    "    const { name, email, password, phone } = payload;",
    "    const { name, email, password, phone, preferredLanguage } = payload;",
    "src/modules/auth/auth.service.ts",
  );
  next = replaceOnce(
    next,
    "        phone,\n        role: Roles.User,",
    "        phone,\n        preferredLanguage,\n        role: Roles.User,",
    "src/modules/auth/auth.service.ts",
  );
  next = replaceOnce(
    next,
    "  async oauthSignIn({\n    provider,\n    providerId,\n    email,\n    name,\n    emailVerified,\n  }: OauthSignInInput) {",
    "  async updatePreferredLanguage(\n    userId: string,\n    preferredLanguage: \"en\" | \"ar\",\n  ) {\n    const user = await prisma.businessUser.update({\n      where: { id: userId },\n      data: { preferredLanguage },\n      select: { preferredLanguage: true },\n    });\n    return user;\n  }\n\n  async oauthSignIn({\n    provider,\n    providerId,\n    email,\n    name,\n    emailVerified,\n    preferredLanguage,\n  }: OauthSignInInput) {",
    "src/modules/auth/auth.service.ts",
  );
  next = replaceOnce(
    next,
    "          emailVerified: !!emailVerified,\n          role: Roles.User,",
    "          emailVerified: !!emailVerified,\n          preferredLanguage: preferredLanguage ?? \"en\",\n          role: Roles.User,",
    "src/modules/auth/auth.service.ts",
  );
  next = replaceOnce(
    next,
    "      if (name && name !== user.name) {\n        updateData.name = name;\n      }",
    "      if (name && name !== user.name) {\n        updateData.name = name;\n      }\n\n      if (preferredLanguage && preferredLanguage !== user.preferredLanguage) {\n        updateData.preferredLanguage = preferredLanguage;\n      }",
    "src/modules/auth/auth.service.ts",
  );
  return next;
});

update("src/modules/auth/auth.controller.ts", (source) => {
  let next = replaceOnce(
    source,
    "  getMeInputSchema,\n} from \"./auth.schema\";",
    "  getMeInputSchema,\n  updatePreferredLanguageBodySchema,\n} from \"./auth.schema\";",
    "src/modules/auth/auth.controller.ts",
  );
  next = replaceOnce(
    next,
    "  async getMe(req: Request, res: Response, next: NextFunction) {",
    "  async updatePreferredLanguage(\n    req: Request,\n    res: Response,\n    next: NextFunction,\n  ) {\n    try {\n      const userId = req.user?.id;\n      if (!userId) return fail(res, \"Unauthorized\", 401, \"UNAUTHORIZED\");\n      const parsed = updatePreferredLanguageBodySchema.safeParse(req.body);\n      if (!parsed.success) return next(parsed.error);\n      const result = await authService.updatePreferredLanguage(\n        userId,\n        parsed.data.preferredLanguage,\n      );\n      return ok(res, result);\n    } catch (error) {\n      return next(error);\n    }\n  }\n\n  async getMe(req: Request, res: Response, next: NextFunction) {",
    "src/modules/auth/auth.controller.ts",
  );
  return next;
});

update("src/modules/auth/auth.routes.ts", (source) => {
  let next = replaceOnce(
    source,
    "  authUserSchema,\n} from \"./auth.schema\";",
    "  authUserSchema,\n  updatePreferredLanguageBodySchema,\n} from \"./auth.schema\";",
    "src/modules/auth/auth.routes.ts",
  );
  next = replaceOnce(
    next,
    "router.get(\n  \"/me\",",
    "router.patch(\n  \"/preferences\",\n  requireAuth,\n  csrfProtection,\n  doc({\n    summary: \"Update platform language preference\",\n    description:\n      \"Persist the authenticated user's preferred Systemly platform language.\",\n    tags: [\"auth\"],\n    responses: {\n      200: { description: \"Language preference updated\" },\n    },\n  }),\n  validate.validateBody(updatePreferredLanguageBodySchema),\n  authController.updatePreferredLanguage,\n);\n\nrouter.get(\n  \"/me\",",
    "src/modules/auth/auth.routes.ts",
  );
  return next;
});

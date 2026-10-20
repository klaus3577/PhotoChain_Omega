// A kérés törzsének ellenőrzése Zod-sémával. A kezelő a törzset csak a sémán keresztül kaphatja meg:
// így nem fordulhat elő, hogy egy útvonalról lemarad az ellenőrzés, a kezelő mégis „ellenőrzött”
// típusú adatot lát. Érvénytelen bemenetnél a séma ZodError-t dob, amelyből a központi hibakezelő
// 400-as VALIDATION_ERROR választ készít (mezőnkénti részletekkel); a kezelő ilyenkor le sem fut.
// Forrás: Zod dokumentáció, https://zod.dev/ (adaptálva)
import type { Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';

/** Kezelő, amely a kérés nyers törzse helyett a séma által ellenőrzött, átalakított értéket kapja. */
export type ValidatedBodyHandler<Body> = (
  body: Body,
  req: Request,
  res: Response,
) => void | Promise<void>;

export function withValidatedBody<Schema extends z.ZodType>(
  schema: Schema,
  handler: ValidatedBodyHandler<z.output<Schema>>,
): RequestHandler {
  return async (req, res) => {
    await handler(schema.parse(req.body), req, res);
  };
}

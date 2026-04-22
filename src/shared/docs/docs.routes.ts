import { Router } from "express";
import { getOpenApiDocument, getSwaggerHtml } from "./openapi.gen";

const router = Router();

router.get("/openapi.json", (req, res) => {
  const doc = getOpenApiDocument(req.app, {
    title: "Hgezli API",
    version: "1.0.0",
    url: process.env.APP_URL,
  });
  res.json(doc);
});

router.get("/", (_req, res) => {
  res.type("html").send(getSwaggerHtml());
});

export default router;

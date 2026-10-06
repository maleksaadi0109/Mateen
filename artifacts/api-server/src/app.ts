import express, { type Express } from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import pinoHttp from "pino-http";
import router from "./routes";
import localStorageUploadRouter from "./routes/local-storage-upload";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ origin: false }));
// Stream signed PUT bytes before JSON parsing and Clerk; the capability is the
// authorization, and the upload handler enforces its own bounded binary stream.
app.use("/api", localStorageUploadRouter);
// Only the consented report endpoint accepts the larger bounded JSON payload.
app.use((req, res, next) => {
  if (req.method === "POST" && req.path === "/api/mateen/practice-reports") { next(); return; }
  express.json({ limit: "64kb" })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

app.use(
  (error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "entity.too.large"
    ) {
      res.status(413).json({ error: "Request body exceeds the endpoint size limit" });
      return;
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "entity.parse.failed"
    ) {
      res.status(400).json({ error: "Request body contains invalid JSON" });
      return;
    }
    req.log.error({ errorType: error instanceof Error ? error.name : "UnknownError" }, "Request failed");
    res.status(500).json({ error: "The request could not be completed" });
  },
);

export default app;

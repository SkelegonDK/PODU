import { serve } from "bun";
import plugin from "bun-plugin-tailwind";
import { getAgentForMode, getConversationToken } from "./api/agents";
import {
  saveDocument,
  getDocument,
  deleteDocument,
  listDocuments,
  loadDocumentsForPrompt,
  parseDocument,
  type ParseResult,
} from "./api/knowledgebase";
import {
  getConfigStatus,
  handleSetApiKey,
  handleClearApiKey,
  resolveApiKey,
} from "./api/config";
import { readSession } from "./lib/session";
import { backend, publicConfig, HttpError, isLocalMode } from "./lib/backend";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { prepareConversation } from "./api/conversationRoutes";
import { route } from "./lib/httpRoute";

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "127.0.0.1";

if (!process.env.ELEVENLABS_API_KEY) {
  console.warn(
    "Note: ELEVENLABS_API_KEY not set in env. Users can enter their key in the app Settings panel instead.",
  );
}

if (isLocalMode() && (process.env.NODE_ENV === "production" || !["127.0.0.1", "localhost", "::1"].includes(hostname))) {
  throw new Error("PODU_LOCAL_MODE requires a development server bound to localhost");
}

const htmlFile = Bun.file("./src/index.html");
const htmlTemplate = await htmlFile.text();

/**
 * Turns a parse rejection into the sentence the upload dialog shows verbatim.
 * The machine-readable `reason` still travels alongside it as `code`, so the
 * client can branch without parsing prose.
 */
function rejectionMessage(rejection: Extract<ParseResult, { ok: false }>): string {
  switch (rejection.reason) {
    case "unsupported_type":
      return `${rejection.name}: only ${rejection.supported
        .map((ext) => `.${ext}`)
        .join(" and ")} files are supported.`;
    case "empty_file":
      return `${rejection.name} is empty.`;
  }
}

const server = serve({
  port,
  hostname,
  routes: {
    "/api/config": {
      GET: route("load config", (req) => getConfigStatus(req)),
      POST: route("set API key", (req) => handleSetApiKey(req)),
      DELETE: route("clear API key", () => handleClearApiKey()),
    },

    "/api/agents": {
      POST: route("get agent", prepareConversation),
    },

    "/api/agents/:agentId/conversation-token": {
      GET: route<"/api/agents/:agentId/conversation-token">(
        "get conversation token",
        async (req) => {
          const client = backend(req);
          if (client) {
            const id = new URL(req.url).searchParams.get("conversationId") as Id<"conversations"> | null;
            if (!id) throw new HttpError(400, "A prepared conversation is required.");
            const c = await client.query(api.conversations.get, { id });
            if (c.agentId !== req.params.agentId) throw new HttpError(400, "Agent does not match this conversation.");
            return client.action(api.sessions.issueToken, { id });
          }
          const allowedIds = [process.env.ELEVENLABS_AGENT_ID_FUN, process.env.ELEVENLABS_AGENT_ID_EDU, process.env.ELEVENLABS_AGENT_ID_DEEP];
          if (!allowedIds.includes(req.params.agentId)) throw new HttpError(404, "Agent not found.");
          const session = await readSession(req);
          const apiKey = resolveApiKey(session);
          const token = await getConversationToken(req.params.agentId, apiKey);
          return { token };
        },
      ),
    },

    "/api/health": {
      GET: route("check health", () => ({ status: "ok" }), { public: true }),
    },

    "/api/documents": {
      GET: route("list documents", async req => ({ documents: backend(req) ? await backend(req)!.query(api.documents.list, {}) : listDocuments() })),
      POST: route("upload document", async (req) => {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
          return Response.json({ error: "No file provided" }, { status: 400 });
        }

        if (file.size > 200_000) throw new HttpError(413, "Documents must be smaller than 200 KB.", "document_too_large");
        const parsed = await parseDocument(file);
        if (!parsed.ok) {
          return Response.json(
            { error: rejectionMessage(parsed), code: parsed.reason },
            { status: 400 },
          );
        }

        const client = backend(req);
        return client ? client.mutation(api.documents.save, { name: parsed.name, content: parsed.content }) : saveDocument({ name: parsed.name, content: parsed.content });
      }),
    },

    "/api/documents/:id": {
      GET: route<"/api/documents/:id">("get document", async (req) => {
        const client = backend(req);
        const doc = client ? await client.query(api.documents.get, { id: req.params.id as Id<"documents"> }) : getDocument(req.params.id);
        if (!doc) return Response.json({ error: "Document not found" }, { status: 404 });
        return doc;
      }),
      DELETE: route<"/api/documents/:id">("delete document", async (req) => {
        const client = backend(req);
        const deleted = client ? await client.mutation(api.documents.remove, { id: req.params.id as Id<"documents"> }) : deleteDocument(req.params.id);
        if (!deleted) return Response.json({ error: "Document not found" }, { status: 404 });
        return { success: true };
      }),
    },

    "/api/conversations": {
      GET: route("list conversations", req => backend(req)?.query(api.conversations.list, {}) ?? []),
    },
    "/api/conversations/:id/turns": {
      POST: route<"/api/conversations/:id/turns">("save transcript", async req => {
        const { turns } = await req.json();
        return backend(req)?.mutation(api.conversations.append, { id: req.params.id as Id<"conversations">, turns }) ?? { saved: false };
      }),
      GET: route<"/api/conversations/:id/turns">("load transcript", req => backend(req)?.query(api.conversations.transcript, { id: req.params.id as Id<"conversations"> }) ?? []),
    },
    "/api/conversations/:id/memory": {
      GET: route<"/api/conversations/:id/memory">("load memory", req => backend(req)?.query(api.conversations.memory, { id: req.params.id as Id<"conversations"> }) ?? { revision: 0, context: "" }),
    },
    "/api/conversations/:id/recording": {
      GET: route<"/api/conversations/:id/recording">("load recording", req => backend(req)?.query(api.conversations.recording, { id: req.params.id as Id<"conversations"> }) ?? { status: "disabled", url: null }),
    },
    "/api/conversations/:id/end": {
      POST: route<"/api/conversations/:id/end">("end conversation", async req => {
        await backend(req)?.mutation(api.conversations.end, { id: req.params.id as Id<"conversations"> });
        return { saved: true };
      }),
    },
    "/api/conversations/:id": {
      DELETE: route<"/api/conversations/:id">("delete conversation", async req => {
        await backend(req)?.mutation(api.conversations.remove, { id: req.params.id as Id<"conversations"> });
        return { success: true };
      }),
    },

    "/frontend.tsx": async () => {
      try {
        const file = Bun.file("./src/frontend.tsx");
        if (!(await file.exists())) {
          return new Response("File not found", { status: 404 });
        }

        const result = await Bun.build({
          entrypoints: ["./src/frontend.tsx"],
          plugins: [plugin],
          target: "browser",
          format: "esm",
          define: { __PODU_PUBLIC_CONFIG__: JSON.stringify(publicConfig()) },
          minify: false,
          sourcemap: "inline",
        });

        if (!result.success) {
          console.error("Transpilation errors:", result.logs);
          return new Response("Transpilation failed", { status: 500 });
        }

        const jsOutput = result.outputs.find(
          (output) => output.kind === "entry-point" || output.path.endsWith(".js"),
        );
        const cssOutput = result.outputs.find(
          (output) => output.kind === "asset" && output.path.endsWith(".css"),
        );

        if (!jsOutput) {
          return new Response("No JavaScript output from transpilation", { status: 500 });
        }

        let transpiledCode = await jsOutput.text();

        if (cssOutput) {
          const cssContent = await cssOutput.text();
          transpiledCode = `const style = document.createElement('style'); style.textContent = ${JSON.stringify(cssContent)}; document.head.appendChild(style);\n${transpiledCode}`;
        }

        return new Response(transpiledCode, {
          headers: {
            "Content-Type": "application/javascript",
            "Cache-Control": "no-cache",
          },
        });
      } catch (error) {
        console.error("Error serving frontend.tsx:", error);
        return new Response("Internal server error", { status: 500 });
      }
    },

    "/*": async (req) => {
      const url = new URL(req.url);
      const pathname = url.pathname;

      const staticExtensions = [
        ".svg", ".png", ".jpg", ".jpeg", ".gif", ".ico",
        ".woff", ".woff2", ".ttf", ".eot", ".css",
      ];
      const isStaticAsset = staticExtensions.some((ext) => pathname.endsWith(ext));

      if (isStaticAsset) {
        const filePaths = [`src${pathname}`, `.${pathname}`, pathname.slice(1)];
        for (const filePath of filePaths) {
          const file = Bun.file(filePath);
          if (await file.exists()) return new Response(file);
        }
        return new Response("File not found", { status: 404 });
      }

      return new Response(htmlTemplate, {
        headers: { "Content-Type": "text/html" },
      });
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`PODU server running at ${server.url}`);

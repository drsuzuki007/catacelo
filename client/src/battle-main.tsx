import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { startLogin } from "./const";
import "./index.css";
import Home from "./pages/Home";
import "./battle.css";

const queryClient = new QueryClient();
const trpcClient = trpc.createClient({
  links: [httpBatchLink({
    url: "/api/trpc", transformer: superjson,
    headers() {
      try {
        const raw = sessionStorage.getItem("manus-cookie");
        const prefix = `${COOKIE_NAME}=`;
        const token = raw?.split(";").find((entry) => entry.trim().startsWith(prefix))?.trim().slice(prefix.length);
        return token ? { Authorization: `Bearer ${token}` } : {};
      } catch { return {}; }
    },
    fetch(input, init) { return globalThis.fetch(input, { ...(init ?? {}), credentials: "include" }); },
  })],
});

function redirectIfUnauthorized(error: unknown): void {
  if (error instanceof TRPCClientError && error.message === UNAUTHED_ERR_MSG) startLogin();
}
queryClient.getQueryCache().subscribe((event) => { if (event.type === "updated" && event.action.type === "error") redirectIfUnauthorized(event.query.state.error); });
queryClient.getMutationCache().subscribe((event) => { if (event.type === "updated" && event.action.type === "error") redirectIfUnauthorized(event.mutation.state.error); });

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider><Toaster /><Home siteVariant="battle" /></TooltipProvider>
    </QueryClientProvider>
  </trpc.Provider>,
);

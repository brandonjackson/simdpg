import { NextRequest, NextResponse } from "next/server";
import { SYSTEM_URLS } from "@simdpg/api-clients";

const SYSTEM_MAP: Record<string, string> = {
  identity: SYSTEM_URLS.identity,
  "civil-registry": SYSTEM_URLS.civilRegistry,
  health: SYSTEM_URLS.health,
  benefits: SYSTEM_URLS.benefits,
  notifications: SYSTEM_URLS.notifications,
};

async function proxy(
  request: NextRequest,
  { params }: { params: { system: string; path: string[] } }
) {
  const baseUrl = SYSTEM_MAP[params.system];
  if (!baseUrl) {
    return NextResponse.json({ error: "Unknown system" }, { status: 404 });
  }

  const path = params.path.join("/");
  const url = new URL(`/${path}`, baseUrl);
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Forward the caller's X-Request-ID so the system can honour it (DCI traceability).
  const requestId = request.headers.get("x-request-id");
  if (requestId) headers["X-Request-ID"] = requestId;

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  try {
    const res = await fetch(url.toString(), init);
    const data = await res.text();
    const responseHeaders: Record<string, string> = {
      "Content-Type": res.headers.get("Content-Type") || "application/json",
    };
    // Echo the system's X-Request-ID back so the sandbox can display it.
    const echoedRequestId = res.headers.get("x-request-id");
    if (echoedRequestId) responseHeaders["X-Request-ID"] = echoedRequestId;
    return new NextResponse(data, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json({ error: "System unavailable" }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;

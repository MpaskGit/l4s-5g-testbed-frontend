import { NextRequest, NextResponse } from "next/server";

const ORCHESTRATOR_URL = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL;

async function proxyRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  if (!ORCHESTRATOR_URL) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_ORCHESTRATOR_URL is not defined" },
      { status: 500 },
    );
  }

  const { path } = await context.params;
  const targetUrl = `${ORCHESTRATOR_URL}/${path.join("/")}${request.nextUrl.search}`;

  const body =
    request.method === "GET" || request.method === "DELETE"
      ? undefined
      : await request.text();

  const response = await fetch(targetUrl, {
    method: request.method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body,
  });

  const responseText = await response.text();

  return new NextResponse(responseText, {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("content-type") || "application/json",
    },
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const DELETE = proxyRequest;
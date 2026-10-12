import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { resolveAuthMeUrl } from "@/lib/resolveAuthMeUrl";
import { assertCanUploadImages } from "@/lib/uploadAuth";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const token = typeof clientPayload === "string" ? clientPayload : "";
        const meResponse = await fetch(resolveAuthMeUrl(), { headers: { Authorization: `Bearer ${token}` } });
        if (!meResponse.ok) throw new Error("Not authenticated");
        const me = (await meResponse.json()) as { role: string };
        assertCanUploadImages(me.role);

        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
          maximumSizeInBytes: 5 * 1024 * 1024,
        };
      },
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

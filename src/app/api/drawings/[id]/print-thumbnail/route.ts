import { requireApiPermission } from "@/lib/auth/authorization";
import { contentDisposition, getDrawingFile } from "@/lib/drawing-file-access";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiPermission("drawing.view");
  if (!authResult.ok) return authResult.response;
  const { id } = await context.params;
  const file = await getDrawingFile(id, "print-thumbnail");
  if (!file) return Response.json({ error: "图纸打印缩略图不存在" }, { status: 404 });
  return new Response(file.buffer, { headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Content-Type": file.contentType, "Content-Length": String(file.contentLength), "Content-Disposition": contentDisposition(file.fileName, file.extension) } });
}

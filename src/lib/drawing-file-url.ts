export type DrawingFileVariant = "file" | "thumbnail" | "print-thumbnail";

export function getDrawingFileUrl(drawingId: string, variant: DrawingFileVariant) {
  return `/api/drawings/${encodeURIComponent(drawingId)}/${variant}`;
}

export function getDrawingOriginalUrl(drawingId: string) {
  return getDrawingFileUrl(drawingId, "file");
}

export function getDrawingThumbnailUrl(drawingId: string) {
  return getDrawingFileUrl(drawingId, "thumbnail");
}

export function getDrawingPrintThumbnailUrl(drawingId: string) {
  return getDrawingFileUrl(drawingId, "print-thumbnail");
}

export function withProtectedDrawingUrls<T extends { id: string; originalUrl: string; thumbnailUrl: string | null; printThumbnailUrl: string | null }>(drawing: T) {
  return {
    ...drawing,
    originalUrl: getDrawingOriginalUrl(drawing.id),
    thumbnailUrl: drawing.thumbnailUrl ? getDrawingThumbnailUrl(drawing.id) : null,
    printThumbnailUrl: drawing.printThumbnailUrl || drawing.thumbnailUrl ? getDrawingPrintThumbnailUrl(drawing.id) : null
  };
}

export function withProtectedOutsourceDrawingUrls<T extends { drawingId: string | null; originalUrl: string | null; thumbnailUrl: string | null }>(item: T) {
  if (!item.drawingId) return { ...item, originalUrl: null, thumbnailUrl: null };
  return {
    ...item,
    originalUrl: item.originalUrl ? getDrawingOriginalUrl(item.drawingId) : null,
    thumbnailUrl: item.thumbnailUrl ? getDrawingThumbnailUrl(item.drawingId) : null
  };
}

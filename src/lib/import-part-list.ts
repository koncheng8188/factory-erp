export type ParsedPartListItem = {
  raw: string;
  partName: string;
  unitQuantity: number;
  error: string | null;
};

export function parseImportPartList(partList: string): ParsedPartListItem[] {
  return partList
    .split(/[;；]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((raw) => {
      const quantityMatch = raw.match(/^(.*?)\s*[*x×]\s*(.+)$/i);
      const partName = (quantityMatch ? quantityMatch[1] : raw).trim();
      const quantityText = quantityMatch ? quantityMatch[2].trim() : "";
      const unitQuantity = quantityText ? Number(quantityText) : 1;

      if (!partName) {
        return { raw, partName, unitQuantity: Number.NaN, error: "部件名称不能为空。" };
      }
      if (!Number.isInteger(unitQuantity) || unitQuantity <= 0) {
        return { raw, partName, unitQuantity: Number.NaN, error: `部件“${partName}”单套用量必须是正整数。` };
      }

      return { raw, partName, unitQuantity, error: null };
    });
}

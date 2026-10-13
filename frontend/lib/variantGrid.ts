export type ApiVariant = { sku?: string; size: string; color: string; stock: number };

export function parseList(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

export function variantKey(size: string, color: string): string {
  return JSON.stringify([size, color]);
}

export function variantsToValues(variants: ApiVariant[]): Record<string, string> {
  return Object.fromEntries(variants.map((v) => [variantKey(v.size, v.color), String(v.stock)]));
}

// Cells for sizes x colors; combinations the admin has not typed yet start at 0.
export function gridToVariants(sizes: string[], colors: string[], values: Record<string, string>): ApiVariant[] {
  return sizes.flatMap((size) =>
    colors.map((color) => {
      const parsed = Math.floor(Number(values[variantKey(size, color)] ?? 0));
      return { size, color, stock: Number.isFinite(parsed) && parsed > 0 ? parsed : 0 };
    })
  );
}

export function variantTotals(variants: ApiVariant[]): { total: number; soldOut: number } {
  return {
    total: variants.reduce((sum, v) => sum + v.stock, 0),
    soldOut: variants.filter((v) => v.stock === 0).length,
  };
}

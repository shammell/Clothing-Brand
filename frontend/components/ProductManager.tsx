"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type SVGProps } from "react";
import { upload } from "@vercel/blob/client";
import { authenticatedFetch, extractErrorMessage } from "@/lib/auth-store";
import { fetchAllProducts, ProductsFetchError } from "@/lib/fetchAllProducts";
import { IconRefresh } from "@/app/admin/_components/ui";
import { TableSkeleton } from "@/components/TableSkeleton";
import { SortableTh } from "@/components/SortableTh";
import { PairsWithPicker } from "@/components/PairsWithPicker";
import { VariantStockGrid } from "@/components/VariantStockGrid";
import { gridToVariants, parseList, variantsToValues, variantTotals, type ApiVariant } from "@/lib/variantGrid";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type Product = {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  brand: string;
  sizes: string[];
  colors: string[];
  image_url: string;
  stock: number;
  variants?: ApiVariant[];
  companions?: string[];
  rating: number;
};

type ProductFormState = {
  name: string; description: string; price: string; category: string; brand: string;
  sizes: string; colors: string; image_url: string; variantStock: Record<string, string>; rating: string;
  // Only sent when the admin changes it, so saving other edits never marks a generated list as manual.
  companions: string[]; companionsTouched: boolean;
};

const EMPTY_FORM: ProductFormState = {
  name: "", description: "", price: "", category: "", brand: "",
  sizes: "", colors: "", image_url: "", variantStock: {}, rating: "0", companions: [], companionsTouched: false,
};

function productToForm(product: Product): ProductFormState {
  return {
    name: product.name, description: product.description ?? "", price: String(product.price),
    category: product.category, brand: product.brand, sizes: product.sizes.join(", "),
    colors: product.colors.join(", "), image_url: product.image_url, variantStock: variantsToValues(product.variants ?? []),
    rating: String(product.rating),
    companions: product.companions ?? [], companionsTouched: false,
  };
}

function formToPayload(form: ProductFormState) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    price: Number(form.price),
    category: form.category.trim(),
    brand: form.brand.trim(),
    variants: gridToVariants(parseList(form.sizes), parseList(form.colors), form.variantStock),
    image_url: form.image_url.trim(),
    rating: Number(form.rating) || 0,
    ...(form.companionsTouched ? { companions: form.companions } : {}),
  };
}

const cardClass = "bg-white rounded-xl border border-slate-200 shadow-sm p-6";
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500";
const labelClass = "block text-sm font-medium text-slate-700 mb-1.5";
const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1";
const ghostButtonClass =
  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors motion-reduce:transition-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";
const iconButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors motion-reduce:transition-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";

type IconProps = SVGProps<SVGSVGElement>;
const iconDefaults = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function IconPencil(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <path d="M4 20l4-1 11-11-3-3L5 16z" />
      <path d="M14 6l3 3" />
    </svg>
  );
}

function IconTrash(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <path d="M5 7h14" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M7 7l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13" />
    </svg>
  );
}

export function ProductManager({
  authToken,
  onSessionExpired,
  onProductsChange,
  confirm,
  notify,
}: {
  authToken: string;
  onSessionExpired: () => void;
  onProductsChange?: (products: Product[]) => void;
  /** Optional nicer dialog; falls back to window.confirm (e.g. on /lister). */
  confirm?: (options: { title: string; body?: string; confirmLabel?: string; tone?: "default" | "danger" }) => Promise<boolean>;
  notify?: (message: string, tone?: "success" | "error") => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const formRef = useRef<HTMLElement>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [sort, setSort] = useState<{ key: "name" | "category" | "price" | "stock"; direction: "asc" | "desc" }>({
    key: "name",
    direction: "asc",
  });

  const toggleSort = (key: typeof sort.key) => {
    setSort((current) =>
      current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }
    );
  };

  const sortedProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = products.filter((item) => !query || `${item.name} ${item.category} ${item.brand}`.toLowerCase().includes(query));
    const { key, direction } = sort;
    list.sort((a, b) => {
      const result = key === "price" || key === "stock" ? a[key] - b[key] : a[key].localeCompare(b[key]);
      return direction === "asc" ? result : -result;
    });
    return list;
  }, [products, sort, search]);

  const uploadImage = async (file: File) => {
    setUploading(true);
    setUploadError("");
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/blob-upload",
        clientPayload: authToken,
      });
      setForm((current) => ({ ...current, image_url: blob.url }));
      notify?.("Image uploaded");
    } catch {
      setUploadError("Could not upload image.");
    } finally {
      setUploading(false);
    }
  };

  const loadProducts = async () => {
    setProductsLoading(true);
    setProductsError("");
    try {
      const loaded = (await fetchAllProducts(API_BASE)) as Product[];
      setProducts(loaded);
      onProductsChange?.(loaded);
    } catch (error) {
      setProductsError(error instanceof ProductsFetchError ? error.message : "Could not connect to the server.");
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    // Plain data-fetch effect (load the product list once on mount) - the
    // case React's own docs call a valid use of useEffect, not the
    // derived-state anti-pattern this rule targets. Same justification as
    // the existing disable this pattern already has elsewhere in this app.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProducts();
    // loadProducts is a plain function recreated every render (not
    // memoized), so including it would re-run this effect - and re-fetch -
    // on every render instead of only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError("");
    setFormOpen(false);
  };

  const openForm = () => {
    setFormOpen(true);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      document.getElementById("pm-name")?.focus();
    });
  };

  const startEdit = (product: Product) => {
    setForm(productToForm(product));
    setEditingId(product.id);
    setFormError("");
    openForm();
  };

  const submitForm = async (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    setFormSaving(true);
    try {
      const payload = formToPayload(form);
      const url = editingId ? `${API_BASE}/products/${editingId}` : `${API_BASE}/products/`;
      const method = editingId ? "PUT" : "POST";
      const response = await authenticatedFetch(url, authToken, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        onSessionExpired();
        setFormError("Your session expired. Please log in again.");
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setFormError(extractErrorMessage(data, "Could not save the product."));
        return;
      }
      notify?.(editingId ? "Product saved" : "Product added");
      resetForm();
      loadProducts();
    } catch {
      setFormError("Could not connect to the server.");
    } finally {
      setFormSaving(false);
    }
  };

  const deleteProduct = async (product: Product) => {
    const confirmed = confirm
      ? await confirm({ title: `Delete "${product.name}"?`, body: "This cannot be undone.", confirmLabel: "Delete", tone: "danger" })
      : window.confirm(`Delete "${product.name}"? This cannot be undone.`);
    if (!confirmed) return;
    setDeletingId(product.id);
    try {
      const response = await authenticatedFetch(`${API_BASE}/products/${product.id}`, authToken, { method: "DELETE" });
      if (response.status === 401) {
        onSessionExpired();
        setProductsError("Your session expired. Please log in again.");
        return;
      }
      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => null);
        setProductsError(extractErrorMessage(data, "Could not delete the product."));
        return;
      }
      if (editingId === product.id) resetForm();
      notify?.("Product deleted");
      loadProducts();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {!formOpen && (
        <div className="flex justify-end">
          <button type="button" onClick={openForm} className={primaryButtonClass}>Add product</button>
        </div>
      )}
      {formOpen && (
      <section ref={formRef} className={cardClass}>
        <p role="heading" aria-level={2} className="mb-4 text-base font-semibold text-slate-900">{editingId ? "Edit product" : "Add a product"}</p>
        <form onSubmit={submitForm} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="pm-name" className={labelClass}>Name</label>
            <input id="pm-name" required placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="pm-brand" className={labelClass}>Brand</label>
            <input id="pm-brand" required placeholder="Brand" value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="pm-category" className={labelClass}>Category</label>
            <input id="pm-category" required placeholder="Category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="pm-price" className={labelClass}>Price</label>
            <input id="pm-price" required type="number" step="0.01" min="0.01" placeholder="0.00" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="pm-rating" className={labelClass}>Rating (0-5)</label>
            <input id="pm-rating" type="number" step="0.1" min="0" max="5" placeholder="0" value={form.rating} onChange={(event) => setForm({ ...form, rating: event.target.value })} className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="pm-sizes" className={labelClass}>Sizes (comma-separated)</label>
            <input id="pm-sizes" required placeholder="S, M, L" value={form.sizes} onChange={(event) => setForm({ ...form, sizes: event.target.value })} className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="pm-colors" className={labelClass}>Colors (comma-separated)</label>
            <input id="pm-colors" required placeholder="Black, White" value={form.colors} onChange={(event) => setForm({ ...form, colors: event.target.value })} className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <p className={labelClass}>Stock by size and color</p>
            <VariantStockGrid
              sizes={parseList(form.sizes)}
              colors={parseList(form.colors)}
              values={form.variantStock}
              onChange={(key, value) => setForm((current) => ({ ...current, variantStock: { ...current.variantStock, [key]: value } }))}
              inputClass={inputClass}
            />
          </div>
          <div className="md:col-span-2">
            <p className={labelClass}>Pairs with (up to 4)</p>
            <PairsWithPicker
              options={products.map((item) => ({ id: item.id, name: item.name }))}
              selected={form.companions}
              excludeId={editingId}
              onChange={(ids) => setForm((current) => ({ ...current, companions: ids, companionsTouched: true }))}
              inputClass={inputClass}
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="pm-image" className={labelClass}>Image URL (or upload below)</label>
            <input id="pm-image" required placeholder="https://..." value={form.image_url} onChange={(event) => setForm({ ...form, image_url: event.target.value })} className={inputClass} />
          </div>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            {form.image_url.trim() && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.image_url} alt="Product preview" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadImage(file);
                event.target.value = "";
              }}
              className="text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
            />
            {uploading && <span className="text-sm text-slate-500">Uploading...</span>}
            {uploadError && <span role="alert" className="text-sm text-red-600">{uploadError}</span>}
          </div>
          <div className="md:col-span-2">
            <label htmlFor="pm-description" className={labelClass}>Description</label>
            <textarea id="pm-description" placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={inputClass} rows={3} />
          </div>
          {formError && <p role="alert" className="text-sm text-red-600 md:col-span-2">{formError}</p>}
          <div className="flex gap-3 md:col-span-2">
            <button type="submit" disabled={formSaving} className={primaryButtonClass}>
              {formSaving ? "Saving..." : editingId ? "Save changes" : "Add product"}
            </button>
            <button type="button" onClick={resetForm} className={ghostButtonClass}>
              Cancel
            </button>
          </div>
        </form>
      </section>
      )}

      <section className={cardClass}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p role="heading" aria-level={2} className="text-base font-semibold text-slate-900">Products ({sortedProducts.length})</p>
          <div className="flex items-center gap-3">
            <input
              type="search"
              aria-label="Search products"
              placeholder="Search products"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={`${inputClass} w-56`}
            />
            <button onClick={loadProducts} className={iconButtonClass} title="Refresh products" aria-label="Refresh products">
              <IconRefresh className="h-4 w-4" />
            </button>
          </div>
        </div>
        {productsLoading && <TableSkeleton rows={5} cols={4} />}
        {!productsLoading && productsError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{productsError}</span>
            <button type="button" onClick={loadProducts} className={ghostButtonClass}>Retry</button>
          </div>
        )}
        {!productsLoading && !productsError && sortedProducts.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">{products.length === 0 ? "No products yet. Add your first one above." : "No products match your search."}</p>
        )}
        {!productsLoading && !productsError && sortedProducts.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <SortableTh label="Name" active={sort.key === "name"} direction={sort.direction} onClick={() => toggleSort("name")} />
                  <SortableTh label="Category" active={sort.key === "category"} direction={sort.direction} onClick={() => toggleSort("category")} />
                  <SortableTh label="Price" active={sort.key === "price"} direction={sort.direction} onClick={() => toggleSort("price")} />
                  <SortableTh label="Stock" active={sort.key === "stock"} direction={sort.direction} onClick={() => toggleSort("stock")} />
                  <th className="py-2 pr-4 font-medium" />
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map((product) => (
                  <tr key={product.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2.5 pr-4 text-slate-900">
                      <div className="flex items-center gap-3">
                        {product.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={product.image_url} alt="" className="h-10 w-10 shrink-0 rounded-md border border-slate-200 object-cover" />
                        ) : (
                          <span aria-hidden="true" className="h-10 w-10 shrink-0 rounded-md bg-slate-100" />
                        )}
                        <span>{product.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">{product.category}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-slate-600">${product.price.toFixed(2)}</td>
                    <td className="py-2.5 pr-4">
                      {product.variants && product.stock > 0 && variantTotals(product.variants).soldOut > 0 && (
                        <span className="mr-2 text-xs text-amber-700">{variantTotals(product.variants).soldOut} variants out</span>
                      )}
                      {product.stock === 0 ? (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">Out of stock</span>
                      ) : product.stock < 5 ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">{product.stock} left</span>
                      ) : (
                        <span className="text-slate-600">{product.stock}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-1 whitespace-nowrap">
                        <button
                          onClick={() => startEdit(product)}
                          className={iconButtonClass}
                          title="Edit product"
                          aria-label={`Edit ${product.name}`}
                        >
                          <IconPencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteProduct(product)}
                          disabled={deletingId === product.id}
                          className={`${iconButtonClass} hover:bg-red-50 hover:text-red-600`}
                          title="Delete product"
                          aria-label={`Delete ${product.name}`}
                        >
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

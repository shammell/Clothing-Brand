"use client";

import { useEffect, useState, type FormEvent } from "react";
import { authenticatedFetch, extractErrorMessage } from "@/lib/auth-store";

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
  rating: number;
};

type ProductFormState = {
  name: string; description: string; price: string; category: string; brand: string;
  sizes: string; colors: string; image_url: string; stock: string; rating: string;
};

const EMPTY_FORM: ProductFormState = {
  name: "", description: "", price: "", category: "", brand: "",
  sizes: "", colors: "", image_url: "", stock: "", rating: "0",
};

function productToForm(product: Product): ProductFormState {
  return {
    name: product.name, description: product.description ?? "", price: String(product.price),
    category: product.category, brand: product.brand, sizes: product.sizes.join(", "),
    colors: product.colors.join(", "), image_url: product.image_url, stock: String(product.stock),
    rating: String(product.rating),
  };
}

function formToPayload(form: ProductFormState) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    price: Number(form.price),
    category: form.category.trim(),
    brand: form.brand.trim(),
    sizes: form.sizes.split(",").map((size) => size.trim()).filter(Boolean),
    colors: form.colors.split(",").map((color) => color.trim()).filter(Boolean),
    image_url: form.image_url.trim(),
    stock: Number(form.stock),
    rating: Number(form.rating) || 0,
  };
}

const inputClass = "border border-neutral-300 px-3 py-2 text-sm w-full";

export function ProductManager({ authToken, onSessionExpired }: { authToken: string; onSessionExpired: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadProducts = async () => {
    setProductsLoading(true);
    setProductsError("");
    try {
      const response = await fetch(`${API_BASE}/products/`);
      const data = await response.json();
      if (!response.ok) {
        setProductsError(extractErrorMessage(data, "Could not load products."));
        return;
      }
      setProducts(data as Product[]);
    } catch {
      setProductsError("Could not connect to the server.");
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
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError("");
  };

  const startEdit = (product: Product) => {
    setForm(productToForm(product));
    setEditingId(product.id);
    setFormError("");
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
      resetForm();
      loadProducts();
    } catch {
      setFormError("Could not connect to the server.");
    } finally {
      setFormSaving(false);
    }
  };

  const deleteProduct = async (product: Product) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
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
      loadProducts();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <section className="bg-white border border-neutral-200 p-6 space-y-4">
        <h2 className="text-lg font-medium text-neutral-900">{editingId ? "Edit product" : "Add a product"}</h2>
        <form onSubmit={submitForm} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input required placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} />
          <input required placeholder="Brand" value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} className={inputClass} />
          <input required placeholder="Category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={inputClass} />
          <input required type="number" step="0.01" min="0.01" placeholder="Price" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} className={inputClass} />
          <input required type="number" min="0" placeholder="Stock" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} className={inputClass} />
          <input type="number" step="0.1" min="0" max="5" placeholder="Rating (0-5)" value={form.rating} onChange={(event) => setForm({ ...form, rating: event.target.value })} className={inputClass} />
          <input required placeholder="Sizes (comma-separated)" value={form.sizes} onChange={(event) => setForm({ ...form, sizes: event.target.value })} className={`${inputClass} md:col-span-2`} />
          <input required placeholder="Colors (comma-separated)" value={form.colors} onChange={(event) => setForm({ ...form, colors: event.target.value })} className={`${inputClass} md:col-span-2`} />
          <input required placeholder="Image URL (e.g. /products/x.jpg)" value={form.image_url} onChange={(event) => setForm({ ...form, image_url: event.target.value })} className={`${inputClass} md:col-span-2`} />
          <textarea placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={`${inputClass} md:col-span-2`} rows={2} />
          {formError && <p className="text-sm text-red-600 md:col-span-2">{formError}</p>}
          <div className="flex gap-3 md:col-span-2">
            <button type="submit" disabled={formSaving} className="bg-neutral-900 text-white px-4 py-2 text-sm uppercase tracking-wide disabled:opacity-60">
              {formSaving ? "Saving..." : editingId ? "Save changes" : "Add product"}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="px-4 py-2 text-sm underline">
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="bg-white border border-neutral-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-neutral-900">Products ({products.length})</h2>
          <button onClick={loadProducts} className="text-sm underline">Refresh</button>
        </div>
        {productsLoading && <p className="text-sm text-neutral-500">Loading...</p>}
        {!productsLoading && productsError && <p className="text-sm text-red-600">{productsError}</p>}
        {!productsLoading && !productsError && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500 border-b border-neutral-200">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Price</th>
                  <th className="py-2 pr-4">Stock</th>
                  <th className="py-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-4">{product.name}</td>
                    <td className="py-2 pr-4">{product.category}</td>
                    <td className="py-2 pr-4">${product.price.toFixed(2)}</td>
                    <td className="py-2 pr-4">{product.stock}</td>
                    <td className="py-2 pr-4 flex gap-3 whitespace-nowrap">
                      <button onClick={() => startEdit(product)} className="underline">Edit</button>
                      <button onClick={() => deleteProduct(product)} disabled={deletingId === product.id} className="underline text-red-600 disabled:opacity-60">
                        {deletingId === product.id ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

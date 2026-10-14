import { api, mediaUrl } from '../api/miniprogram';

export function mapCatalogFood(p) {
  return {
    id: p.catalog_key || p.id,
    catalog_key: p.catalog_key || p.id || '',
    product_id: p.product_id == null ? null : p.product_id,
    formula_id: p.formula_id == null ? null : p.formula_id,
    name: p.product_name || p.name || '',
    brand: p.brand || '',
    displayText: p.display_text || p.displayText || '',
    image: mediaUrl(p.main_image_url || p.image_url || p.cover_url || p.image || ''),
  };
}

// One query matches both brand and series through the server's search endpoint.
export async function fetchFoodCatalog(query = '', limit = 20) {
  const term = query.trim();
  // Search requires q; the original catalog remains the default browse view.
  if (!term) return api(`/products?brand=${encodeURIComponent('皇家')}&q=&limit=${limit}`);
  const result = await api(`/products/search?q=${encodeURIComponent(term)}&limit=${limit}`);
  return { ...result, items: result.suggestions || result.items || [] };
}

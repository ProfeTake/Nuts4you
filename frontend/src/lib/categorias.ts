/**
 * Orden canónico de categorías y productos: el MISMO que ve el vendedor en el
 * Turno Activo (POSDashboard), o sea Mezclas → Paquetes → Promos → Líquidos.
 *
 * Existe porque la API devuelve el stock ordenado alfabéticamente por categoría
 * (Conos, Helados, Líquidos, Mezclas…), y las pantallas de bodega quedaban con un
 * orden distinto al del POS: quien despacha y quien cuenta terminaban buscando el
 * mismo producto en lugares distintos.
 *
 * Las categorías que no estén en la lista van al final, alfabéticamente, para que
 * una categoría nueva aparezca igual en vez de desaparecer.
 * Dentro de una categoría se ordena por productoId, que sigue el orden de negocio
 * del catálogo (Maní, Almendras, Nueces, Promo), no alfabético.
 */
import { productosMock, categoriasMock } from "@/datos/mock.datos";

// El rango de acentos va con escapes (\u0300-\u036f) en vez de caracteres
// combinantes literales: así no se corrompe si el archivo pasa por un editor
// con otra codificación.

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const ORDEN_CATEGORIAS = ["mezclas", "paquetes", "promos", "liquidos", "helados", "conos"];

/** Posición de una categoría en el orden del Turno Activo. */
export function ordenCategoria(nombre: string): number {
  const i = ORDEN_CATEGORIAS.indexOf(normalizar(nombre));
  return i === -1 ? ORDEN_CATEGORIAS.length : i;
}

/** Comparador de nombres de categoría (las desconocidas van al final, en orden alfabético). */
export function compararCategorias(a: string, b: string): number {
  const da = ordenCategoria(a);
  const db = ordenCategoria(b);
  return da !== db ? da - db : normalizar(a).localeCompare(normalizar(b));
}

/**
 * Comparador de productos: primero por categoría (orden del Turno Activo) y luego
 * por id dentro de la categoría.
 */
export function compararProductos(
  a: { categoria: string; productoId: number },
  b: { categoria: string; productoId: number },
): number {
  const porCategoria = compararCategorias(a.categoria, b.categoria);
  return porCategoria !== 0 ? porCategoria : a.productoId - b.productoId;
}

// ─── Orden cuando solo se tiene el id ────────────────────────────────────────
// Varias listas (ítems de un despacho, de una venta) llegan sin el nombre de la
// categoría. En vez de que cada pantalla invente su propio orden por id, la
// categoría se resuelve desde el catálogo y se delega en compararProductos, para
// que TODAS las listas de la app queden en la misma secuencia.

const CATEGORIA_DE_PRODUCTO = new Map(
  productosMock.map((p) => [
    p.id,
    categoriasMock.find((c) => c.id === p.categoriaId)?.nombre ?? "",
  ]),
);

/** Categoría de un producto del catálogo ("" si no está: queda al final). */
export function categoriaDeProducto(productoId: number): string {
  return CATEGORIA_DE_PRODUCTO.get(productoId) ?? "";
}

/** Comparador para listas que solo traen `productoId`. */
export function compararPorProductoId(a: number, b: number): number {
  return compararProductos(
    { productoId: a, categoria: categoriaDeProducto(a) },
    { productoId: b, categoria: categoriaDeProducto(b) },
  );
}

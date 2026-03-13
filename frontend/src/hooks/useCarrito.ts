// Hook personalizado para manejar el estado del carrito de venta

import { useCallback, useState } from "react";
import type { EstadoCarrito, ItemCarrito, Producto } from "@/tipos/pos.tipos";

// Formatea un número entero CLP a formato chileno: $1.500
export function formatearCLP(monto: number): string {
  return "$" + monto.toLocaleString("es-CL");
}

export function useCarrito() {
  const [carrito, setCarrito] = useState<EstadoCarrito>({
    items: [],
    total: 0,
  });

  // Recalcula el total del carrito a partir de los items
  const calcularTotal = (items: ItemCarrito[]): number =>
    items.reduce((acc, item) => acc + item.subtotal, 0);

  // Agrega un producto al carrito (o incrementa cantidad si ya existe)
  const agregarProducto = useCallback((producto: Producto) => {
    setCarrito((prev) => {
      const indice = prev.items.findIndex(
        (item) => item.producto.id === producto.id
      );

      let nuevosItems: ItemCarrito[];

      if (indice >= 0) {
        // Ya existe: incrementar cantidad
        nuevosItems = prev.items.map((item, i) =>
          i === indice
            ? {
                ...item,
                cantidad: item.cantidad + 1,
                subtotal: (item.cantidad + 1) * item.producto.precioVenta,
              }
            : item
        );
      } else {
        // Nuevo: agregar al carrito
        const nuevoItem: ItemCarrito = {
          producto,
          cantidad: 1,
          subtotal: producto.precioVenta,
        };
        nuevosItems = [...prev.items, nuevoItem];
      }

      return { items: nuevosItems, total: calcularTotal(nuevosItems) };
    });
  }, []);

  // Incrementar cantidad de un producto
  const incrementarCantidad = useCallback((productoId: number) => {
    setCarrito((prev) => {
      const nuevosItems = prev.items.map((item) =>
        item.producto.id === productoId
          ? {
              ...item,
              cantidad: item.cantidad + 1,
              subtotal: (item.cantidad + 1) * item.producto.precioVenta,
            }
          : item
      );
      return { items: nuevosItems, total: calcularTotal(nuevosItems) };
    });
  }, []);

  // Decrementar cantidad (elimina si llega a 0)
  const decrementarCantidad = useCallback((productoId: number) => {
    setCarrito((prev) => {
      const nuevosItems = prev.items
        .map((item) =>
          item.producto.id === productoId
            ? {
                ...item,
                cantidad: item.cantidad - 1,
                subtotal: (item.cantidad - 1) * item.producto.precioVenta,
              }
            : item
        )
        .filter((item) => item.cantidad > 0);

      return { items: nuevosItems, total: calcularTotal(nuevosItems) };
    });
  }, []);

  // Eliminar un producto del carrito
  const eliminarProducto = useCallback((productoId: number) => {
    setCarrito((prev) => {
      const nuevosItems = prev.items.filter(
        (item) => item.producto.id !== productoId
      );
      return { items: nuevosItems, total: calcularTotal(nuevosItems) };
    });
  }, []);

  // Vaciar el carrito completo
  const vaciarCarrito = useCallback(() => {
    setCarrito({ items: [], total: 0 });
  }, []);

  // Cantidad total de productos en el carrito
  const cantidadTotal = carrito.items.reduce(
    (acc, item) => acc + item.cantidad,
    0
  );

  return {
    carrito,
    cantidadTotal,
    agregarProducto,
    incrementarCantidad,
    decrementarCantidad,
    eliminarProducto,
    vaciarCarrito,
  };
}

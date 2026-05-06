/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 */

// Devuelto cuando no hay condiciones para aplicar descuento
const SIN_DESCUENTO = {
  discountApplicationStrategy: "FIRST",
  discounts: [],
};

// Cantidad mínima de ítems para activar la promo (default 2 si no hay metafield)
const CANTIDAD_MINIMA_DEFAULT = 2;

/**
 * Lógica principal — evaluada por Shopify en cada cambio del carrito
 *
 * Regla de negocio:
 *   - Si el carrito tiene ítems de distintos grupos de precio,
 *     todos los ítems elegibles pagan el precio unitario del grupo más caro.
 *   - Si todos son del mismo grupo, pagan el precio normal de ese grupo.
 *
 * Configuración en productos (vía metafields):
 *   - custom.price_group     → número: precio total del grupo (ej: 2000 para "2x2000")
 *   - custom.price_group_qty → número: cantidad mínima del grupo (ej: 2, default si no existe)
 *
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  const lineas = input.cart.lines;

  // Recolectar líneas con metafield de grupo válido
  const lineasConGrupo = [];
  let maxPrecioUnitario = 0;
  const gruposDetectados = new Set();

  for (const linea of lineas) {
    if (linea.merchandise.__typename !== "ProductVariant") continue;

    const metaGrupo = linea.merchandise.product.grupoPromo;
    const metaCantidad = linea.merchandise.product.cantidadGrupo;

    if (!metaGrupo?.value) continue; // sin metafield → producto fuera de la promo

    const precioTotal = parseFloat(metaGrupo.value);
    if (isNaN(precioTotal) || precioTotal <= 0) continue;

    const cantidad = metaCantidad?.value
      ? parseInt(metaCantidad.value, 10)
      : CANTIDAD_MINIMA_DEFAULT;

    const precioUnitario = precioTotal / cantidad;

    lineasConGrupo.push({ linea, precioTotal, precioUnitario });
    gruposDetectados.add(precioTotal);

    if (precioUnitario > maxPrecioUnitario) {
      maxPrecioUnitario = precioUnitario;
    }
  }

  // Sin ítems con grupo válido → nada que hacer
  if (lineasConGrupo.length === 0) return SIN_DESCUENTO;

  // Necesitamos al menos 2 ítems elegibles en total
  const totalItems = lineasConGrupo.reduce((acc, { linea }) => acc + linea.quantity, 0);
  if (totalItems < CANTIDAD_MINIMA_DEFAULT) return SIN_DESCUENTO;

  const hayCruce = gruposDetectados.size > 1;
  const precioObjetivo = maxPrecioUnitario;

  // Calcular descuento por línea: diferencia entre precio base y precio objetivo
  const descuentos = lineasConGrupo.map(({ linea, precioTotal }) => {
    const precioBase = parseFloat(linea.cost.amountPerQuantity.amount);
    // Precio objetivo: siempre el del grupo más caro (si hay cruce o no)
    const diferencia = precioBase - precioObjetivo;

    // No podemos subir precios — solo descontamos si el precio base es mayor
    if (diferencia <= 0) return null;

    return {
      targets: [{ cartLine: { id: linea.id } }],
      value: {
        fixedAmount: {
          amount: diferencia.toFixed(2),
          appliesToEachItem: true,
        },
      },
      message: hayCruce
        ? `Promo cruzada: 2x${Math.round(maxPrecioUnitario * 2)}`
        : `Promo 2x${Math.round(precioTotal)}`,
    };
  }).filter(Boolean);

  if (descuentos.length === 0) return SIN_DESCUENTO;

  return {
    discountApplicationStrategy: "MAXIMUM",
    discounts: descuentos,
  };
}

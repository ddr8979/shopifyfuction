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

  let minItems = CANTIDAD_MINIMA_DEFAULT;
  const configMetafield = input.discountNode?.metafield?.value;
  if (configMetafield) {
    try {
      const parsedConfig = JSON.parse(configMetafield);
      if (parsedConfig.minItems) {
        minItems = parseInt(parsedConfig.minItems, 10);
      }
    } catch (e) {}
  }

  const lineasConGrupo = [];
  let maxPrecioUnitario = 0;
  const gruposDetectados = new Set();

  for (const linea of lineas) {
    if (linea.merchandise.__typename !== "ProductVariant") continue;

    const prod = linea.merchandise.product;
    const metaGrupo = prod.grupoPromo;
    const metaCantidad = prod.cantidadGrupo;

    let precioTotal = 0;
    if (metaGrupo?.value) {
      precioTotal = parseFloat(metaGrupo.value);
    } else if (prod.tag3000) precioTotal = 3000;
    else if (prod.tag2500) precioTotal = 2500;
    else if (prod.tag2000) precioTotal = 2000;
    else if (prod.tag1500) precioTotal = 1500;
    else if (prod.tag1200) precioTotal = 1200;

    if (isNaN(precioTotal) || precioTotal <= 0) continue;

    const cantidad = metaCantidad?.value
      ? parseInt(metaCantidad.value, 10)
      : minItems;

    const precioUnitario = precioTotal / cantidad;

    lineasConGrupo.push({ linea, precioTotal, precioUnitario });
    gruposDetectados.add(precioTotal);

    if (precioUnitario > maxPrecioUnitario) {
      maxPrecioUnitario = precioUnitario;
    }
  }

  if (lineasConGrupo.length === 0) return SIN_DESCUENTO;

  const totalItems = lineasConGrupo.reduce(
    (acc, { linea }) => acc + linea.quantity,
    0
  );

  if (totalItems < minItems) return SIN_DESCUENTO;

  const hayCruce = gruposDetectados.size > 1;
  const precioObjetivoUnitario = maxPrecioUnitario;

  const precioOriginalTotal = lineasConGrupo.reduce(
    (acc, { linea }) =>
      acc + parseFloat(linea.cost.amountPerQuantity.amount) * linea.quantity,
    0
  );

  const precioObjetivoTotal = totalItems * precioObjetivoUnitario;

  // BUG 1 FIX: si el objetivo no genera ahorro real, no aplicar descuento
  if (precioObjetivoTotal >= precioOriginalTotal) return SIN_DESCUENTO;

  const descuentoTotal = precioOriginalTotal - precioObjetivoTotal;
  const porcentajeDescuento = (descuentoTotal / precioOriginalTotal) * 100;

  // BUG 3 FIX: clamp entre 0.0001 y 99.9999 para no romper la API de Shopify
  const porcentajeFinal = Math.min(99.9999, Math.max(0.0001, porcentajeDescuento));

  const targets = lineasConGrupo.map(({ linea }) => ({
    cartLine: { id: linea.id },
  }));

  const debugMsg = `Dbg: OT=${precioOriginalTotal.toFixed(0)} Obj=${precioObjetivoTotal.toFixed(0)} Cruce=${hayCruce} minItems=${minItems} Desc=${porcentajeFinal.toFixed(2)}%`;

  return {
    discountApplicationStrategy: "MAXIMUM",
    discounts: [
      {
        targets,
        value: {
          percentage: {
            value: parseFloat(porcentajeFinal.toFixed(4)),
          },
        },
        message: debugMsg,
      },
    ],
  };
}

export default run;

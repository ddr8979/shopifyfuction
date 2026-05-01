/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 * @typedef {import("../generated/api").Target} Target
 */

/**
 * @type {FunctionRunResult}
 */
const EMPTY_DISCOUNT = {
  discountApplicationStrategy: "FIRST",
  discounts: [],
};

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  // Configuración dinámica (parametrizable con un par de clics desde el panel)
  const configMetafield = input.discountNode?.metafield?.value;
  const config = configMetafield ? JSON.parse(configMetafield) : {
    minItems: 2, // Por defecto requiere 2 items
  };

  // 1. Filtrar las líneas que son productos y tienen el metafield de grupo de precio
  const validLines = input.cart.lines.filter(line => {
    if (line.merchandise.__typename !== "ProductVariant") return false;
    const metafield = line.merchandise.product.priceGroup;
    return metafield && metafield.value;
  });

  if (validLines.length < config.minItems) {
    return EMPTY_DISCOUNT;
  }

  // 2. Agrupar por el valor numérico de price_group
  const groups = {};
  let totalValidItems = 0;
  let maxPriceValue = 0;

  validLines.forEach(line => {
    const groupValue = parseFloat(line.merchandise.product.priceGroup.value);
    if (!isNaN(groupValue)) {
      if (!groups[groupValue]) {
        groups[groupValue] = [];
      }
      groups[groupValue].push(line);
      totalValidItems += line.quantity;
      if (groupValue > maxPriceValue) {
        maxPriceValue = groupValue;
      }
    }
  });

  // Si no se agruparon la cantidad mínima de ítems válidos
  if (totalValidItems < config.minItems) {
    return EMPTY_DISCOUNT;
  }

  // 3. Crear los targets de descuento
  // "Aplica un descuento... para que el precio final unitario... coincida con el valor del grupo más caro"
  const targets = [];
  
  validLines.forEach(line => {
    const currentPrice = parseFloat(line.cost.amountPerQuantity.amount);
    
    // Solo aplicamos si el precio actual difiere del precio del grupo más caro.
    // OJO: Si la consigna es cobrarle "maxPriceValue" como tarifa fija a TODOS:
    if (currentPrice !== maxPriceValue) {
      targets.push({
        cartLine: {
          id: line.id
        }
      });
    }
  });

  if (targets.length === 0) {
    return EMPTY_DISCOUNT;
  }

  // Se aplica un descuento FIXED_AMOUNT por ítem
  // La API permite descuentos "FIXED_AMOUNT" o "PERCENTAGE".
  // Si queremos que cada ítem tenga un precio fijo, podemos usar un FIXED_AMOUNT por ítem si descontamos la diferencia.
  // La API no permite descuentos variables por ítem en un solo FixedAmount a menos que emitamos múltiples descuentos.
  // Según la regla: "para que el precio final unitario coincida con el valor del grupo más caro".
  // Esto significa que el descuento será (currentPrice - maxPriceValue).
  // Emitiremos descuentos individuales por cada objetivo.
  
  const discounts = validLines.map(line => {
    const currentPrice = parseFloat(line.cost.amountPerQuantity.amount);
    if (currentPrice > maxPriceValue) {
      // Disminuimos el precio para que coincida.
      const discountValue = currentPrice - maxPriceValue;
      return {
        targets: [
          {
            cartLine: {
              id: line.id
            }
          }
        ],
        value: {
          fixedAmount: {
            amount: discountValue.toString(),
            appliesToEachItem: true
          }
        },
        message: `Ajuste de precio cruzado`
      };
    } else if (currentPrice < maxPriceValue) {
      // No es posible aplicar un descuento "negativo" para aumentar el precio en Shopify.
      // Por lo tanto, si el precio es menor que el del grupo más caro, no podemos subirlo mediante un descuento.
      // Asumiendo que "price_group" define el grupo de tarifa objetivo.
      // Solo emitiremos descuentos válidos mayores a 0.
      const discountValue = currentPrice - maxPriceValue;
      if (discountValue > 0) {
          return {
            targets: [{ cartLine: { id: line.id } }],
            value: {
              fixedAmount: {
                amount: discountValue.toString(),
                appliesToEachItem: true
              }
            },
            message: `Ajuste de precio cruzado`
          };
      }
    }
    return null;
  }).filter(Boolean);

  if (discounts.length === 0) {
      return EMPTY_DISCOUNT;
  }

  return {
    discountApplicationStrategy: "MAXIMUM",
    discounts: discounts
  };
}

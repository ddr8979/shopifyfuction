// @ts-check
process.env.SHOPIFY_API_KEY = "453defce94a9dad60b538662ac63dde5";
process.env.SHOPIFY_API_SECRET = Buffer.from("c2hwc3NfYzg4YzZjOWY2YWRjMWZlOWU5OGUxOTBkMTRkZDA2Nzg=", "base64").toString("utf-8");
import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";

import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import PrivacyWebhookHandlers from "./privacy.js";

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3000",
  10
);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();

function shopFromHostParam(hostParam) {
  if (!hostParam) return null;
  try {
    const raw = decodeURIComponent(String(hostParam));
    // Shopify suele enviar `host` en base64url (usa - y _), no siempre base64 clásico.
    let b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    // Usually: "<shop>.myshopify.com/admin"
    const shop = decoded.split("/")[0];
    if (!shop || !shop.includes(".myshopify.com")) return null;
    return shop;
  } catch {
    return null;
  }
}

// En algunos contextos Shopify envía `host` pero no `shop`.
// Para no quedar en "No shop provided", inferimos `shop` desde `host`.
app.use((req, _res, next) => {
  if (req?.query && !req.query.shop && req.query.host) {
    const inferredShop = shopFromHostParam(req.query.host);
    if (inferredShop) req.query.shop = inferredShop;
  }
  // Fallback para acceso directo al dominio (sin shop/host).
  // Solo aplicamos DEFAULT_SHOP si existe explícitamente en env variables.
  if (req?.query && !req.query.shop && !req.query.host) {
    if (process.env.DEFAULT_SHOP) {
      req.query.shop = process.env.DEFAULT_SHOP;
    }
  }
  next();
});

// Configurar autenticación de Shopify y manejo de webhooks
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  // Auto-setup: deja la tienda lista apenas se instala la app.
  // Es idempotente (si ya estaba configurado, no rompe).
  async (_req, res, next) => {
    try {
      const client = new shopify.api.clients.Graphql({
        session: res.locals.shopify.session,
      });

      await ensurePromoMetafields(client);
      await applyPromosFromCollections(client, [
        { collection: "2x1200", priceGroup: 1200, qty: 2 },
        { collection: "2x1500-1", priceGroup: 1500, qty: 2 },
        { collection: "2x2000-calzado", priceGroup: 2000, qty: 2 },
        { collection: "2x2500-calzado", priceGroup: 2500, qty: 2 },
        { collection: "2x3000", priceGroup: 3000, qty: 2 },
      ]);
      await ensureAutomaticDiscount(client, { minItems: 2 });
    } catch (e) {
      // Log the full stack trace instead of swallowing
      console.error(`Auto-setup failed:`, e);
    }
    next();
  },
  shopify.redirectToShopifyOrAppRoot()
);
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: PrivacyWebhookHandlers })
);

// Si agregas rutas fuera de la ruta /api, recuerda
// agregar también una regla de proxy para ellas en web/frontend/vite.config.js

app.use("/api/*", shopify.validateAuthenticatedSession());

app.use(express.json());

app.get("/api/products/count", async (_req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  const countData = await client.request(`
    query shopifyProductCount {
      productsCount {
        count
      }
    }
  `);

  res.status(200).send({ count: countData.data.productsCount.count });
});

app.post("/api/products", async (_req, res) => {
  let status = 200;
  let error = null;

  try {
    await productCreator(res.locals.shopify.session);
  } catch (e) {
    console.log(`Failed to process products/create: ${e.message}`);
    status = 500;
    error = e.message;
  }
  res.status(status).send({ success: status === 200, error });
});

app.post("/api/discounts/setup-metafields", async (_req, res) => {
  try {
    const client = new shopify.api.clients.Graphql({
      session: res.locals.shopify.session,
    });

    const createDefinition = async ({ name, namespace, key, type, ownerType }) => {
      const response = await client.request(
        `
          mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
            metafieldDefinitionCreate(definition: $definition) {
              createdDefinition { id }
              userErrors { message }
            }
          }
        `,
        {
          variables: {
            definition: { name, namespace, key, type, ownerType },
          },
        }
      );

      const errors = response?.data?.metafieldDefinitionCreate?.userErrors || [];
      if (errors.length > 0 && !errors[0].message.includes("already exists")) {
        throw new Error(errors[0].message);
      }
    };

    await createDefinition({
      name: "Grupo de Precio",
      namespace: "custom",
      key: "price_group",
      type: "integer",
      ownerType: "PRODUCT",
    });

    // Opcional: permite promos tipo "3x..." sin tocar el código.
    await createDefinition({
      name: "Cantidad Grupo (Promo)",
      namespace: "custom",
      key: "price_group_qty",
      type: "integer",
      ownerType: "PRODUCT",
    });

    res.status(200).send({ success: true, message: "Metafield configurado correctamente." });
  } catch (e) {
    res.status(500).send({ success: false, error: e.message });
  }
});

async function ensurePromoMetafields(client) {
  const createDefinition = async ({ name, namespace, key, type, ownerType }) => {
    const response = await client.request(
      `
        mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
          metafieldDefinitionCreate(definition: $definition) {
            createdDefinition { id }
            userErrors { message }
          }
        }
      `,
      {
        variables: {
          definition: { name, namespace, key, type, ownerType },
        },
      }
    );

    const errors = response?.data?.metafieldDefinitionCreate?.userErrors || [];
    if (errors.length > 0 && !errors[0].message.includes("already exists")) {
      throw new Error(errors[0].message);
    }
  };

  await createDefinition({
    name: "Grupo de Precio",
    namespace: "custom",
    key: "price_group",
    type: "integer",
    ownerType: "PRODUCT",
  });

  await createDefinition({
    name: "Cantidad Grupo (Promo)",
    namespace: "custom",
    key: "price_group_qty",
    type: "integer",
    ownerType: "PRODUCT",
  });
}

function parseCollectionHandleFromUrlOrHandle(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  // Accept raw handle like "2x1200"
  if (!trimmed.includes("/")) return trimmed;
  // Accept URLs like https://domain/collections/2x1200 or /collections/2x1200
  const match = trimmed.match(/\/collections\/([^/?#]+)/i);
  return match ? match[1] : null;
}

async function getCollectionIdByHandle(client, handle) {
  const response = await client.request(
    `
      query CollectionByHandle($handle: String!) {
        collectionByHandle(handle: $handle) { id handle title }
      }
    `,
    { variables: { handle } }
  );

  return response?.data?.collectionByHandle?.id || null;
}

async function listCollectionProductIds(client, collectionId) {
  const productIds = [];
  let cursor = null;

  while (true) {
    const response = await client.request(
      `
        query CollectionProducts($id: ID!, $after: String) {
          collection(id: $id) {
            products(first: 250, after: $after) {
              pageInfo { hasNextPage endCursor }
              nodes { id }
            }
          }
        }
      `,
      { variables: { id: collectionId, after: cursor } }
    );

    const conn = response?.data?.collection?.products;
    const nodes = conn?.nodes || [];
    for (const p of nodes) productIds.push(p.id);

    if (!conn?.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  return productIds;
}

async function setProductPromoMetafields(client, { productId, priceGroup, qty }) {
  const metafields = [
    {
      ownerId: productId,
      namespace: "custom",
      key: "price_group",
      type: "number_integer",
      value: String(priceGroup),
    },
  ];

  if (qty != null) {
    metafields.push({
      ownerId: productId,
      namespace: "custom",
      key: "price_group_qty",
      type: "number_integer",
      value: String(qty),
    });
  }

  const response = await client.request(
    `
      mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id key namespace }
          userErrors { field message }
        }
      }
    `,
    { variables: { metafields } }
  );

  const errors = response?.data?.metafieldsSet?.userErrors || [];
  if (errors.length > 0) {
    throw new Error(errors[0].message);
  }
}

async function applyPromosFromCollections(client, promos) {
  const results = [];
  for (const promo of promos) {
    const handle = parseCollectionHandleFromUrlOrHandle(promo.collection);
    const priceGroup = parseInt(promo.priceGroup, 10);
    const qty = promo.qty != null ? parseInt(promo.qty, 10) : 2;

    if (!handle) {
      results.push({ ok: false, collection: promo.collection, error: "No pude parsear el handle de la colección." });
      continue;
    }
    if (!Number.isFinite(priceGroup) || priceGroup <= 0) {
      results.push({ ok: false, collection: handle, error: "priceGroup inválido." });
      continue;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      results.push({ ok: false, collection: handle, error: "qty inválido." });
      continue;
    }

    const collectionId = await getCollectionIdByHandle(client, handle);
    if (!collectionId) {
      results.push({ ok: false, collection: handle, error: "No encontré la colección en Shopify." });
      continue;
    }

    const productIds = await listCollectionProductIds(client, collectionId);
    let updated = 0;

    for (const productId of productIds) {
      await setProductPromoMetafields(client, { productId, priceGroup, qty });
      updated += 1;
    }

    results.push({
      ok: true,
      collection: handle,
      products: productIds.length,
      updated,
      priceGroup,
      qty,
    });
  }
  return results;
}

async function ensureAutomaticDiscount(client, { minItems }) {
  const functionsResponse = await client.request(
    `
      query { shopifyFunctions(first: 10) { nodes { id apiType title handle } } }
    `
  );

  const ourFunction = functionsResponse.data.shopifyFunctions.nodes.find(
    (f) => f.apiType === "product_discounts" && 
           (f.title?.toLowerCase().includes("cross-group") || f.handle?.toLowerCase().includes("cross-group"))
  );
  if (!ourFunction) throw new Error("Shopify Function no encontrada.");

  const functionId = ourFunction.id;
  const configValue = JSON.stringify({ minItems: parseInt(minItems, 10) || 2 });

  const createDiscountResponse = await client.request(
    `
      mutation CreateAutoDiscount($functionId: String!, $startsAt: DateTime!, $value: String!) {
        discountAutomaticAppCreate(
          automaticAppDiscount: {
            title: "Descuento Inteligente (SEC)"
            functionId: $functionId
            startsAt: $startsAt
            metafields: [
              {
                namespace: "$app:cross_group_discounts"
                key: "function-configuration"
                type: "json"
                value: $value
              }
            ]
          }
        ) {
          automaticAppDiscount { discountId }
          userErrors { message }
        }
      }
    `,
    {
      variables: {
        functionId,
        startsAt: new Date().toISOString(),
        value: configValue,
      },
    }
  );

  const errors = createDiscountResponse?.data?.discountAutomaticAppCreate?.userErrors || [];
  if (errors.length > 0) {
    const msg = errors[0].message || "Error creando descuento automático.";
    // No fallar si ya existe uno con el mismo título.
    if (/already been taken|ya existe|already exists/i.test(msg)) {
      return { created: false, message: "El descuento automático ya existía." };
    }
    throw new Error(msg);
  }

  return { created: true, message: "Descuento automático creado y activado." };
}

async function getPromoSetupStatus(client) {
  const response = await client.request(
    `
      query PromoSetupStatus($handles: [String!]!) {
        metafieldDefinitions(first: 50, ownerType: PRODUCT, namespace: "custom") {
          nodes { key type name }
        }
        discountNodes(first: 50) {
          nodes {
            id
            discount {
              __typename
              ... on DiscountAutomaticApp {
                title
                status
              }
            }
          }
        }
        collectionsByHandle: nodes(ids: []) { id }
        collections: collections(first: 1) { nodes { id } }
        c1: collectionByHandle(handle: $handles[0]) { id handle title }
        c2: collectionByHandle(handle: $handles[1]) { id handle title }
        c3: collectionByHandle(handle: $handles[2]) { id handle title }
        c4: collectionByHandle(handle: $handles[3]) { id handle title }
        c5: collectionByHandle(handle: $handles[4]) { id handle title }
      }
    `,
    {
      variables: {
        handles: ["2x1200", "2x1500-1", "2x2000-calzado", "2x2500-calzado", "2x3000"],
      },
    }
  );

  const defs = response?.data?.metafieldDefinitions?.nodes || [];
  const hasPriceGroup = defs.some((d) => d.key === "price_group");
  const hasQty = defs.some((d) => d.key === "price_group_qty");

  const discounts = (response?.data?.discountNodes?.nodes || [])
    .map((n) => n.discount)
    .filter(Boolean);
  const secDiscount = discounts.find(
    (d) => d.__typename === "DiscountAutomaticApp" && d.title === "Descuento Inteligente (SEC)"
  );

  const collections = [
    response?.data?.c1,
    response?.data?.c2,
    response?.data?.c3,
    response?.data?.c4,
    response?.data?.c5,
  ];

  return {
    metafields: {
      price_group: hasPriceGroup,
      price_group_qty: hasQty,
      foundKeys: defs.map((d) => d.key),
    },
    discount: secDiscount
      ? { exists: true, status: secDiscount.status }
      : { exists: false },
    collections: collections.map((c) =>
      c?.id ? { ok: true, handle: c.handle, title: c.title } : { ok: false }
    ),
  };
}

// Automatiza el "cargar metafields" desde colecciones (links) para evitar hacerlo producto por producto.
app.post("/api/promos/apply-from-collections", async (req, res) => {
  try {
    const promos = Array.isArray(req.body?.promos) ? req.body.promos : [];
    if (promos.length === 0) {
      return res.status(400).send({ success: false, error: "Falta 'promos' en el body." });
    }

    const client = new shopify.api.clients.Graphql({
      session: res.locals.shopify.session,
    });

    const results = await applyPromosFromCollections(client, promos);

    res.status(200).send({ success: true, results });
  } catch (e) {
    res.status(500).send({ success: false, error: e.message });
  }
});

// Un solo endpoint: crea metafields + aplica promos + activa descuento automático.
app.post("/api/setup-all", async (req, res) => {
  try {
    const minItems = req.body?.minItems ?? 2;
    const promos = Array.isArray(req.body?.promos) ? req.body.promos : [
      { collection: "2x1200", priceGroup: 1200, qty: 2 },
      { collection: "2x1500-1", priceGroup: 1500, qty: 2 },
      { collection: "2x2000-calzado", priceGroup: 2000, qty: 2 },
      { collection: "2x2500-calzado", priceGroup: 2500, qty: 2 },
      { collection: "2x3000", priceGroup: 3000, qty: 2 },
    ];

    const client = new shopify.api.clients.Graphql({
      session: res.locals.shopify.session,
    });

    await ensurePromoMetafields(client);
    const promoResults = await applyPromosFromCollections(client, promos);
    const discountResult = await ensureAutomaticDiscount(client, { minItems });

    res.status(200).send({
      success: true,
      promoResults,
      discount: discountResult,
    });
  } catch (e) {
    console.error(`Setup-all failed:`, e);
    res.status(500).send({ success: false, error: e.message, stack: e.stack });
  }
});

app.get("/api/setup/status", async (_req, res) => {
  try {
    const client = new shopify.api.clients.Graphql({
      session: res.locals.shopify.session,
    });
    const status = await getPromoSetupStatus(client);
    res.status(200).send({ success: true, status });
  } catch (e) {
    res.status(500).send({ success: false, error: e.message });
  }
});

app.post("/api/discounts/configure", async (req, res) => {
  try {
    const { minItems } = req.body;
    const client = new shopify.api.clients.Graphql({
      session: res.locals.shopify.session,
    });

    const result = await ensureAutomaticDiscount(client, { minItems });
    res.status(200).send({ success: true, message: result.message });
  } catch (e) {
    res.status(500).send({ success: false, error: e.message });
  }
});

app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

app.get("/privacy", (_req, res) => {
  res.status(200).send("<h1>Política de Privacidad - Motor de Descuentos (SEC)</h1><p>Esta aplicación no recopila datos personales de los clientes. Solo procesa información del carrito para aplicar descuentos automáticos.</p>");
});

app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res, _next) => {
  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(
      readFileSync(join(STATIC_PATH, "index.html"))
        .toString()
        .replace("%VITE_SHOPIFY_API_KEY%", process.env.SHOPIFY_API_KEY || "")
    );
});

app.listen(PORT);

// @ts-check
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

// Configurar autenticación de Shopify y manejo de webhooks
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
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

    const response = await client.request(`
      mutation {
        metafieldDefinitionCreate(definition: {
          name: "Grupo de Precio"
          namespace: "custom"
          key: "price_group"
          type: "integer"
          ownerType: PRODUCT
        }) {
          createdDefinition { id }
          userErrors { message }
        }
      }
    `);

    const errors = response.data.metafieldDefinitionCreate.userErrors;
    if (errors && errors.length > 0 && !errors[0].message.includes("already exists")) {
      return res.status(400).send({ success: false, error: errors[0].message });
    }

    res.status(200).send({ success: true, message: "Metafield configurado correctamente." });
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

    const functionsResponse = await client.request(`
      query { shopifyFunctions(first: 10) { nodes { id apiType } } }
    `);

    const ourFunction = functionsResponse.data.shopifyFunctions.nodes.find(f => f.apiType === "product_discounts");
    if (!ourFunction) {
      return res.status(404).send({ success: false, error: "Shopify Function no encontrada." });
    }

    const functionId = ourFunction.id;
    const configValue = JSON.stringify({ minItems: parseInt(minItems, 10) || 2 });

    const createDiscountResponse = await client.request(`
      mutation {
        discountAutomaticAppCreate(
          automaticAppDiscount: {
            title: "Descuento Inteligente (SEC)"
            functionId: "${functionId}"
            startsAt: "${new Date().toISOString()}"
            metafields: [
              {
                namespace: "$app:cross_group_discounts"
                key: "function-configuration"
                type: "json"
                value: ${JSON.stringify(configValue)}
              }
            ]
          }
        ) {
          automaticAppDiscount { discountId }
          userErrors { message }
        }
      }
    `);

    const errors = createDiscountResponse.data.discountAutomaticAppCreate.userErrors;
    if (errors && errors.length > 0) {
      // Si ya existe uno con el mismo nombre u otro error, se podría manejar aquí.
      return res.status(400).send({ success: false, error: errors[0].message });
    }

    res.status(200).send({ success: true, message: "Configuración guardada y activada." });
  } catch (e) {
    res.status(500).send({ success: false, error: e.message });
  }
});

app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

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

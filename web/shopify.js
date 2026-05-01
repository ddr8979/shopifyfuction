import { BillingInterval, LATEST_API_VERSION } from "@shopify/shopify-api";
import { shopifyApp } from "@shopify/shopify-app-express";
import { SQLiteSessionStorage } from "@shopify/shopify-app-session-storage-sqlite";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-10";

const DB_PATH = `${process.cwd()}/database.sqlite`;

// Las transacciones con Shopify siempre se marcarán como de prueba, a menos que NODE_ENV sea "production".
// Consulta la documentación de Shopify para aprender más sobre facturación.
const billingConfig = {
  "Cargo Único de Shopify": {
    // Esta es una configuración de ejemplo para un cargo único de $5 (solo se admite USD actualmente)
    amount: 5.0,
    currencyCode: "USD",
    interval: BillingInterval.OneTime,
  },
};

const shopify = shopifyApp({
  api: {
    apiVersion: LATEST_API_VERSION,
    restResources,
    scopes: (process.env.SCOPES || "write_products,write_discounts").split(","),
    hostName: process.env.HOST ? process.env.HOST.replace("https://", "").replace("http://", "") : "shopifyfuction.onrender.com",
    future: {
      customerAddressDefaultFix: true,
      lineItemBilling: true,
      unstable_managedPricingSupport: true,
    },
    billing: undefined, // O reemplazalo con 'billingConfig' arriba para habilitar la facturación de ejemplo
  },
  auth: {
    path: "/api/auth",
    callbackPath: "/api/auth/callback",
  },
  webhooks: {
    path: "/api/webhooks",
  },
  // Esto debería reemplazarse con tu estrategia de almacenamiento de base de datos preferida (PostgreSQL, Redis, etc.)
  sessionStorage: new SQLiteSessionStorage(DB_PATH),
});

export default shopify;

import {
  Page,
  Layout,
  Text,
  Stack,
  Button,
  Badge,
  Icon,
  Divider,
} from "@shopify/polaris";
import { InfoMinor, SettingsMajor } from "@shopify/polaris-icons";
import { useState } from "react";

export default function HomePage() {
  const [isActivating, setIsActivating] = useState(false);
  const [activationResult, setActivationResult] = useState(null);
  const [minItems, setMinItems] = useState("2");

  const handleActivate = async () => {
    setIsActivating(true);
    setActivationResult(null);
    try {
      const response = await fetch("/api/discounts/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minItems }),
      });
      const data = await response.json();
      
      if (data.success) {
        setActivationResult({ type: "success", message: data.message });
      } else {
        setActivationResult({ type: "error", message: data.error || "Ocurrió un error al guardar." });
      }
    } catch (e) {
      setActivationResult({ type: "error", message: "Error de red al activar el descuento." });
    } finally {
      setIsActivating(false);
    }
  };

  const cardStyle = {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03)",
    border: "1px solid rgba(0, 0, 0, 0.04)",
  };

  return (
    <Page>
      <div style={{ maxWidth: "800px", margin: "0 auto", paddingBottom: "40px" }}>
        
        {/* Header Section */}
        <div style={{ textAlign: "center", marginBottom: "40px", marginTop: "20px" }}>
          <Text as="h1" variant="heading3xl" fontWeight="bold">
            MOTOR DE DESCUENTOS INTELIGENTES
          </Text>
        </div>

        <Layout>
          <Layout.Section>
            
            {/* Main Info Card */}
            <div style={cardStyle}>
              <Stack vertical spacing="loose">
                <Stack alignment="center" spacing="tight">
                  <Icon source={InfoMinor} color="base" />
                  <Text as="h2" variant="headingLg" fontWeight="semibold">
                    ¿Cómo funciona esto?
                  </Text>
                </Stack>
                <Text as="p" variant="bodyMd" color="subdued">
                  Esta aplicación instala una <b>Function de Shopify</b> invisible en tu tienda. 
                  Agrupa los productos del carrito según su Metafield y, si hay al menos 2 ítems, 
                  iguala el precio al producto más caro del grupo.
                </Text>
                <Divider />
                
                <Text as="h3" variant="headingMd" fontWeight="semibold">
                  1. Configurar los Grupos
                </Text>
                <Text as="p" variant="bodyMd" color="subdued">
                  Para que el motor sepa qué productos van juntos, hacé esto:
                  <ol style={{ marginTop: "10px", paddingLeft: "20px" }}>
                    <li>Andá a <b>Configuración</b> (abajo a la izquierda en tu Shopify).</li>
                    <li>Buscá <b>Datos personalizados</b> y hacé clic en <b>Productos</b>.</li>
                    <li>Dale a <b>Agregar definición</b>.</li>
                    <li>En nombre poné: <code style={{background: "#f4f6f8", padding: "2px 4px"}}>Grupo de Precio</code>.</li>
                    <li>En Namespace y clave pegá esto: <code style={{background: "#f4f6f8", padding: "2px 4px"}}>custom.price_group</code>.</li>
                    <li>Elegí el tipo: <b>Número entero</b> (Integer).</li>
                  </ol>
                  ¡Listo! Ahora en cada producto te va a aparecer un campo al final para ponerles un número (ej: todos los del grupo 1 tendrán el mismo precio).
                </Text>

                <Text as="h3" variant="headingMd" fontWeight="semibold" style={{ marginTop: "12px" }}>
                  2. Guardar Configuración
                </Text>
                <Text as="p" variant="bodyMd" color="subdued">
                  Ajusta los parámetros en el panel de la derecha y haz clic en guardar. 
                  El motor se actualizará automáticamente con tus preferencias.
                </Text>
              </Stack>
            </div>

          </Layout.Section>

          <Layout.Section>
            
            {/* Settings Card */}
            <div style={{ ...cardStyle, marginTop: "20px" }}>
              <Stack vertical spacing="loose">
                <Stack alignment="center" spacing="tight">
                  <Icon source={SettingsMajor} color="base" />
                  <Text as="h2" variant="headingMd" fontWeight="semibold">
                    Configuración del Motor
                  </Text>
                </Stack>
                
                <Text as="p" variant="bodyMd" color="subdued">
                  Define las reglas para que se aplique el cruce de grupos.
                </Text>
                
                <div style={{ marginTop: "10px" }}>
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    Mínimo de ítems requeridos
                  </Text>
                  <input 
                    type="number" 
                    value={minItems}
                    onChange={(e) => setMinItems(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #c9cccf",
                      marginTop: "6px"
                    }}
                  />
                  <Text as="p" variant="bodySm" color="subdued" style={{ marginTop: "4px" }}>
                    Cantidad de productos del mismo grupo que deben estar en el carrito.
                  </Text>
                </div>

                <Stack distribution="trailing">
                  <Button 
                    primary 
                    loading={isActivating} 
                    onClick={handleActivate}
                  >
                    Guardar y Activar
                  </Button>
                </Stack>
                
                {activationResult && (
                  <div style={{
                    marginTop: "12px",
                    padding: "12px",
                    borderRadius: "8px",
                    background: activationResult.type === "success" ? "#e3f1df" : "#fbeae5",
                    color: activationResult.type === "success" ? "#2b6b22" : "#d82c0d"
                  }}>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      {activationResult.message}
                    </Text>
                  </div>
                )}
              </Stack>
            </div>

          </Layout.Section>
        </Layout>
        
        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: "40px", opacity: 0.6 }}>
          <Text as="p" variant="bodyXs" fontWeight="bold" style={{ letterSpacing: "1px" }}>
            POWERED BY SEC
          </Text>
        </div>

      </div>
    </Page>
  );
}

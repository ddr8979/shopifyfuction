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
import { useEffect, useState } from "react";

export default function HomePage() {
  const [isActivating, setIsActivating] = useState(false);
  const [activationResult, setActivationResult] = useState(null);
  const [minItems, setMinItems] = useState("2");
  const [isApplyingPromos, setIsApplyingPromos] = useState(false);
  const [isSetupAll, setIsSetupAll] = useState(false);
  const [setupStatus, setSetupStatus] = useState(null);
  const [setupStatusError, setSetupStatusError] = useState(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  const loadSetupStatus = async () => {
    setIsLoadingStatus(true);
    setSetupStatusError(null);
    try {
      const res = await fetch("/api/setup/status");
      const data = await res.json();
      if (!data.success) {
        setSetupStatusError(data.error || "Error leyendo status.");
        setSetupStatus(null);
        return;
      }
      setSetupStatus(data.status);
    } catch (e) {
      setSetupStatusError("Error de red leyendo status.");
      setSetupStatus(null);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    loadSetupStatus();
  }, []);

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

  const handleApplyPromosFromCollections = async () => {
    setIsApplyingPromos(true);
    try {
      const promos = [
        { collection: "2x1200", priceGroup: 1200, qty: 2 },
        { collection: "2x1500-1", priceGroup: 1500, qty: 2 },
        { collection: "2x2000-calzado", priceGroup: 2000, qty: 2 },
        { collection: "2x2500-calzado", priceGroup: 2500, qty: 2 },
        { collection: "2x3000", priceGroup: 3000, qty: 2 },
      ];

      const res = await fetch("/api/promos/apply-from-collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promos }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || "Error al aplicar promos.");
        return;
      }

      const ok = (data.results || []).filter((r) => r.ok).length;
      const fail = (data.results || []).filter((r) => !r.ok).length;
      alert(`Listo. OK: ${ok}. Errores: ${fail}.`);
    } catch (e) {
      alert("Error de red al aplicar promos.");
    } finally {
      setIsApplyingPromos(false);
    }
  };

  const handleSetupAll = async () => {
    setIsSetupAll(true);
    try {
      const res = await fetch("/api/setup-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minItems: parseInt(minItems, 10) || 2 }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || "Error al hacer la configuración completa.");
        return;
      }

      const ok = (data.promoResults || []).filter((r) => r.ok).length;
      const fail = (data.promoResults || []).filter((r) => !r.ok).length;
      alert(`TODO LISTO. Promos OK: ${ok}. Errores: ${fail}. ${data.discount?.message || ""}`);
      loadSetupStatus();
    } catch (e) {
      alert("Error de red al hacer la configuración completa.");
    } finally {
      setIsSetupAll(false);
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
                  1. Configurar Grupos Automáticamente
                </Text>
                <Text as="p" variant="bodyMd" color="subdued">
                  No hace falta que busques nada en la configuración. Hacé clic acá y nosotros 
                  creamos el campo "Grupo de Precio" por vos en todos tus productos.
                </Text>
                <div style={{ marginTop: "10px" }}>
                  <Button 
                    outline 
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/discounts/setup-metafields", { method: "POST" });
                        const data = await res.json();
                        alert(data.success ? "¡Listo! Ya podés ir a tus productos y vas a ver el campo 'Grupo de Precio' al final." : data.error);
                      } catch (e) {
                        alert("Error de red.");
                      }
                    }}
                  >
                    Configurar Campo en Productos
                  </Button>
                </div>

                <Divider />

                <Text as="h3" variant="headingMd" fontWeight="semibold">
                  Estado (debug)
                </Text>
                <Text as="p" variant="bodyMd" color="subdued">
                  Esto te dice si el deploy está bien y qué parte está faltando.
                </Text>
                <div style={{ marginTop: "10px" }}>
                  <Button outline loading={isLoadingStatus} onClick={loadSetupStatus}>
                    Actualizar estado
                  </Button>
                </div>
                {setupStatusError && (
                  <div style={{ marginTop: "12px", padding: "12px", borderRadius: "8px", background: "#fbeae5", color: "#d82c0d" }}>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      {setupStatusError}
                    </Text>
                  </div>
                )}
                {setupStatus && (
                  <div style={{ marginTop: "12px", padding: "12px", borderRadius: "8px", background: "#f6f6f7" }}>
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      Metafields: price_group={String(setupStatus.metafields?.price_group)} · price_group_qty={String(setupStatus.metafields?.price_group_qty)}
                    </Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      Descuento: exists={String(setupStatus.discount?.exists)}{setupStatus.discount?.status ? ` · status=${setupStatus.discount.status}` : ""}
                    </Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      Colecciones OK: {(setupStatus.collections || []).filter((c) => c.ok).length}/5
                    </Text>
                  </div>
                )}

                <Divider />

                <Text as="h3" variant="headingMd" fontWeight="semibold">
                  1c. TODO listo (recomendado)
                </Text>
                <Text as="p" variant="bodyMd" color="subdued">
                  Hace todo junto: crea los metafields, aplica las promos por colecciones y activa el motor.
                </Text>
                <div style={{ marginTop: "10px" }}>
                  <Button
                    primary
                    loading={isSetupAll}
                    onClick={handleSetupAll}
                  >
                    Hacer Todo Listo
                  </Button>
                </div>

                <Divider />

                <Text as="h3" variant="headingMd" fontWeight="semibold">
                  1b. Cargar Promos desde Colecciones (Kaotiko)
                </Text>
                <Text as="p" variant="bodyMd" color="subdued">
                  Esto toma las colecciones 2x1200/1500/2000/2500/3000 y asigna el metafield
                  a todos los productos automáticamente.
                </Text>
                <div style={{ marginTop: "10px" }}>
                  <Button
                    primary
                    loading={isApplyingPromos}
                    onClick={handleApplyPromosFromCollections}
                  >
                    Aplicar Promos por Colecciones
                  </Button>
                </div>

                <Text as="h3" variant="headingMd" fontWeight="semibold" style={{ marginTop: "12px" }}>
                  2. Guardar y Activar Motor
                </Text>
                <Text as="p" variant="bodyMd" color="subdued">
                  Ajusta el mínimo de ítems en el panel de la derecha y dale a "Guardar".
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

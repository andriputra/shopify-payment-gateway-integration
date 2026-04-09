const form = document.getElementById("configForm");
const resultEl = document.getElementById("result");
const loadBtn = document.getElementById("loadConfigBtn");
const lookupShopInput = document.getElementById("lookupShop");
const createCheckoutBtn = document.getElementById("createCheckoutBtn");
const checkoutHintEl = document.getElementById("checkoutHint");
const connectShopifyBtn = document.getElementById("connectShopifyBtn");
const oauthShopInput = document.getElementById("oauthShop");

function showResult(data) {
  resultEl.textContent = JSON.stringify(data, null, 2);
}

async function saveConfig(event) {
  event.preventDefault();

  const payload = {
    shop: document.getElementById("shop").value.trim(),
    provider: document.getElementById("provider").value,
    redirectUrlAfterPaid: document.getElementById("redirectUrlAfterPaid").value.trim(),
    webhookUrlAfterPaid: document.getElementById("webhookUrlAfterPaid").value.trim() || undefined,
    credentials: {
      apiKey: document.getElementById("apiKey").value.trim(),
      apiSecret: document.getElementById("apiSecret").value.trim() || undefined
    }
  };

  try {
    const response = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    showResult(data);
  } catch (error) {
    showResult({ ok: false, message: error instanceof Error ? error.message : "Request error" });
  }
}

async function loadConfig() {
  const shop = lookupShopInput.value.trim();
  if (!shop) {
    showResult({ ok: false, message: "Masukkan shop domain dulu." });
    return;
  }

  try {
    const response = await fetch(`/api/config/${encodeURIComponent(shop)}`);
    const data = await response.json();
    showResult(data);
  } catch (error) {
    showResult({ ok: false, message: error instanceof Error ? error.message : "Request error" });
  }
}

async function createDemoCheckout() {
  const shop = document.getElementById("shop").value.trim();
  const provider = document.getElementById("provider").value;
  const orderId = document.getElementById("checkoutOrderId").value.trim() || `ORDER-${Date.now()}`;
  const amountRaw = Number(document.getElementById("checkoutAmount").value);
  const currency = document.getElementById("checkoutCurrency").value.trim().toUpperCase() || "IDR";
  const amount = Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : 125000;

  if (!shop) {
    showResult({ ok: false, message: "Isi Shop Domain dulu sebelum create checkout." });
    return;
  }

  if (provider !== "sandbox") {
    showResult({
      ok: false,
      message: "Untuk presentasi tanpa akun gateway, pilih provider sandbox dulu."
    });
    return;
  }

  try {
    const response = await fetch("/api/payments/checkout/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shop,
        provider,
        amount,
        currency,
        orderId
      })
    });
    const data = await response.json();
    showResult(data);

    if (data.ok && data.paymentUrl) {
      checkoutHintEl.textContent = "Checkout berhasil dibuat. Membuka simulator pembayaran di tab baru...";
      window.open(data.paymentUrl, "_blank", "noopener,noreferrer");
    }
  } catch (error) {
    showResult({ ok: false, message: error instanceof Error ? error.message : "Request error" });
  }
}

function connectShopify() {
  const shop =
    oauthShopInput.value.trim() || document.getElementById("shop").value.trim() || lookupShopInput.value.trim();
  if (!shop) {
    showResult({ ok: false, message: "Isi shop domain dulu untuk OAuth install Shopify." });
    return;
  }
  window.location.href = `/auth/shopify?shop=${encodeURIComponent(shop)}`;
}

form.addEventListener("submit", saveConfig);
loadBtn.addEventListener("click", loadConfig);
createCheckoutBtn.addEventListener("click", createDemoCheckout);
connectShopifyBtn.addEventListener("click", connectShopify);

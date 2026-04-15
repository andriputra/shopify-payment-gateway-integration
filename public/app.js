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

  const provider = document.getElementById("provider").value;
  const credentials = {
    apiKey: document.getElementById("apiKey").value.trim(),
    apiSecret: document.getElementById("apiSecret").value.trim() || undefined
  };

  if (provider === "swipe") {
    const swipeBase = document.getElementById("swipeApiBaseUrl").value.trim();
    const swipeClientId = document.getElementById("swipeClientId").value.trim();
    const swipeDeviceUser = document.getElementById("swipeDeviceUser").value.trim();
    const swipePosRequestType = document.getElementById("swipePosRequestType").value.trim();
    const swipePaymentMethod = document.getElementById("swipePaymentMethod").value.trim();
    const swipePath = document.getElementById("swipeCreatePath").value.trim();
    const swipeFeeAgentAmount = document.getElementById("swipeFeeAgentAmount").value.trim();
    const swipeFeeDistributorAmount = document.getElementById("swipeFeeDistributorAmount").value.trim();
    const swipeFeePromotorAmount = document.getElementById("swipeFeePromotorAmount").value.trim();
    if (
      swipeBase ||
      swipePath ||
      swipeClientId ||
      swipeDeviceUser ||
      swipePosRequestType ||
      swipePaymentMethod ||
      swipeFeeAgentAmount ||
      swipeFeeDistributorAmount ||
      swipeFeePromotorAmount
    ) {
      credentials.extra = {};
      if (swipeBase) {
        credentials.extra.apiBaseUrl = swipeBase.replace(/\/$/, "");
      }
      if (swipePath) {
        credentials.extra.createPath = swipePath.startsWith("/") ? swipePath : `/${swipePath}`;
      }
      if (swipeClientId) {
        credentials.extra.clientId = swipeClientId;
      }
      if (swipeDeviceUser) {
        credentials.extra.deviceUser = swipeDeviceUser;
      }
      if (swipePosRequestType) {
        credentials.extra.posRequestType = swipePosRequestType;
      }
      if (swipePaymentMethod) {
        credentials.extra.paymentMethod = swipePaymentMethod;
      }
      if (swipeFeeAgentAmount) {
        credentials.extra.feeAgentAmount = swipeFeeAgentAmount;
      }
      if (swipeFeeDistributorAmount) {
        credentials.extra.feeDistributorAmount = swipeFeeDistributorAmount;
      }
      if (swipeFeePromotorAmount) {
        credentials.extra.feePromotorAmount = swipeFeePromotorAmount;
      }
    }
  }

  const payload = {
    shop: document.getElementById("shop").value.trim(),
    provider,
    redirectUrlAfterPaid: document.getElementById("redirectUrlAfterPaid").value.trim(),
    webhookUrlAfterPaid: document.getElementById("webhookUrlAfterPaid").value.trim() || undefined,
    credentials
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
      checkoutHintEl.textContent = "Checkout dibuat. Membuka halaman pembayaran di tab baru…";
      window.open(data.paymentUrl, "_blank", "noopener,noreferrer");
    } else if (data.ok) {
      checkoutHintEl.textContent = "Permintaan pembayaran berhasil (tanpa URL redirect).";
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


const providerSelect = document.getElementById("provider");
const customFields = document.getElementById("customFields");
const swipeFields = document.getElementById("swipeFields");

function syncProviderPanels() {
  const provider = providerSelect.value;
  customFields.classList.toggle("hidden", provider !== "custom");
  swipeFields.classList.toggle("hidden", provider !== "swipe");
}

providerSelect.addEventListener("change", syncProviderPanels);
syncProviderPanels();
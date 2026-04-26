import createApp from "@shopify/app-bridge";
import { getSessionToken } from "@shopify/app-bridge/utilities";

const form = document.getElementById("configForm");
const resultEl = document.getElementById("result");
const loadBtn = document.getElementById("loadConfigBtn");
const lookupShopInput = document.getElementById("lookupShop");
const createCheckoutBtn = document.getElementById("createCheckoutBtn");
const checkoutHintEl = document.getElementById("checkoutHint");
const connectShopifyBtn = document.getElementById("connectShopifyBtn");
const oauthShopInput = document.getElementById("oauthShop");
const installStatusBanner = document.getElementById("installStatusBanner");
const viewConfig = document.getElementById("viewConfig");
const viewSystem = document.getElementById("viewSystem");
const viewCompliance = document.getElementById("viewCompliance");
const viewGoLive = document.getElementById("viewGoLive");

const tabConfig = document.getElementById("tabConfig");
const tabSystem = document.getElementById("tabSystem");
const tabCompliance = document.getElementById("tabCompliance");
const tabGoLive = document.getElementById("tabGoLive");

const refreshSystemBtn = document.getElementById("refreshSystemBtn");
const refreshComplianceBtn = document.getElementById("refreshComplianceBtn");
const refreshGoLiveBtn = document.getElementById("refreshGoLiveBtn");

const systemStorage = document.getElementById("systemStorage");
const systemMysql = document.getElementById("systemMysql");
const systemCounts = document.getElementById("systemCounts");
const systemRuntime = document.getElementById("systemRuntime");
const systemLastCompliance = document.getElementById("systemLastCompliance");

const complianceShopFilter = document.getElementById("complianceShopFilter");
const complianceTopicFilter = document.getElementById("complianceTopicFilter");
const complianceLimit = document.getElementById("complianceLimit");
const complianceTableBody = document.getElementById("complianceTableBody");

const goLiveAppUrl = document.getElementById("goLiveAppUrl");
const goLiveRedirectUrl = document.getElementById("goLiveRedirectUrl");
const goLiveWebhookDataRequest = document.getElementById("goLiveWebhookDataRequest");
const goLiveWebhookCustomersRedact = document.getElementById("goLiveWebhookCustomersRedact");
const goLiveWebhookShopRedact = document.getElementById("goLiveWebhookShopRedact");

const params = new URLSearchParams(window.location.search);
const apiKey = params.get("apiKey") || params.get("api_key") || "YOUR_FALLBACK_API_KEY";
const host = params.get("host");

const hasAdvancedTabs =
  viewConfig &&
  viewSystem &&
  viewCompliance &&
  viewGoLive &&
  tabConfig &&
  tabSystem &&
  tabCompliance &&
  tabGoLive &&
  refreshSystemBtn &&
  refreshComplianceBtn &&
  refreshGoLiveBtn &&
  systemStorage &&
  systemMysql &&
  systemCounts &&
  systemRuntime &&
  systemLastCompliance &&
  complianceShopFilter &&
  complianceTopicFilter &&
  complianceLimit &&
  complianceTableBody &&
  goLiveAppUrl &&
  goLiveRedirectUrl &&
  goLiveWebhookDataRequest &&
  goLiveWebhookCustomersRedact &&
  goLiveWebhookShopRedact;

function showResult(data) {
  resultEl.textContent = JSON.stringify(data, null, 2);
}

function setBanner(type, message) {
  if (!message) {
    installStatusBanner.className = "mb-6 hidden rounded-2xl border px-5 py-4 shadow-sm";
    installStatusBanner.textContent = "";
    return;
  }

  const palette =
    type === "success"
      ? "mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-900 shadow-sm"
      : "mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-rose-900 shadow-sm";

  installStatusBanner.className = palette;
  installStatusBanner.textContent = message;
}

function setActiveTab(active) {
  if (!hasAdvancedTabs) {
    return;
  }

  const tabs = [
    { id: "config", btn: tabConfig, view: viewConfig },
    { id: "system", btn: tabSystem, view: viewSystem },
    { id: "compliance", btn: tabCompliance, view: viewCompliance },
    { id: "golive", btn: tabGoLive, view: viewGoLive }
  ];

  for (const tab of tabs) {
    tab.view.classList.toggle("hidden", tab.id !== active);
    tab.btn.className =
      tab.id === active
        ? "rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        : "rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200";
  }
}

// async function fetchSystemStatus() {
//   const response = await fetch("/api/system/status");
//   const data = await response.json();
//   if (!response.ok || !data.ok) {
//     throw new Error(data.message || "System status request failed");
//   }
//   return data.status;
// }

const shopifyApp = createApp({
  apiKey,
  host,
});

async function fetchSystemStatus() {
  const token = await getSessionToken(shopifyApp);
  const response = await fetch("/api/system/status", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.message || "System status request failed");
  }

  return data.status;
}

function renderSystemStatus(status) {
  systemStorage.textContent = `${String(status.driver || "").toUpperCase()} (ok=${Boolean(status.ok)})`;
  if (status.driver === "mysql") {
    const mysql = status.mysql || {};
    const extra = mysql.ok ? `ok, ${mysql.latencyMs || 0}ms` : `error: ${mysql.error || "unknown"}`;
    systemMysql.textContent = `MySQL: ${extra}`;
  } else {
    systemMysql.textContent = "MySQL: n/a";
  }

  const counts = status.counts || {};
  systemCounts.innerHTML = `
    <div>store_configs: <span class="font-semibold">${counts.storeConfigs ?? "-"}</span></div>
    <div>shopify_tokens: <span class="font-semibold">${counts.shopifyTokens ?? "-"}</span></div>
    <div>payment_session_contexts: <span class="font-semibold">${counts.paymentSessionContexts ?? "-"}</span></div>
    <div>compliance_requests: <span class="font-semibold">${counts.complianceRequests ?? "-"}</span></div>
  `;

  const shopify = status.shopify || {};
  systemRuntime.innerHTML = `
    <div>host: <span class="font-semibold">${status.host || "-"}</span></div>
    <div>time: <span class="font-semibold">${status.time || "-"}</span></div>
    <div>uptime: <span class="font-semibold">${status.uptimeSec || 0}s</span></div>
    <div>shopify: <span class="font-semibold">${shopify.appUiPath || "-"}</span> / <span class="font-semibold">${shopify.redirectPath || "-"}</span></div>
  `;

  const last = status.lastCompliance;
  systemLastCompliance.textContent = last
    ? `${last.triggeredAt} | ${last.topic} | ${last.shop}`
    : "No compliance events yet.";
}

function renderGoLive(status) {
  /** @type {Record<string, string>} */
  const origin = status.host || window.location.origin;
  const base = String(origin).replace(/\/$/, "");
  const shopify = status.shopify || {};
  const hooks = shopify.complianceWebhooks || {};

  goLiveAppUrl.textContent = `${base}${shopify.appUiPath || "/app"}`;
  goLiveRedirectUrl.textContent = `${base}${shopify.redirectPath || "/auth/callback"}`;
  goLiveWebhookDataRequest.textContent = hooks.customersDataRequest || "-";
  goLiveWebhookCustomersRedact.textContent = hooks.customersRedact || "-";
  goLiveWebhookShopRedact.textContent = hooks.shopRedact || "-";
}

function copyTextFromElId(id) {
  const el = document.getElementById(id);
  const text = el ? (el.textContent || "").trim() : "";
  if (!text) return;
  navigator.clipboard.writeText(text).catch(() => {});
}

async function fetchComplianceList() {
  if (!hasAdvancedTabs) {
    return [];
  }

  const params = new URLSearchParams();
  const shop = complianceShopFilter.value.trim();
  const topic = complianceTopicFilter.value.trim();
  const limit = String(Number(complianceLimit.value || 50));

  if (shop) params.set("shop", shop);
  if (topic) params.set("topic", topic);
  params.set("limit", limit);

  const response = await fetch(`/api/compliance/requests?${params.toString()}`);
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.message || "Compliance list request failed");
  }
  return data.records || [];
}

async function fetchComplianceDetail(id) {
  const response = await fetch(`/api/compliance/requests/${encodeURIComponent(id)}`);
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.message || "Compliance detail request failed");
  }
  return data.record;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderComplianceTable(records) {
  if (!hasAdvancedTabs) {
    return;
  }

  if (!records.length) {
    complianceTableBody.innerHTML = '<tr><td class="px-4 py-3 text-slate-500" colspan="4">No data.</td></tr>';
    return;
  }

  complianceTableBody.innerHTML = records
    .map((r) => {
      const safeId = escapeHtml(r.id || "");
      const safeTopic = escapeHtml(r.topic || "");
      const safeShop = escapeHtml(r.shop || "");
      const safeTriggeredAt = escapeHtml(r.triggeredAt || "");
      return `
        <tr class="hover:bg-slate-50">
          <td class="px-4 py-3 text-slate-700">${safeTriggeredAt}</td>
          <td class="px-4 py-3 text-slate-700">${safeTopic}</td>
          <td class="px-4 py-3 text-slate-700">${safeShop}</td>
          <td class="px-4 py-3">
            <button data-compliance-id="${safeId}" class="font-mono text-xs font-semibold text-blue-700 hover:text-blue-800">${safeId}</button>
          </td>
        </tr>
      `;
    })
    .join("");
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

async function hydrateInstallState() {
  const params = new URLSearchParams(window.location.search);
  const shop = params.get("shop") || "";
  const installed = params.get("installed");
  const error = params.get("error");

  if (shop) {
    document.getElementById("shop").value = shop;
    oauthShopInput.value = shop;
    lookupShopInput.value = shop;
  }

  if (error) {
    setBanner("error", `Install Shopify gagal untuk ${shop || "shop ini"}: ${error}`);
    showResult({ ok: false, shop, message: error });
    return;
  }

  if (installed !== "1" || !shop) {
    return;
  }

  try {
    const response = await fetch(`/auth/shopify/status/${encodeURIComponent(shop)}`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || "Install status check failed");
    }

    setBanner("success", `Shopify app berhasil terinstall dan terautentikasi untuk ${shop}.`);
    showResult(data);
  } catch (installError) {
    const message = installError instanceof Error ? installError.message : "Install status check failed";
    setBanner("error", `Install selesai, tapi status install belum bisa dibaca: ${message}`);
    showResult({ ok: false, shop, message });
  }
}

form.addEventListener("submit", saveConfig);
loadBtn.addEventListener("click", loadConfig);
createCheckoutBtn.addEventListener("click", createDemoCheckout);
connectShopifyBtn.addEventListener("click", connectShopify);
hydrateInstallState();

if (hasAdvancedTabs) {
  tabConfig.addEventListener("click", () => setActiveTab("config"));

  tabSystem.addEventListener("click", async () => {
    setActiveTab("system");
    try {
      const status = await fetchSystemStatus();
      renderSystemStatus(status);
      renderGoLive(status);
    } catch (error) {
      showResult({ ok: false, message: error instanceof Error ? error.message : "System status failed" });
    }
  });

  tabCompliance.addEventListener("click", async () => {
    setActiveTab("compliance");
    try {
      const records = await fetchComplianceList();
      renderComplianceTable(records);
    } catch (error) {
      showResult({ ok: false, message: error instanceof Error ? error.message : "Compliance logs failed" });
    }
  });

  tabGoLive.addEventListener("click", async () => {
    setActiveTab("golive");
    try {
      const status = await fetchSystemStatus();
      renderSystemStatus(status);
      renderGoLive(status);
    } catch (error) {
      showResult({ ok: false, message: error instanceof Error ? error.message : "Go-live refresh failed" });
    }
  });

  refreshSystemBtn.addEventListener("click", async () => {
    try {
      const status = await fetchSystemStatus();
      renderSystemStatus(status);
      renderGoLive(status);
    } catch (error) {
      showResult({ ok: false, message: error instanceof Error ? error.message : "System refresh failed" });
    }
  });

  refreshComplianceBtn.addEventListener("click", async () => {
    try {
      const records = await fetchComplianceList();
      renderComplianceTable(records);
    } catch (error) {
      showResult({ ok: false, message: error instanceof Error ? error.message : "Compliance refresh failed" });
    }
  });

  refreshGoLiveBtn.addEventListener("click", async () => {
    try {
      const status = await fetchSystemStatus();
      renderGoLive(status);
    } catch (error) {
      showResult({ ok: false, message: error instanceof Error ? error.message : "Go-live refresh failed" });
    }
  });

  complianceTableBody.addEventListener("click", async (event) => {
    const btn = event.target && event.target.closest ? event.target.closest("[data-compliance-id]") : null;
    if (!btn) return;
    const id = btn.getAttribute("data-compliance-id");
    if (!id) return;
    try {
      const record = await fetchComplianceDetail(id);
      showResult({ ok: true, record });
    } catch (error) {
      showResult({ ok: false, message: error instanceof Error ? error.message : "Compliance detail failed" });
    }
  });

  document.addEventListener("click", (event) => {
    const btn = event.target && event.target.closest ? event.target.closest("[data-copy-target]") : null;
    if (!btn) return;
    const targetId = btn.getAttribute("data-copy-target");
    if (!targetId) return;
    copyTextFromElId(targetId);
  });

  const initialTab = (new URLSearchParams(window.location.search).get("tab") || "config").toLowerCase();
  if (initialTab === "system") {
    tabSystem.click();
  } else if (initialTab === "compliance") {
    tabCompliance.click();
  } else if (initialTab === "golive") {
    tabGoLive.click();
  } else {
    setActiveTab("config");
  }
}


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

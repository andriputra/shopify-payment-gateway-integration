const form = document.getElementById("configForm");
const resultEl = document.getElementById("result");
const loadBtn = document.getElementById("loadConfigBtn");
const lookupShopInput = document.getElementById("lookupShop");
const createCheckoutBtn = document.getElementById("createCheckoutBtn");
const swipeTestApiBtn = document.getElementById("swipeTestApiBtn");
const checkoutHintEl = document.getElementById("checkoutHint");
const connectShopifyBtn = document.getElementById("connectShopifyBtn");
const oauthShopInput = document.getElementById("oauthShop");
const installStatusBanner = document.getElementById("installStatusBanner");
const viewConfig = document.getElementById("viewConfig");
const viewSystem = document.getElementById("viewSystem");
const viewStatus = document.getElementById("viewStatus");
const viewCompliance = document.getElementById("viewCompliance");
const viewGoLive = document.getElementById("viewGoLive");

const tabConfig = document.getElementById("tabConfig");
const tabSystem = document.getElementById("tabSystem");
const tabStatus = document.getElementById("tabStatus");
const tabCompliance = document.getElementById("tabCompliance");
const tabGoLive = document.getElementById("tabGoLive");

const refreshSystemBtn = document.getElementById("refreshSystemBtn");
const refreshComplianceBtn = document.getElementById("refreshComplianceBtn");
const refreshGoLiveBtn = document.getElementById("refreshGoLiveBtn");

const invStatusSecret = document.getElementById("invStatusSecret");
const invStatusShop = document.getElementById("invStatusShop");
const invStatusInvoice = document.getElementById("invStatusInvoice");
const invStatusLimit = document.getElementById("invStatusLimit");
const invStatusMethod = document.getElementById("invStatusMethod");
const fetchInvStatusBtn = document.getElementById("fetchInvStatusBtn");
const invStatusOutput = document.getElementById("invStatusOutput");

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
const installBannerStorageKey = "shopifyInstallBannerState";
/** Remember Config / System / … across full-page OAuth redirect so the UI tab is not reset to Config. */
const ACTIVE_TAB_STORAGE_KEY = "paymentGatewayActiveTab";
const apiKeyFromMeta = document.querySelector('meta[name="shopify-api-key"]')?.getAttribute("content") || "";
const metaKey = apiKeyFromMeta && apiKeyFromMeta !== "__SHOPIFY_API_KEY__" ? apiKeyFromMeta : "";
const apiKey = params.get("apiKey") || params.get("api_key") || metaKey || "";
const host = params.get("host");
const AppBridgeGlobal = window["app-bridge"];
function resolveCreateApp(bridge) {
  if (!bridge) return null;
  if (typeof bridge.createApp === "function") return bridge.createApp.bind(bridge);
  if (bridge.default && typeof bridge.default.createApp === "function") {
    return bridge.default.createApp.bind(bridge.default);
  }
  if (typeof bridge.default === "function") return bridge.default;
  return null;
}
function resolveGetSessionToken(bridge) {
  if (!bridge || !bridge.utilities) return null;
  if (typeof bridge.utilities.getSessionToken === "function") return bridge.utilities.getSessionToken;
  return null;
}
function resolveAuthenticatedFetch(bridge) {
  if (!bridge || !bridge.utilities) return null;
  if (typeof bridge.utilities.authenticatedFetch === "function") return bridge.utilities.authenticatedFetch;
  return null;
}
const createApp = resolveCreateApp(AppBridgeGlobal);
const getSessionToken = resolveGetSessionToken(AppBridgeGlobal);

const hasAdvancedTabs =
  viewConfig &&
  viewSystem &&
  viewStatus &&
  viewCompliance &&
  viewGoLive &&
  tabConfig &&
  tabSystem &&
  tabStatus &&
  tabCompliance &&
  tabGoLive &&
  refreshSystemBtn &&
  refreshComplianceBtn &&
  refreshGoLiveBtn &&
  invStatusSecret &&
  invStatusShop &&
  invStatusInvoice &&
  invStatusLimit &&
  invStatusMethod &&
  fetchInvStatusBtn &&
  invStatusOutput &&
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

function toPlainHeaders(headers) {
  if (!headers) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  return { ...headers };
}

function shellEscapeSingleQuotes(value) {
  return String(value).replace(/'/g, "'\"'\"'");
}

function buildCurlCommand(requestDebug) {
  if (!requestDebug || !requestDebug.url || !requestDebug.method) {
    return null;
  }

  const headerEntries = Object.entries(toPlainHeaders(requestDebug.headers));
  const parts = [`curl -X ${requestDebug.method.toUpperCase()} '${shellEscapeSingleQuotes(requestDebug.url)}'`];

  for (const [key, value] of headerEntries) {
    parts.push(`-H '${shellEscapeSingleQuotes(`${key}: ${value}`)}'`);
  }

  if (requestDebug.body !== undefined && requestDebug.body !== null && requestDebug.body !== "") {
    const rawBody =
      typeof requestDebug.body === "string" ? requestDebug.body : JSON.stringify(requestDebug.body, null, 2);
    parts.push(`--data '${shellEscapeSingleQuotes(rawBody)}'`);
  }

  return parts.join(" \\\n  ");
}

function showResultWithDebug(data, requestDebug) {
  const curl = buildCurlCommand(requestDebug);
  const payload =
    requestDebug && requestDebug.body !== undefined
      ? typeof requestDebug.body === "string"
        ? requestDebug.body
        : requestDebug.body
      : null;

  showResult({
    request: requestDebug
      ? {
          method: requestDebug.method || null,
          url: requestDebug.url || null,
          headers: toPlainHeaders(requestDebug.headers),
          payload
        }
      : null,
    curl,
    response: data
  });
}

function setBanner(type, message) {
  try {
    if (!message) {
      sessionStorage.removeItem(installBannerStorageKey);
    } else {
      sessionStorage.setItem(installBannerStorageKey, JSON.stringify({ type, message }));
    }
  } catch (_e) {
    // Ignore storage access errors (private mode, blocked storage, etc.)
  }

  if (!message) {
    installStatusBanner.className = "mb-6 hidden rounded-2xl border px-5 py-4 shadow-sm";
    installStatusBanner.innerHTML = "";
    return;
  }

  const palette =
    type === "success"
      ? "mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-900 shadow-sm"
      : "mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-rose-900 shadow-sm";

  installStatusBanner.className = palette;
  installStatusBanner.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "flex items-start justify-between gap-3";

  const messageEl = document.createElement("div");
  messageEl.className = "text-sm";
  messageEl.textContent = message;

  const dismissBtn = document.createElement("button");
  dismissBtn.type = "button";
  dismissBtn.setAttribute("data-banner-dismiss", "1");
  dismissBtn.className = "rounded-md border border-current/30 px-2 py-1 text-xs font-semibold hover:bg-black/5";
  dismissBtn.textContent = "Dismiss";

  wrapper.appendChild(messageEl);
  wrapper.appendChild(dismissBtn);
  installStatusBanner.appendChild(wrapper);
}

function restoreBanner() {
  try {
    const raw = sessionStorage.getItem(installBannerStorageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const type = parsed && parsed.type === "success" ? "success" : "error";
    const message = parsed && typeof parsed.message === "string" ? parsed.message : "";
    if (message) {
      setBanner(type, message);
    }
  } catch (_e) {
    // Ignore malformed/unavailable session storage.
  }
}

function setActiveTab(active) {
  if (!hasAdvancedTabs) {
    return;
  }

  try {
    sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, active);
  } catch (_e) {
    // ignore
  }

  const tabs = [
    { id: "config", btn: tabConfig, view: viewConfig },
    { id: "system", btn: tabSystem, view: viewSystem },
    { id: "status", btn: tabStatus, view: viewStatus },
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
let shopifyApp = null;
try {
  if (createApp && apiKey && host) {
    shopifyApp = createApp({ apiKey, host });
  }
} catch (_e) {
  shopifyApp = null;
}

const makeAuthenticatedFetch = resolveAuthenticatedFetch(AppBridgeGlobal);
const authenticatedFetch =
  shopifyApp && makeAuthenticatedFetch ? makeAuthenticatedFetch(shopifyApp) : null;

async function appFetch(input, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  // Backend routes use verifyShopifySessionToken (JWT in Authorization). Prefer explicit
  // getSessionToken + fetch: App Bridge authenticatedFetch often omits Bearer on same-origin POST.
  if (getSessionToken && shopifyApp) {
    const token = await getSessionToken(shopifyApp);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return fetch(input, { ...init, headers });
  }

  if (authenticatedFetch) {
    return authenticatedFetch(input, { ...init, headers });
  }

  return fetch(input, { ...init, headers });
}

async function fetchSystemStatus() {
  const requestDebug = {
    method: "GET",
    url: `${window.location.origin}/api/system/status`,
    headers: { Accept: "application/json" }
  };
  const response = await appFetch("/api/system/status", {
    method: "GET",
    headers: requestDebug.headers
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.message || "System status request failed");
  }

  return { status: data.status, requestDebug };
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

  const endpoint = `/api/compliance/requests?${params.toString()}`;
  const requestDebug = {
    method: "GET",
    url: `${window.location.origin}${endpoint}`,
    headers: { Accept: "application/json" }
  };
  const response = await appFetch(endpoint, { headers: requestDebug.headers });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.message || "Compliance list request failed");
  }
  return { records: data.records || [], requestDebug };
}

async function fetchComplianceDetail(id) {
  const endpoint = `/api/compliance/requests/${encodeURIComponent(id)}`;
  const requestDebug = {
    method: "GET",
    url: `${window.location.origin}${endpoint}`,
    headers: { Accept: "application/json" }
  };
  const response = await appFetch(endpoint, { headers: requestDebug.headers });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.message || "Compliance detail request failed");
  }
  return { record: data.record, requestDebug };
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

  const valueOf = (id) => {
    const el = document.getElementById(id);
    return el && "value" in el ? String(el.value).trim() : "";
  };

  const provider = valueOf("provider");
  const credentials = {
    apiKey: valueOf("apiKey"),
    apiSecret: valueOf("apiSecret") || undefined
  };

  if (provider === "swipe") {
    const swipeBase = valueOf("swipeApiBaseUrl");
    const swipeClientId = valueOf("swipeClientId");
    const swipeDeviceUser = valueOf("swipeDeviceUser");
    const swipePosRequestType = valueOf("swipePosRequestType");
    const swipePaymentMethod = valueOf("swipePaymentMethod");
    const swipePath = valueOf("swipeCreatePath");
    const swipeFeeAgentAmount = valueOf("swipeFeeAgentAmount");
    const swipeFeeDistributorAmount = valueOf("swipeFeeDistributorAmount");
    const swipeFeePromotorAmount = valueOf("swipeFeePromotorAmount");
    const swipeMinimumAmount = valueOf("swipeMinimumAmount");
    if (
      swipeBase ||
      swipePath ||
      swipeClientId ||
      swipeDeviceUser ||
      swipePosRequestType ||
      swipePaymentMethod ||
      swipeFeeAgentAmount ||
      swipeFeeDistributorAmount ||
      swipeFeePromotorAmount ||
      swipeMinimumAmount
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
      if (swipeMinimumAmount !== "") {
        credentials.extra.minimumAmount = swipeMinimumAmount;
      }
    }
  }

  const payload = {
    shop: valueOf("shop"),
    provider,
    redirectUrlAfterPaid: valueOf("redirectUrlAfterPaid"),
    webhookUrlAfterPaid: valueOf("webhookUrlAfterPaid") || undefined,
    credentials
  };

  try {
    const requestDebug = {
      method: "POST",
      url: `${window.location.origin}/api/config`,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: payload
    };
    const response = await appFetch("/api/config", {
      method: requestDebug.method,
      headers: requestDebug.headers,
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    showResultWithDebug(data, requestDebug);
  } catch (error) {
    showResult({ ok: false, message: error instanceof Error ? error.message : "Request error" });
  }
}

async function loadConfig() {
  const shop = lookupShopInput.value.trim();
  if (!shop) {
    showResult({ ok: false, message: "Please enter the shop domain first." });
    return;
  }

  try {
    const endpoint = `/api/config?shop=${encodeURIComponent(shop)}`;
    const requestDebug = {
      method: "GET",
      url: `${window.location.origin}${endpoint}`,
      headers: { Accept: "application/json" }
    };
    const response = await appFetch(endpoint, { headers: requestDebug.headers });
    const contentType = response.headers.get("content-type") || "";
    let data;
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const body = await response.text();
      const shortBody = body.replace(/\s+/g, " ").slice(0, 180);
      throw new Error(`Config endpoint returned non-JSON (${response.status}). ${shortBody || "Empty response"}`);
    }
    showResultWithDebug(data, requestDebug);
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
  const amount = Number.isFinite(amountRaw) && amountRaw >= 0 ? amountRaw : 125000;

  if (!shop) {
    showResult({ ok: false, message: "Please enter Shop Domain before creating checkout." });
    return;
  }

  try {
    const payload = {
      shop,
      provider,
      amount,
      currency,
      orderId
    };
    const requestDebug = {
      method: "POST",
      url: `${window.location.origin}/api/payments/checkout/create`,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: payload
    };
    const response = await appFetch("/api/payments/checkout/create", {
      method: requestDebug.method,
      headers: requestDebug.headers,
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    showResultWithDebug(data, requestDebug);

    if (data.ok && data.paymentUrl) {
      checkoutHintEl.textContent = "Checkout created. Opening payment page in a new tab...";
      window.open(data.paymentUrl, "_blank", "noopener,noreferrer");
    } else if (data.ok) {
      checkoutHintEl.textContent = "Payment request succeeded (without redirect URL).";
    }
  } catch (error) {
    showResult({ ok: false, message: error instanceof Error ? error.message : "Request error" });
  }
}

function getPersistedTabBeforeOAuthNavigate() {
  if (!hasAdvancedTabs || !viewSystem || !viewCompliance || !viewGoLive) {
    return "config";
  }
  if (!viewSystem.classList.contains("hidden")) {
    return "system";
  }
  if (!viewCompliance.classList.contains("hidden")) {
    return "compliance";
  }
  if (!viewGoLive.classList.contains("hidden")) {
    return "golive";
  }
  return "config";
}

function connectShopify() {
  const shop =
    oauthShopInput.value.trim() || document.getElementById("shop").value.trim() || lookupShopInput.value.trim();
  if (!shop) {
    showResult({ ok: false, message: "Please enter shop domain before Shopify OAuth install." });
    return;
  }
  try {
    sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, getPersistedTabBeforeOAuthNavigate());
  } catch (_e) {
    // ignore
  }
  const installUrl = `/auth/shopify?shop=${encodeURIComponent(shop)}`;
  try {
    if (window.top && window.top !== window.self) {
      window.top.location.href = installUrl;
      return;
    }
  } catch (_err) {}
  window.location.href = installUrl;
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
    setBanner("error", `Shopify install failed for ${shop || "this shop"}: ${error}`);
    showResult({ ok: false, shop, message: error });
    return;
  }

  if (installed !== "1" || !shop) {
    return;
  }

  try {
    const response = await fetch(`/auth/shopify/status?shop=${encodeURIComponent(shop)}`, {
      headers: { Accept: "application/json" }
    });
    const contentType = response.headers.get("content-type") || "";
    let data;
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const body = await response.text();
      const shortBody = body.replace(/\s+/g, " ").slice(0, 180);
      throw new Error(
        `Status endpoint returned non-JSON (${response.status}). ${shortBody || "Empty response"}`
      );
    }
    if (!response.ok || !data.ok) {
      throw new Error(data.message || "Install status check failed");
    }

    setBanner("success", `Shopify app installed and authenticated successfully for ${shop}.`);
    showResult(data);
  } catch (installError) {
    const message = installError instanceof Error ? installError.message : "Install status check failed";
    setBanner("error", `Install completed, but install status could not be read yet: ${message}`);
    showResult({ ok: false, shop, message });
  }
}

form.addEventListener("submit", saveConfig);
loadBtn.addEventListener("click", loadConfig);
createCheckoutBtn.addEventListener("click", createDemoCheckout);

async function swipeTestApiFromAdmin() {
  const shop = document.getElementById("shop").value.trim();
  const amountRaw = Number(document.getElementById("checkoutAmount").value);
  const amount = Number.isFinite(amountRaw) && amountRaw >= 0 ? amountRaw : 0;

  if (!shop) {
    showResult({ ok: false, message: "Please enter Shop Domain in the configuration form." });
    return;
  }

  try {
    const payload = { shop, amount };
    const requestDebug = {
      method: "POST",
      url: `${window.location.origin}/api/payments/swipe/test-request`,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: payload
    };
    const response = await appFetch("/api/payments/swipe/test-request", {
      method: requestDebug.method,
      headers: requestDebug.headers,
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    showResultWithDebug(data, requestDebug);
    if (checkoutHintEl) {
      checkoutHintEl.textContent =
        data.ok && data.swipe && data.swipe.httpOk
          ? "Swipe request OK. Check parsed/rawBody; paymentUrl is set when token and template are valid."
          : "Check response — httpOk false means Swipe rejected the request (compare with Postman and server IP).";
    }
  } catch (error) {
    showResult({ ok: false, message: error instanceof Error ? error.message : "Request error" });
  }
}

if (swipeTestApiBtn) {
  swipeTestApiBtn.addEventListener("click", swipeTestApiFromAdmin);
}

const refreshSwipeTxLogBtn = document.getElementById("refreshSwipeTxLogBtn");
const swipeTxLogLimit = document.getElementById("swipeTxLogLimit");
const swipeTxLogOutput = document.getElementById("swipeTxLogOutput");

if (refreshSwipeTxLogBtn && swipeTxLogOutput) {
  refreshSwipeTxLogBtn.addEventListener("click", async () => {
    swipeTxLogOutput.textContent = "Loading…";
    try {
      const limitRaw = swipeTxLogLimit ? Number(swipeTxLogLimit.value) : 100;
      const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.floor(limitRaw))) : 100;
      const response = await appFetch(`/api/payments/swipe/transaction-log?limit=${limit}`, {
        method: "GET",
        headers: { Accept: "application/json" }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        swipeTxLogOutput.textContent = JSON.stringify(
          { ok: false, httpStatus: response.status, ...data },
          null,
          2
        );
        return;
      }
      swipeTxLogOutput.textContent = JSON.stringify(data, null, 2);
    } catch (error) {
      swipeTxLogOutput.textContent = JSON.stringify(
        { ok: false, message: error instanceof Error ? error.message : String(error) },
        null,
        2
      );
    }
  });
}

connectShopifyBtn.addEventListener("click", connectShopify);
installStatusBanner.addEventListener("click", (event) => {
  const target = event.target && event.target.closest ? event.target.closest("[data-banner-dismiss]") : null;
  if (!target) return;
  setBanner("error", "");
});
restoreBanner();
hydrateInstallState();

if (hasAdvancedTabs) {
  tabConfig.addEventListener("click", () => setActiveTab("config"));

  tabSystem.addEventListener("click", async () => {
    setActiveTab("system");
    try {
      const { status, requestDebug } = await fetchSystemStatus();
      renderSystemStatus(status);
      renderGoLive(status);
      showResultWithDebug({ ok: true, status }, requestDebug);
    } catch (error) {
      showResult({ ok: false, message: error instanceof Error ? error.message : "System status failed" });
    }
  });

  tabStatus.addEventListener("click", () => {
    setActiveTab("status");
    const mainShop = document.getElementById("shop");
    if (mainShop && mainShop.value && invStatusShop && !invStatusShop.value.trim()) {
      invStatusShop.value = mainShop.value.trim();
    }
  });

  fetchInvStatusBtn.addEventListener("click", async () => {
    const secret = invStatusSecret.value.trim();
    const shop = invStatusShop.value.trim();
    const invoice = invStatusInvoice.value.trim();
    const limitRaw = Number(invStatusLimit.value);
    const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.floor(limitRaw))) : 50;
    const method = (invStatusMethod.value || "GET").toUpperCase() === "POST" ? "POST" : "GET";

    if (!secret) {
      invStatusOutput.textContent = JSON.stringify({ ok: false, message: "Isi Bearer secret (APP_SHARED_SECRET / INV_STATUS_API_SECRET)." }, null, 2);
      return;
    }
    if (!shop || !invoice) {
      invStatusOutput.textContent = JSON.stringify(
        { ok: false, message: "Isi shop (*.myshopify.com) dan invoice_number." },
        null,
        2
      );
      return;
    }

    invStatusOutput.textContent = "Loading…";
    const headers = { Accept: "application/json", Authorization: `Bearer ${secret}` };

    try {
      let response;
      if (method === "GET") {
        const url = new URL("/InvStatus", window.location.origin);
        url.searchParams.set("shop", shop);
        url.searchParams.set("invoice_number", invoice);
        url.searchParams.set("limit", String(limit));
        response = await fetch(url.toString(), { method: "GET", headers });
      } else {
        response = await fetch(`${window.location.origin}/InvStatus`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ shop, invoice_number: invoice, limit })
        });
      }

      const contentType = response.headers.get("content-type") || "";
      let body;
      if (contentType.includes("application/json")) {
        body = await response.json();
      } else {
        body = { ok: false, httpStatus: response.status, raw: (await response.text()).slice(0, 2000) };
      }
      invStatusOutput.textContent = JSON.stringify(
        { ok: response.ok, httpStatus: response.status, ...body },
        null,
        2
      );
    } catch (error) {
      invStatusOutput.textContent = JSON.stringify(
        { ok: false, message: error instanceof Error ? error.message : String(error) },
        null,
        2
      );
    }
  });

  tabCompliance.addEventListener("click", async () => {
    setActiveTab("compliance");
    try {
      const { records, requestDebug } = await fetchComplianceList();
      renderComplianceTable(records);
      showResultWithDebug({ ok: true, recordsCount: records.length, records }, requestDebug);
    } catch (error) {
      showResult({ ok: false, message: error instanceof Error ? error.message : "Compliance logs failed" });
    }
  });

  tabGoLive.addEventListener("click", async () => {
    setActiveTab("golive");
    try {
      const { status, requestDebug } = await fetchSystemStatus();
      renderSystemStatus(status);
      renderGoLive(status);
      showResultWithDebug({ ok: true, status }, requestDebug);
    } catch (error) {
      showResult({ ok: false, message: error instanceof Error ? error.message : "Go-live refresh failed" });
    }
  });

  refreshSystemBtn.addEventListener("click", async () => {
    try {
      const { status, requestDebug } = await fetchSystemStatus();
      renderSystemStatus(status);
      renderGoLive(status);
      showResultWithDebug({ ok: true, status }, requestDebug);
    } catch (error) {
      showResult({ ok: false, message: error instanceof Error ? error.message : "System refresh failed" });
    }
  });

  refreshComplianceBtn.addEventListener("click", async () => {
    try {
      const { records, requestDebug } = await fetchComplianceList();
      renderComplianceTable(records);
      showResultWithDebug({ ok: true, recordsCount: records.length, records }, requestDebug);
    } catch (error) {
      showResult({ ok: false, message: error instanceof Error ? error.message : "Compliance refresh failed" });
    }
  });

  refreshGoLiveBtn.addEventListener("click", async () => {
    try {
      const { status, requestDebug } = await fetchSystemStatus();
      renderGoLive(status);
      showResultWithDebug({ ok: true, status }, requestDebug);
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
      const { record, requestDebug } = await fetchComplianceDetail(id);
      showResultWithDebug({ ok: true, record }, requestDebug);
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

  let storedTab = null;
  try {
    storedTab = sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
  } catch (_e) {
    // ignore
  }
  const allowed = new Set(["config", "system", "status", "compliance", "golive"]);
  const fromQuery = new URLSearchParams(window.location.search).get("tab");
  const candidate = (fromQuery || storedTab || "config").toLowerCase();
  const initialTab = allowed.has(candidate) ? candidate : "config";

  if (initialTab === "system") {
    tabSystem.click();
  } else if (initialTab === "status") {
    tabStatus.click();
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

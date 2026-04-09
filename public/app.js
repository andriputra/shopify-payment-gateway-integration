const form = document.getElementById("configForm");
const resultEl = document.getElementById("result");
const loadBtn = document.getElementById("loadConfigBtn");
const lookupShopInput = document.getElementById("lookupShop");

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

form.addEventListener("submit", saveConfig);
loadBtn.addEventListener("click", loadConfig);

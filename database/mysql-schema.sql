CREATE TABLE IF NOT EXISTS store_configs (
  shop VARCHAR(255) PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  redirect_url_after_paid TEXT NOT NULL,
  webhook_url_after_paid TEXT NULL,
  api_key TEXT NOT NULL,
  api_secret TEXT NULL,
  credentials_extra_json LONGTEXT NULL,
  updated_at VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS shopify_tokens (
  shop VARCHAR(255) PRIMARY KEY,
  access_token TEXT NOT NULL,
  scope TEXT NULL,
  installed_at VARCHAR(64) NOT NULL,
  updated_at VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_session_contexts (
  order_reference VARCHAR(255) PRIMARY KEY,
  shop VARCHAR(255) NOT NULL,
  payment_session_id VARCHAR(255) NOT NULL,
  created_at VARCHAR(64) NOT NULL,
  INDEX idx_payment_session_shop (shop)
);

CREATE TABLE IF NOT EXISTS compliance_requests (
  id VARCHAR(64) PRIMARY KEY,
  topic VARCHAR(64) NOT NULL,
  shop VARCHAR(255) NOT NULL,
  customer_reference VARCHAR(64) NULL,
  shop_id VARCHAR(64) NULL,
  payload_json LONGTEXT NOT NULL,
  outcome_json LONGTEXT NOT NULL,
  triggered_at VARCHAR(64) NOT NULL,
  INDEX idx_compliance_shop (shop),
  INDEX idx_compliance_topic (topic)
);

CREATE TABLE IF NOT EXISTS payment_redirects (
  shop VARCHAR(255) NOT NULL,
  order_reference VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  payment_url LONGTEXT NOT NULL,
  provider_reference TEXT NOT NULL,
  shopify_order_id TEXT NULL,
  amount BIGINT NOT NULL,
  currency VARCHAR(8) NOT NULL,
  status VARCHAR(16) NOT NULL,
  created_at VARCHAR(64) NOT NULL,
  updated_at VARCHAR(64) NOT NULL,
  swipe_response_code VARCHAR(32) NULL,
  swipe_response_message TEXT NULL,
  last_swipe_status_raw VARCHAR(255) NULL,
  PRIMARY KEY (shop, order_reference),
  INDEX idx_payment_redirect_shop (shop),
  INDEX idx_payment_redirect_status (status)
);

CREATE TABLE IF NOT EXISTS swipe_response_codes (
  code VARCHAR(16) PRIMARY KEY,
  message TEXT NOT NULL
);

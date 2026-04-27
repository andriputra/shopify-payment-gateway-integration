# Project Overview
- Nama: Shopify Payment Gateway Integration
- Stack: Node.js, TypeScript, Shopify API
- Tujuan: Inject custom payment ke checkout untuk saat ini fokus ke swipe.co.id nya

# Struktur Penting
- /src/api -> endpoint backend
- /src/services -> business logic
- /src/utils -> helper

# Flow Utama
1. User checkout
2. Shopify call payment session API
3. App proses request
4. Return response ke Shopify

# Catatan
- Pakai webhook
- Auth via Shopify token
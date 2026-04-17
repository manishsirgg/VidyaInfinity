# GitHub Conflict Resolution (PR #2)

Use this exact sequence in GitHub conflict editor.

## 1) `README.md`

### Conflict block 1 (schema notes)
- **Choose:** `Accept current change`
- **Reason:** current block already contains the merged `Payment / Order / Commission Schema Notes` section.

### Conflict block 2 (security notes tail)
- **Choose:** `Accept both changes`
- Then keep this final line exactly once:
  - `- Migration includes baseline RLS policies for admin/student isolation.`

---

## 2) `app/api/payments/course/create-order/route.ts`

### Conflict block 1 (import)
- **Choose:** `Accept current change`
- Keep:
  - `import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";`

### Conflict block 2 (top of POST handler)
- **Choose:** `Accept current change`
- Keep:
  ```ts
  const schemaErrorResponse = await getPaymentSchemaErrorResponse();
  if (schemaErrorResponse) return schemaErrorResponse;
  ```

---

## 3) `app/api/payments/course/verify/route.ts`

### Conflict block 1 (import)
- **Choose:** `Accept current change`
- Keep helper import from `ensure-payment-schema`.

### Conflict block 2 (top of POST handler)
- **Choose:** `Accept current change`
- Keep the two-line `schemaErrorResponse` preflight.

---

## 4) `app/api/payments/test/create-order/route.ts`

### Conflict block 1 (import)
- **Choose:** `Accept current change`
- Keep helper import from `ensure-payment-schema`.

### Conflict block 2 (top of POST handler)
- **Choose:** `Accept current change`
- Keep the two-line `schemaErrorResponse` preflight.

---

## 5) `app/api/payments/test/verify/route.ts`

### Conflict block 1 (import)
- **Choose:** `Accept current change`
- Keep helper import from `ensure-payment-schema`.

### Conflict block 2 (top of POST handler)
- **Choose:** `Accept current change`
- Keep the two-line `schemaErrorResponse` preflight.

---

## Final sanity checks after resolving in GitHub

1. Remove any leftover markers: `<<<<<<<`, `=======`, `>>>>>>>`.
2. Run:

```bash
npm run check:conflicts
```

Expected output:

- `no-conflict-markers`

import type { NormalizedPRPayload } from './types'

// Realistic mock PR payload for local development and testing.
// Covers: maintainability issue, naming drift, exposure risk, test gap.
export const MOCK_PR_PAYLOAD: NormalizedPRPayload = {
  prUrl: 'https://github.com/acme/shop/pull/42',
  repo: 'acme/shop',
  number: 42,
  title: 'feat: checkout flow refactor + auth route cleanup',
  author: 'dev-alice',
  headRef: 'feature/checkout-v2',
  baseRef: 'main',
  checksStatus: 'warn',
  reviewerAssigned: false,
  updatedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(), // 9 days ago
  files: [
    {
      path: 'src/checkout/checkoutFlow.ts',
      status: 'modified',
      additions: 87,
      deletions: 12,
      patch: `@@ -1,12 +1,87 @@
-import { validateCart } from './cartValidator'
-import { submitOrder } from '../api/orders'
+import { validateCart } from './cartValidator'
+import { submitOrder } from '../api/orders'
+import { sendConfirmationEmail } from '../email/mailer'
+import { trackEvent } from '../analytics/tracker'
+import { updateInventory } from '../inventory/stock'
+import { applyLoyaltyPoints } from '../loyalty/points'
+
+// TODO: split this into smaller functions before release
+export async function processCheckout(cartId: string, userId: string, paymentData: any) {
+  // validate cart
+  const cart = await validateCart(cartId)
+  if (!cart) throw new Error('Cart not found')
+  if (cart.items.length === 0) throw new Error('Cart is empty')
+  if (cart.items.some((i: any) => !i.inStock)) throw new Error('Some items out of stock')
+
+  // apply discounts
+  let total = cart.items.reduce((sum: number, i: any) => sum + i.price * i.qty, 0)
+  if (cart.coupon) {
+    if (cart.coupon.type === 'pct') {
+      total = total * (1 - cart.coupon.value / 100)
+    } else if (cart.coupon.type === 'fixed') {
+      total = total - cart.coupon.value
+    } else if (cart.coupon.type === 'bogo') {
+      if (cart.items.length >= 2) {
+        const sorted = [...cart.items].sort((a: any, b: any) => a.price - b.price)
+        total = total - sorted[0].price
+      }
+    }
+  }
+
+  // process payment
+  const paymentResult = await fetch('/internal/payments/charge', {
+    method: 'POST',
+    body: JSON.stringify({ amount: total, card: paymentData.card, cvv: paymentData.cvv }),
+  })
+  const charge = await paymentResult.json()
+  if (!charge.success) throw new Error('Payment failed: ' + charge.error)
+
+  // create order
+  const order = await submitOrder({ cartId, userId, total, chargeId: charge.id })
+
+  // update inventory
+  await updateInventory(cart.items)
+
+  // loyalty points
+  const pts = Math.floor(total / 10)
+  await applyLoyaltyPoints(userId, pts)
+
+  // send email
+  await sendConfirmationEmail(userId, order.id)
+  console.log('Order placed:', order.id, 'user:', userId, 'amount:', total)
+
+  // analytics
+  await trackEvent('checkout_complete', { userId, orderId: order.id, total, pts })
+
+  return { orderId: order.id, total, loyaltyPoints: pts }
+}
+
+// FIXME: remove before prod — hardcoded test user bypass
+export async function processCheckoutBypass(cartId: string) {
+  return processCheckout(cartId, 'test-user-001', { card: '4111111111111111', cvv: '123' })
+}`,
    },
    {
      path: 'src/auth/routes.ts',
      status: 'modified',
      additions: 22,
      deletions: 5,
      patch: `@@ -1,10 +1,27 @@
 import { Router } from 'express'
-import { requireAuth } from '../middleware/auth'
 import { loginHandler } from './handlers'
+import { adminHandler } from './adminHandler'
+import { internalDebugHandler } from './debugHandler'

 const router = Router()

-router.post('/login', requireAuth, loginHandler)
+// Public login — removed auth middleware for guest checkout support
+router.post('/login', loginHandler)
+router.post('/admin/login', adminHandler)
+router.get('/internal/admin/users', adminHandler)
+router.get('/internal/debug/session', internalDebugHandler)
+
+// Temporary: expose debug info for QA team
+const ADMIN_SECRET = 'sup3r-s3cr3t-admin-k3y-2024'
+
+router.get('/debug/token', (req, res) => {
+  res.json({ token: ADMIN_SECRET, env: process.env.NODE_ENV })
+})
+
 export default router`,
    },
    {
      path: 'src/services/customerService.ts',
      status: 'modified',
      additions: 34,
      deletions: 8,
      patch: `@@ -1,8 +1,42 @@
-import { Customer } from '../models/customer'
+import { Customer } from '../models/customer'
+import { Client } from '../models/client'

-export async function getCustomer(id: string): Promise<Customer> {
-  return db.customers.findById(id)
+// Returns customer data — note: some fields use "client" from legacy model
+export async function getCustomer(id: string): Promise<Customer> {
+  const c = await db.customers.findById(id)
+  return c
+}
+
+export async function fetchClient(clientId: string): Promise<Client> {
+  const client = await db.clients.findById(clientId)
+  return client
+}
+
+// Merge customer and client records into account user
+export async function resolveAccountUser(id: string) {
+  const customer = await getCustomer(id)
+  const client = await fetchClient(id)
+
+  // accountUser is the unified representation
+  const accountUser = {
+    id: customer.id,
+    name: client.name || customer.displayName,
+    email: customer.email || client.contactEmail,
+    tier: customer.loyaltyTier,
+    legacy: client.legacyCode,
+  }
+
+  return accountUser
+}
+
+export async function updateAcctUsr(acctUsr: any, data: any) {
+  // FIXME: validate data before saving
+  return db.customers.update(acctUsr.id, data)
 }`,
    },
    {
      path: 'src/api/orderController.ts',
      status: 'modified',
      additions: 41,
      deletions: 3,
      patch: `@@ -1,5 +1,43 @@
+import { validateOrderInput } from '../validation/orderValidation'
+import { processRefund } from '../payments/refunds'
+import { sendRefundEmail } from '../email/mailer'
+
 export async function createOrder(req: any, res: any) {
-  res.json({ status: 'ok' })
+  const { cartId, userId, paymentData } = req.body
+  if (!cartId || !userId) return res.status(400).json({ error: 'Missing fields' })
+
+  const valid = validateOrderInput(req.body)
+  if (!valid.ok) return res.status(422).json({ errors: valid.errors })
+
+  try {
+    const result = await processCheckout(cartId, userId, paymentData)
+    res.json(result)
+  } catch (err: any) {
+    res.status(500).json({ error: err.message })
+  }
+}
+
+export async function refundOrder(req: any, res: any) {
+  const { orderId, reason, amount } = req.body
+  if (!orderId) return res.status(400).json({ error: 'orderId required' })
+
+  const refund = await processRefund(orderId, amount, reason)
+
+  // Send email notification
+  await sendRefundEmail(refund.userId, refund)
+  console.log('Refund processed', refund.id, 'for user', refund.userId, 'amount', refund.amount)
+
+  res.json({ refundId: refund.id, status: refund.status })
 }`,
    },
    {
      path: 'src/checkout/__tests__/cartValidator.test.ts',
      status: 'modified',
      additions: 4,
      deletions: 0,
      patch: `@@ -10,3 +10,7 @@
 it('should reject empty cart', () => {
   expect(validateCart({ items: [] })).toBeFalsy()
 })
+
+it('should accept valid cart', () => {
+  expect(validateCart({ items: [{ id: '1', price: 10, qty: 1, inStock: true }] })).toBeTruthy()
+})`,
    },
  ],
}

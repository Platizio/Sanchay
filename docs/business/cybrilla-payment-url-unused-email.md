# Email to Cybrilla: unpaid ONDC purchases (`fp_payment_url_unused`)

Owner decision 10 (2026-10-06). The PO sends this from the registered business mailbox and saves the reply in
`docs/probes/` (G-B6). Evidence: probe P-07 (`docs/probes/P-07-allotted-units.md`, addendum 2026-10-05).

---

**Subject:** Written confirmation needed: ONDC purchases failed with `fp_payment_url_unused`

Hello Cybrilla team,

In the FP sandbox we placed three ONDC lumpsum purchases on 2026-10-01 (custom checkout: consent, payment,
then confirm). We marked each payment as successful with the payment simulator, but did not open the payment
link. All three stayed `submitted` and then failed at 23:00:07 IST the same day with
`failure_code: fp_payment_url_unused`.

Our app will treat such an order as failed and final, with no refund, and tell the investor "Payment not
completed. This order is closed and no money was taken." Before real money goes live on Fri 27 Nov, we need
your written answers to four questions:

1. Can money be debited from the investor, or collected by the payment aggregator, on a purchase that FP fails
   with `fp_payment_url_unused`? Please confirm in writing that it cannot, in production as well as in the
   sandbox.
2. If an investor does pay after the order has failed this way, what happens to the money, and which FP object
   or webhook tells us about the refund?
3. Is the 23:00 IST failure an end-of-day sweep? Does production behave the same, for both UPI and netbanking?
4. In the sandbox, what counts as "using" the payment URL, and how can a sandbox ONDC purchase reach
   `successful`, so that we can test allotment end to end? The order simulator refuses ONDC orders.

FP order references (sandbox): `mfp_15f04bc8e8d247b5a3f36f5d1fd2df7b`, `mfp_dc4390a8fe8d4da9b31f9245d1fe48ff`
and `mfp_b3459ab076874694956ad6b7d587a6f4`.

Thank you,
<your name>
Sanchay

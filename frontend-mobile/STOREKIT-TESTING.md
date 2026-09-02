# Testing purchases locally

The two subscriptions are defined in `BlindGuide.storekit`. With it attached to
the run scheme, StoreKit serves those products from the simulator — purchases,
renewals, cancellations and failures all work with **no paid Apple Developer
account and no App Store Connect setup**. Renewals are accelerated (a month
passes in seconds), which is the only practical way to test a yearly plan.

Prices here must stay in step with App Store Connect and with the web app:
**$8.99/month, $49.99/year**.

## Attaching it

The file lives in the project root, not in `ios/`, because `npx expo prebuild`
regenerates `ios/` and would delete it.

The scheme reference itself DOES live in `ios/` and is therefore wiped by
prebuild. After any prebuild, re-attach it:

1. `open ios/BlindGuide.xcworkspace`
2. Product → Scheme → Edit Scheme → Run → Options
3. StoreKit Configuration → `BlindGuide.storekit`

To drive it from the command line instead, pass the file to xcodebuild:

    -storeKitConfigurationPath ../BlindGuide.storekit

## What this does and does not prove

Proves: the product list loads, the purchase sheet appears, the transaction
listener fires, the app sends the signed transaction to the backend, and the
restore flow works.

Does NOT prove: that Apple's real servers accept anything. Local StoreKit signs
transactions with a **local test certificate**, so the backend must be told to
accept test-signed receipts in development and to reject them in production.
End-to-end verification needs a Sandbox Apple ID, which needs the paid account
and completed Paid Apps agreement.

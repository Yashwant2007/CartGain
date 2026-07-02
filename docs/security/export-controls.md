# Export Controls Policy

RecoveryFlow does not provide self-serve CSV exports of merchant analytics or campaign data by default.

## Controls
- Analytics export buttons are removed from the dashboard UI.
- Campaign analytics export is removed from the campaign details UI.
- Any data export request must be handled as an approved operational request.
- Export requests are reviewed before data is released.
- Export activity is logged and treated as sensitive data access.

## Why this is in place
- It reduces the chance of accidental or unauthorized bulk disclosure.
- It keeps merchant data inside audited operational workflows.
- It gives us a clear approval trail for Shopify review.

## Evidence to retain
- Screenshot or build output showing export buttons are not present in the UI.
- Sample `DataAccessLog` entry for approved export handling.
- Copy of the approval workflow used for one-off customer requests.

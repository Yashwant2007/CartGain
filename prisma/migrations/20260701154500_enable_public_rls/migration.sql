-- Enable row level security on exposed public tables.
-- This keeps the Prisma-owned server path working while locking down the Supabase API surface.

alter table if exists "User" enable row level security;
alter table if exists "Account" enable row level security;
alter table if exists "Session" enable row level security;
alter table if exists "VerificationToken" enable row level security;
alter table if exists "DataAccessLog" enable row level security;
alter table if exists "Store" enable row level security;
alter table if exists "Campaign" enable row level security;
alter table if exists "Cart" enable row level security;
alter table if exists "Message" enable row level security;
alter table if exists "RecoveredCart" enable row level security;
alter table if exists "Analytics" enable row level security;
alter table if exists "ABTest" enable row level security;
alter table if exists "Subscription" enable row level security;
alter table if exists "Invoice" enable row level security;
alter table if exists "RevenueShareEvent" enable row level security;
alter table if exists "ApiKey" enable row level security;
alter table if exists "OptOut" enable row level security;

-- No permissive policies are created here yet.
-- That is intentional: the exposed API surface remains closed until a staged policy review is completed.

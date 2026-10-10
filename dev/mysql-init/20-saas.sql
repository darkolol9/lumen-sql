SET NAMES utf8mb4;
-- SaaS analytics sample: plans, 400 accounts, ~4k users, subscriptions, invoices, 150k product events.
USE saas;
SET SESSION cte_max_recursion_depth = 1000000;

CREATE TABLE seq (n INT PRIMARY KEY);
INSERT INTO seq WITH RECURSIVE s AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM s WHERE n < 150000) SELECT n FROM s;

CREATE TABLE plans (
  id INT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(40) NOT NULL,
  monthly_price DECIMAL(8, 2) NOT NULL,
  seat_limit INT NULL
);
INSERT INTO plans VALUES
  (1, 'free', 'Free', 0, 3),
  (2, 'starter', 'Starter', 29, 10),
  (3, 'growth', 'Growth', 99, 50),
  (4, 'business', 'Business', 299, 250),
  (5, 'enterprise', 'Enterprise', 1499, NULL);

CREATE TABLE accounts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  industry VARCHAR(40) NOT NULL,
  region ENUM('NA', 'EMEA', 'APAC', 'LATAM') NOT NULL,
  employees INT NOT NULL,
  created_at DATETIME NOT NULL
) COMMENT = 'Customer companies (tenants)';

INSERT INTO accounts (name, industry, region, employees, created_at)
SELECT
  CONCAT(ELT(1 + n % 12, 'Blue', 'Red', 'Iron', 'Silver', 'North', 'Bright', 'Quantum', 'Lunar', 'Cedar', 'Nova', 'Pixel', 'Swift'),
         ELT(1 + FLOOR(n / 12) % 10, 'labs', 'works', 'soft', 'ly', 'stack', 'hub', 'forge', 'wave', 'mint', 'grid'),
         IF(n > 120, CONCAT(' ', n), '')),
  ELT(1 + n % 8, 'Fintech', 'Healthcare', 'Retail', 'Media', 'Logistics', 'Education', 'Gaming', 'Manufacturing'),
  ELT(1 + FLOOR(RAND(n) * 10), 'NA', 'NA', 'NA', 'NA', 'EMEA', 'EMEA', 'EMEA', 'APAC', 'APAC', 'LATAM'),
  FLOOR(5 + POW(RAND(n * 3), 3) * 5000),
  '2023-03-01' + INTERVAL FLOOR(RAND(n * 5) * 560) DAY
FROM seq WHERE n <= 400;

CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  account_id INT NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  role ENUM('owner', 'admin', 'member', 'viewer') NOT NULL,
  last_seen_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  KEY idx_users_account (account_id)
);

INSERT INTO users (account_id, email, role, last_seen_at, created_at)
SELECT
  a.id,
  CONCAT('u', a.id, '_', k.n, '@', LOWER(REPLACE(a.name, ' ', '')), '.com'),
  IF(k.n = 1, 'owner', ELT(1 + FLOOR(RAND(a.id * 100 + k.n) * 6), 'admin', 'member', 'member', 'member', 'viewer', 'viewer')),
  IF(RAND(a.id * 7 + k.n) < 0.85, '2025-09-01' + INTERVAL FLOOR(RAND(a.id + k.n * 3) * 39) DAY, NULL),
  a.created_at + INTERVAL FLOOR(RAND(a.id * 11 + k.n) * 120) DAY
FROM accounts a
JOIN seq k ON k.n <= 1 + LEAST(40, FLOOR(a.employees / 60) + a.id % 7);

CREATE TABLE subscriptions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  account_id INT NOT NULL,
  plan_id INT NOT NULL,
  seats INT NOT NULL,
  status ENUM('trialing', 'active', 'past_due', 'cancelled') NOT NULL,
  started_at DATE NOT NULL,
  cancelled_at DATE NULL,
  KEY idx_subs_account (account_id)
);

INSERT INTO subscriptions (account_id, plan_id, seats, status, started_at, cancelled_at)
SELECT
  id,
  LEAST(5, 1 + FLOOR(POW(RAND(id), 0.8) * 4) + IF(employees > 2000, 1, 0)),
  GREATEST(1, FLOOR(employees / (10 + id % 20))),
  ELT(1 + FLOOR(RAND(id * 3) * 10), 'active', 'active', 'active', 'active', 'active', 'active', 'trialing', 'past_due', 'cancelled', 'cancelled'),
  DATE(created_at),
  NULL
FROM accounts;
UPDATE subscriptions SET cancelled_at = started_at + INTERVAL (60 + id % 300) DAY WHERE status = 'cancelled';

CREATE TABLE invoices (
  id INT PRIMARY KEY AUTO_INCREMENT,
  account_id INT NOT NULL,
  period_start DATE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  paid TINYINT(1) NOT NULL,
  KEY idx_invoices_account (account_id)
);

-- one invoice per month of each paid subscription's life
INSERT INTO invoices (account_id, period_start, amount, paid)
SELECT s.account_id,
       DATE_FORMAT(s.started_at + INTERVAL m.n - 1 MONTH, '%Y-%m-01'),
       p.monthly_price * IF(p.seat_limit IS NULL, 1, GREATEST(1, CEIL(s.seats / 10))),
       NOT (s.status = 'past_due' AND m.n > 1 AND s.started_at + INTERVAL m.n MONTH > '2025-08-01')
FROM subscriptions s
JOIN plans p ON p.id = s.plan_id AND p.monthly_price > 0
JOIN seq m ON m.n <= 30
WHERE s.started_at + INTERVAL m.n - 1 MONTH <= LEAST(COALESCE(s.cancelled_at, '2025-10-01'), '2025-10-01');

CREATE TABLE events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  account_id INT NOT NULL,
  name VARCHAR(40) NOT NULL,
  properties JSON NULL,
  occurred_at DATETIME(3) NOT NULL,
  KEY idx_events_time (occurred_at),
  KEY idx_events_account (account_id, occurred_at)
) COMMENT = 'Raw product analytics events';

-- pick users first (RAND in a join condition can't use the primary key)
SET @max_user = (SELECT MAX(id) FROM users);
CREATE TEMPORARY TABLE event_picks (n INT PRIMARY KEY, user_id INT NOT NULL);
INSERT INTO event_picks SELECT n, 1 + FLOOR(POW(RAND(n * 5), 1.4) * @max_user) FROM seq WHERE n <= 150000;

INSERT INTO events (user_id, account_id, name, properties, occurred_at)
SELECT u.id, u.account_id,
  ELT(1 + FLOOR(RAND(e.n) * 12), 'page_view', 'page_view', 'page_view', 'page_view', 'dashboard_open', 'dashboard_open',
      'report_run', 'report_run', 'export_csv', 'invite_sent', 'integration_added', 'billing_viewed'),
  JSON_OBJECT('device', ELT(1 + e.n % 3, 'desktop', 'mobile', 'tablet'),
              'browser', ELT(1 + e.n % 4, 'chrome', 'safari', 'firefox', 'edge'),
              'duration_ms', FLOOR(RAND(e.n * 3) * 8000)),
  '2025-07-01' + INTERVAL FLOOR(RAND(e.n * 7) * 100 * 86400) SECOND
FROM event_picks e
JOIN users u ON u.id = e.user_id
ORDER BY e.n;

CREATE VIEW mrr_by_plan AS
SELECT p.name AS plan, COUNT(*) AS active_accounts, SUM(p.monthly_price * IF(p.seat_limit IS NULL, 1, GREATEST(1, CEIL(s.seats / 10)))) AS mrr
FROM subscriptions s JOIN plans p ON p.id = s.plan_id
WHERE s.status IN ('active', 'past_due')
GROUP BY p.name;

DROP TABLE seq;

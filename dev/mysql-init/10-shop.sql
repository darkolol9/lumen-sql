SET NAMES utf8mb4;
-- E-commerce sample: ~2k customers, 200 products, 20k orders, ~60k line items, reviews.
USE shop;
SET SESSION cte_max_recursion_depth = 1000000;

CREATE TABLE seq (n INT PRIMARY KEY);
INSERT INTO seq WITH RECURSIVE s AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM s WHERE n < 100000) SELECT n FROM s;

CREATE TABLE categories (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(60) NOT NULL,
  parent_id INT NULL
) COMMENT = 'Product category tree';

INSERT INTO categories (name, parent_id) VALUES
  ('Electronics', NULL), ('Home & Kitchen', NULL), ('Outdoors', NULL), ('Books', NULL), ('Apparel', NULL),
  ('Headphones', 1), ('Laptops', 1), ('Smart Home', 1), ('Cookware', 2), ('Furniture', 2),
  ('Camping', 3), ('Cycling', 3), ('Fiction', 4), ('Technical', 4), ('Footwear', 5), ('Outerwear', 5);

CREATE TABLE products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  sku VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  category_id INT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  cost DECIMAL(10, 2) NOT NULL,
  stock INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  KEY idx_products_category (category_id)
) COMMENT = 'Catalog of sellable products';

INSERT INTO products (sku, name, category_id, price, cost, stock, is_active, created_at)
SELECT
  CONCAT('SKU-', LPAD(n, 5, '0')),
  CONCAT(ELT(1 + n % 8, 'Pro', 'Lite', 'Ultra', 'Classic', 'Eco', 'Max', 'Mini', 'Prime'), ' ',
         ELT(1 + n % 11, 'Aurora', 'Nimbus', 'Vertex', 'Summit', 'Harbor', 'Pulse', 'Drift', 'Ember', 'Atlas', 'Quill', 'Orbit'), ' ',
         ELT(1 + n % 6, 'X1', '200', 'Air', 'S', 'One', 'Plus')),
  6 + n % 11,
  ROUND(9.99 + RAND(n) * 490, 2),
  0,
  FLOOR(RAND(n * 7) * 500),
  IF(n % 17 = 0, 0, 1),
  '2023-01-01' + INTERVAL FLOOR(RAND(n * 3) * 600) DAY
FROM seq WHERE n <= 200;
UPDATE products SET cost = ROUND(price * (0.35 + RAND(id) * 0.3), 2);

CREATE TABLE customers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  first_name VARCHAR(40) NOT NULL,
  last_name VARCHAR(40) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  country CHAR(2) NOT NULL,
  city VARCHAR(60) NOT NULL,
  segment ENUM('consumer', 'business', 'vip') NOT NULL,
  marketing_opt_in TINYINT(1) NOT NULL,
  signed_up_at DATETIME NOT NULL,
  KEY idx_customers_country (country)
) COMMENT = 'Registered customers';

INSERT INTO customers (first_name, last_name, email, country, city, segment, marketing_opt_in, signed_up_at)
SELECT
  ELT(1 + n % 20, 'Ada', 'Linus', 'Grace', 'Alan', 'Margaret', 'Dennis', 'Barbara', 'Ken', 'Frances', 'Guido',
      'Radia', 'Tim', 'Hedy', 'John', 'Katherine', 'Bjarne', 'Sophie', 'Yukihiro', 'Anita', 'James'),
  ELT(1 + FLOOR(n / 20) % 15, 'Smith', 'Garcia', 'Müller', 'Rossi', 'Kim', 'Nguyen', 'Silva', 'Novak', 'Hansen', 'Okafor',
      'Tanaka', 'Dubois', 'Kowalski', 'Haddad', 'Larsen'),
  CONCAT('user', n, '@', ELT(1 + n % 5, 'example.com', 'mail.io', 'corp.dev', 'inbox.net', 'acme.org')),
  ELT(1 + FLOOR(RAND(n) * 8), 'US', 'US', 'US', 'GB', 'DE', 'FR', 'CA', 'AU'),
  ELT(1 + n % 10, 'Springfield', 'Riverside', 'Fairview', 'Greenville', 'Madison', 'Georgetown', 'Clinton', 'Salem', 'Oxford', 'Arlington'),
  ELT(1 + IF(RAND(n * 5) < 0.75, 0, IF(RAND(n * 11) < 0.7, 1, 2)), 'consumer', 'business', 'vip'),
  RAND(n * 13) < 0.6,
  '2023-01-01' + INTERVAL FLOOR(RAND(n * 17) * 640) DAY + INTERVAL FLOOR(RAND(n * 19) * 86400) SECOND
FROM seq WHERE n <= 2000;

CREATE TABLE orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT NOT NULL,
  status ENUM('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded') NOT NULL,
  channel ENUM('web', 'mobile', 'marketplace') NOT NULL,
  coupon_code VARCHAR(20) NULL,
  ordered_at DATETIME NOT NULL,
  shipped_at DATETIME NULL,
  total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  KEY idx_orders_customer (customer_id),
  KEY idx_orders_ordered_at (ordered_at)
) COMMENT = 'Customer orders; total is the sum of order_items';

INSERT INTO orders (customer_id, status, channel, coupon_code, ordered_at)
SELECT
  1 + FLOOR(POW(RAND(n), 1.6) * 2000),
  ELT(1 + FLOOR(RAND(n * 3) * 20), 'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered',
      'delivered', 'delivered', 'shipped', 'shipped', 'shipped', 'paid', 'paid', 'pending', 'cancelled', 'cancelled', 'refunded',
      'delivered', 'delivered'),
  ELT(1 + FLOOR(RAND(n * 5) * 3), 'web', 'mobile', 'marketplace'),
  IF(RAND(n * 7) < 0.15, ELT(1 + n % 4, 'WELCOME10', 'SPRING20', 'VIP15', 'FREESHIP'), NULL),
  -- growth over time: later dates are more likely
  '2024-01-01' + INTERVAL FLOOR(SQRT(RAND(n * 9)) * 650) DAY + INTERVAL FLOOR(RAND(n * 13) * 86400) SECOND
FROM seq WHERE n <= 20000;
UPDATE orders SET shipped_at = ordered_at + INTERVAL (1 + id % 4) DAY WHERE status IN ('shipped', 'delivered', 'refunded');

CREATE TABLE order_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  discount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  KEY idx_items_order (order_id),
  KEY idx_items_product (product_id)
);

CREATE TEMPORARY TABLE item_picks (order_id INT, k INT, product_id INT, PRIMARY KEY (order_id, k));
INSERT INTO item_picks
SELECT o.id, k.n, 1 + FLOOR(POW(RAND(o.id * 17 + k.n), 2) * 200)
FROM orders o JOIN seq k ON k.n <= 1 + o.id % 5;

INSERT INTO order_items (order_id, product_id, quantity, unit_price, discount)
SELECT o.id, p.id, 1 + FLOOR(RAND(o.id * 31 + i.k) * 3), p.price,
       IF(o.coupon_code IS NULL, 0, ROUND(p.price * 0.1, 2))
FROM item_picks i
JOIN orders o ON o.id = i.order_id
JOIN products p ON p.id = i.product_id
ORDER BY i.order_id, i.k;

UPDATE orders o
JOIN (SELECT order_id, SUM(quantity * (unit_price - discount)) AS t FROM order_items GROUP BY order_id) x ON x.order_id = o.id
SET o.total = x.t;

CREATE TABLE reviews (
  id INT PRIMARY KEY AUTO_INCREMENT,
  product_id INT NOT NULL,
  customer_id INT NOT NULL,
  rating TINYINT NOT NULL,
  title VARCHAR(120) NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL,
  KEY idx_reviews_product (product_id)
);

INSERT INTO reviews (product_id, customer_id, rating, title, metadata, created_at)
SELECT
  1 + FLOOR(RAND(n) * 200),
  1 + FLOOR(RAND(n * 3) * 2000),
  ELT(1 + FLOOR(RAND(n * 5) * 10), 5, 5, 5, 4, 4, 4, 3, 2, 1, 5),
  ELT(1 + n % 6, 'Love it', 'Does the job', 'Not as described', 'Great value', 'Would buy again', 'Meh'),
  IF(n % 3 = 0, NULL, JSON_OBJECT('pros', ELT(1 + n % 3, 'battery', 'build quality', 'price'), 'verified', n % 2 = 0)),
  '2024-01-15' + INTERVAL FLOOR(RAND(n * 7) * 620) DAY
FROM seq WHERE n <= 5000;

CREATE VIEW daily_revenue AS
SELECT DATE(ordered_at) AS day, COUNT(*) AS orders, SUM(total) AS revenue, ROUND(AVG(total), 2) AS avg_order_value
FROM orders
WHERE status NOT IN ('cancelled', 'refunded')
GROUP BY DATE(ordered_at);

DROP TABLE seq;

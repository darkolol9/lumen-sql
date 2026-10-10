SET NAMES utf8mb4;
-- HR sample: departments, 600 employees with a manager hierarchy, salary history, projects & assignments.
USE hr;
SET SESSION cte_max_recursion_depth = 100000;

CREATE TABLE seq (n INT PRIMARY KEY);
INSERT INTO seq WITH RECURSIVE s AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM s WHERE n < 5000) SELECT n FROM s;

CREATE TABLE departments (
  id INT PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  cost_center VARCHAR(10) NOT NULL,
  location VARCHAR(40) NOT NULL
);
INSERT INTO departments VALUES
  (1, 'Engineering', 'CC-100', 'Berlin'),
  (2, 'Product', 'CC-110', 'Berlin'),
  (3, 'Design', 'CC-120', 'Lisbon'),
  (4, 'Sales', 'CC-200', 'New York'),
  (5, 'Marketing', 'CC-210', 'New York'),
  (6, 'Customer Success', 'CC-220', 'Austin'),
  (7, 'Finance', 'CC-300', 'London'),
  (8, 'People', 'CC-310', 'London'),
  (9, 'Data', 'CC-130', 'Remote');

CREATE TABLE employees (
  id INT PRIMARY KEY AUTO_INCREMENT,
  first_name VARCHAR(40) NOT NULL,
  last_name VARCHAR(40) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  department_id INT NOT NULL,
  manager_id INT NULL,
  title VARCHAR(60) NOT NULL,
  level ENUM('L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7') NOT NULL,
  employment_type ENUM('full_time', 'part_time', 'contractor') NOT NULL,
  hired_at DATE NOT NULL,
  terminated_at DATE NULL,
  KEY idx_emp_dept (department_id),
  KEY idx_emp_manager (manager_id)
) COMMENT = 'Everyone who works or worked here; manager_id points to employees.id';

-- 1..9 are department heads (reporting to the CEO, id 10); the rest report to a head or a lead
INSERT INTO employees (first_name, last_name, email, department_id, manager_id, title, level, employment_type, hired_at, terminated_at)
SELECT
  ELT(1 + n % 24, 'Mia', 'Noah', 'Lea', 'Elias', 'Emma', 'Liam', 'Sofia', 'Ben', 'Hannah', 'Paul', 'Lina', 'Felix',
      'Clara', 'Jonas', 'Ida', 'Leon', 'Mila', 'Finn', 'Ella', 'Luis', 'Nora', 'Tom', 'Zoe', 'Omar'),
  ELT(1 + FLOOR(n / 24) % 16, 'Schmidt', 'Ferreira', 'Johnson', 'Lee', 'Patel', 'Costa', 'Walker', 'Becker', 'Ali', 'Moreau',
      'Kaur', 'Fischer', 'Brown', 'Santos', 'Wright', 'Ivanova'),
  CONCAT('emp', n, '@company.io'),
  IF(n <= 9, n, IF(n = 10, 7, 1 + n % 9)),
  CASE WHEN n = 10 THEN NULL WHEN n <= 9 THEN 10 WHEN n <= 60 THEN 1 + n % 9 ELSE 11 + (n % 50) END,
  CASE WHEN n = 10 THEN 'Chief Executive Officer' WHEN n <= 9 THEN 'Head of Department' WHEN n <= 60 THEN 'Team Lead'
       ELSE ELT(1 + n % 5, 'Associate', 'Specialist', 'Senior Specialist', 'Analyst', 'Engineer') END,
  CASE WHEN n = 10 THEN 'L7' WHEN n <= 9 THEN 'L6' WHEN n <= 60 THEN 'L5' ELSE ELT(1 + FLOOR(RAND(n) * 4), 'L1', 'L2', 'L3', 'L4') END,
  ELT(1 + FLOOR(RAND(n * 3) * 10), 'full_time', 'full_time', 'full_time', 'full_time', 'full_time', 'full_time', 'full_time', 'full_time', 'part_time', 'contractor'),
  '2018-01-01' + INTERVAL FLOOR(RAND(n * 5) * 2800) DAY,
  NULL
FROM seq WHERE n <= 600;
UPDATE employees SET department_id = (SELECT d FROM (SELECT id, department_id AS d FROM employees) m WHERE m.id = employees.manager_id) WHERE id > 60;
UPDATE employees SET terminated_at = hired_at + INTERVAL (200 + id % 900) DAY WHERE id > 60 AND id % 9 = 0;

CREATE TABLE salaries (
  employee_id INT NOT NULL,
  effective_from DATE NOT NULL,
  base_salary DECIMAL(10, 2) NOT NULL,
  bonus_pct DECIMAL(4, 2) NOT NULL,
  currency CHAR(3) NOT NULL,
  PRIMARY KEY (employee_id, effective_from)
) COMMENT = 'Salary history; the latest effective_from per employee is current';

INSERT INTO salaries
SELECT e.id,
       e.hired_at + INTERVAL (k.n - 1) YEAR,
       ROUND((38000 + (CAST(SUBSTRING(e.level, 2) AS UNSIGNED) * 17000) + RAND(e.id) * 12000) * POW(1.04, k.n - 1), -2),
       CAST(SUBSTRING(e.level, 2) AS UNSIGNED) * 2.5,
       IF(d.location IN ('London'), 'GBP', IF(d.location IN ('Berlin', 'Lisbon', 'Remote'), 'EUR', 'USD'))
FROM employees e
JOIN departments d ON d.id = e.department_id
JOIN seq k ON k.n <= 1 + FLOOR(DATEDIFF(COALESCE(e.terminated_at, '2025-10-01'), e.hired_at) / 365);

CREATE TABLE projects (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  department_id INT NOT NULL,
  budget DECIMAL(12, 2) NOT NULL,
  status ENUM('planned', 'active', 'on_hold', 'done') NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NULL
);

INSERT INTO projects (name, department_id, budget, status, starts_on, ends_on)
SELECT CONCAT('Project ', ELT(1 + n % 14, 'Atlas', 'Beacon', 'Comet', 'Delta', 'Echo', 'Falcon', 'Granite', 'Helix', 'Ion', 'Juniper', 'Kite', 'Lynx', 'Mosaic', 'Nebula'),
              IF(n > 14, CONCAT(' ', CEIL(n / 14)), '')),
       1 + n % 9,
       ROUND(20000 + RAND(n) * 480000, -3),
       ELT(1 + FLOOR(RAND(n * 3) * 4), 'planned', 'active', 'on_hold', 'done'),
       '2023-01-01' + INTERVAL FLOOR(RAND(n * 5) * 900) DAY,
       NULL
FROM seq WHERE n <= 70;
UPDATE projects SET ends_on = starts_on + INTERVAL (30 + id % 200) DAY WHERE status = 'done';

CREATE TABLE assignments (
  project_id INT NOT NULL,
  employee_id INT NOT NULL,
  role VARCHAR(30) NOT NULL,
  allocation_pct TINYINT NOT NULL,
  PRIMARY KEY (project_id, employee_id)
);

INSERT IGNORE INTO assignments
SELECT p.id, e.id, ELT(1 + (e.id + p.id) % 4, 'contributor', 'contributor', 'reviewer', 'owner'), ELT(1 + (e.id * p.id) % 4, 25, 50, 50, 100)
FROM projects p
JOIN employees e ON e.department_id = p.department_id AND e.terminated_at IS NULL AND (e.id + p.id) % 6 = 0;

CREATE VIEW current_salaries AS
SELECT s.*
FROM salaries s
JOIN (SELECT employee_id, MAX(effective_from) AS latest FROM salaries GROUP BY employee_id) l
  ON l.employee_id = s.employee_id AND l.latest = s.effective_from;

DROP TABLE seq;

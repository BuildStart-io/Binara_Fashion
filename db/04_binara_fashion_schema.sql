--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: Binara_fashion; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA "Binara_fashion";


--
-- Name: SCHEMA "Binara_fashion"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "Binara_fashion" IS 'Binara_fashion schema';


--
-- Name: app_role; Type: TYPE; Schema: Binara_fashion; Owner: -
--

CREATE TYPE "Binara_fashion".app_role AS ENUM (
    'super_admin',
    'business_user'
);


--
-- Name: plan_tier; Type: TYPE; Schema: Binara_fashion; Owner: -
--

CREATE TYPE "Binara_fashion".plan_tier AS ENUM (
    'free',
    'pro',
    'enterprise'
);


--
-- Name: can_read_usage(uuid); Type: FUNCTION; Schema: Binara_fashion; Owner: -
--

CREATE FUNCTION "Binara_fashion".can_read_usage(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO '"Binara_fashion"'
    AS $$
  SELECT auth.uid() IS NULL
      OR auth.uid() = _user_id
      OR "Binara_fashion".has_role(auth.uid(), 'super_admin'::app_role)
      OR "Binara_fashion".is_staff_of(auth.uid(), _user_id)
$$;


--
-- Name: enforce_order_limit(); Type: FUNCTION; Schema: Binara_fashion; Owner: -
--

CREATE FUNCTION "Binara_fashion".enforce_order_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO '"Binara_fashion"'
    AS $$
DECLARE
  current_count INT;
  max_allowed INT;
  tier TEXT;
  addon INT;
  plan_max INT;
  platform_limits JSONB;
  billing_start TIMESTAMPTZ;
  month_start TIMESTAMPTZ;
  next_date TIMESTAMPTZ;
  user_paused BOOLEAN;
BEGIN
  SELECT p.plan_tier, p.addon_orders, p.billing_cycle_start, p.is_paused
  INTO tier, addon, billing_start, user_paused
  FROM profiles p WHERE p.user_id = NEW.user_id;

  IF user_paused = true THEN
    RAISE EXCEPTION 'Account is paused. Cannot create orders.';
  END IF;

  IF tier IS NULL THEN
    tier := 'free';
    addon := 0;
  END IF;

  -- Calculate billing month start
  IF billing_start IS NOT NULL THEN
    month_start := billing_start;
    LOOP
      next_date := month_start + INTERVAL '1 month';
      EXIT WHEN next_date > NOW();
      month_start := next_date;
    END LOOP;
  ELSE
    month_start := date_trunc('month', NOW());
  END IF;

  SELECT ps.value INTO platform_limits
  FROM platform_settings ps WHERE ps.key = 'plan_limits';

  IF platform_limits IS NOT NULL AND platform_limits->tier IS NOT NULL THEN
    plan_max := COALESCE((platform_limits->tier->>'max_orders_per_month')::INT, 50);
  ELSE
    plan_max := CASE tier WHEN 'pro' THEN 500 WHEN 'enterprise' THEN 9999 ELSE 50 END;
  END IF;

  max_allowed := plan_max + COALESCE(addon, 0);

  SELECT COUNT(*) INTO current_count
  FROM orders WHERE user_id = NEW.user_id AND created_at >= month_start;

  IF current_count >= max_allowed THEN
    RAISE EXCEPTION 'Monthly order limit reached (% of %). Upgrade your plan to process more orders.', current_count, max_allowed;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: get_ai_message_usage(uuid, timestamp with time zone); Type: FUNCTION; Schema: Binara_fashion; Owner: -
--

CREATE FUNCTION "Binara_fashion".get_ai_message_usage(_user_id uuid, _since timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO '"Binara_fashion"'
    AS $$
DECLARE c integer;
BEGIN
  IF NOT "Binara_fashion".can_read_usage(_user_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT COUNT(*) INTO c
  FROM "Binara_fashion".ai_usage_logs
  WHERE user_id = _user_id AND created_at >= _since;
  RETURN COALESCE(c, 0);
END;
$$;


--
-- Name: get_contact_usage(uuid, timestamp with time zone); Type: FUNCTION; Schema: Binara_fashion; Owner: -
--

CREATE FUNCTION "Binara_fashion".get_contact_usage(_user_id uuid, _since timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO '"Binara_fashion"'
    AS $$
DECLARE c integer;
BEGIN
  IF NOT "Binara_fashion".can_read_usage(_user_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT COUNT(DISTINCT phone_number) INTO c
  FROM "Binara_fashion".contact_usage
  WHERE user_id = _user_id AND created_at >= _since;
  RETURN COALESCE(c, 0);
END;
$$;


--
-- Name: get_staff_owner_id(uuid); Type: FUNCTION; Schema: Binara_fashion; Owner: -
--

CREATE FUNCTION "Binara_fashion".get_staff_owner_id(_user_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO '"Binara_fashion"'
    AS $$
  SELECT owner_id FROM "Binara_fashion".staff_accounts
  WHERE staff_user_id = _user_id AND is_active = true
  LIMIT 1
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: Binara_fashion; Owner: -
--

CREATE FUNCTION "Binara_fashion".handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO '"Binara_fashion"'
    AS $$
BEGIN
  INSERT INTO "Binara_fashion".profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user_role(); Type: FUNCTION; Schema: Binara_fashion; Owner: -
--

CREATE FUNCTION "Binara_fashion".handle_new_user_role() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO '"Binara_fashion"'
    AS $$
BEGIN
  INSERT INTO "Binara_fashion".user_roles (user_id, role)
  VALUES (NEW.id, 'business_user');
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user_settings(); Type: FUNCTION; Schema: Binara_fashion; Owner: -
--

CREATE FUNCTION "Binara_fashion".handle_new_user_settings() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO '"Binara_fashion"'
    AS $$
BEGIN
  INSERT INTO "Binara_fashion".settings (user_id, key, value) VALUES
    (NEW.id, 'welcome_message', '{"text": "Welcome! How can I help you today?"}'::jsonb),
    (NEW.id, 'payment_info', '{"bank_name": "", "account_number": "", "account_name": ""}'::jsonb),
    (NEW.id, 'auto_responses', '{"enabled": true}'::jsonb);
  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, "Binara_fashion".app_role); Type: FUNCTION; Schema: Binara_fashion; Owner: -
--

CREATE FUNCTION "Binara_fashion".has_role(_user_id uuid, _role "Binara_fashion".app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO '"Binara_fashion"'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Binara_fashion".user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: Binara_fashion; Owner: -
--

CREATE FUNCTION "Binara_fashion".is_admin() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO '"Binara_fashion"'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "Binara_fashion".profiles
    WHERE user_id = auth.uid()
  );
END;
$$;


--
-- Name: is_staff_of(uuid, uuid); Type: FUNCTION; Schema: Binara_fashion; Owner: -
--

CREATE FUNCTION "Binara_fashion".is_staff_of(_staff_user_id uuid, _owner_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO '"Binara_fashion"'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Binara_fashion".staff_accounts
    WHERE staff_user_id = _staff_user_id
      AND owner_id = _owner_id
      AND is_active = true
  )
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: Binara_fashion; Owner: -
--

CREATE FUNCTION "Binara_fashion".update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO '"Binara_fashion"'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_usage_logs; Type: TABLE; Schema: Binara_fashion; Owner: -
--

CREATE TABLE "Binara_fashion".ai_usage_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    phone_number text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_takeovers; Type: TABLE; Schema: Binara_fashion; Owner: -
--

CREATE TABLE "Binara_fashion".chat_takeovers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    phone_number text NOT NULL,
    is_taken_over boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_usage; Type: TABLE; Schema: Binara_fashion; Owner: -
--

CREATE TABLE "Binara_fashion".contact_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    phone_number text NOT NULL,
    period_start timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversations; Type: TABLE; Schema: Binara_fashion; Owner: -
--

CREATE TABLE "Binara_fashion".conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone_number text NOT NULL,
    message text NOT NULL,
    direction text NOT NULL,
    message_type text DEFAULT 'text'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    CONSTRAINT conversations_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))
);


--
-- Name: faq_usage_logs; Type: TABLE; Schema: Binara_fashion; Owner: -
--

CREATE TABLE "Binara_fashion".faq_usage_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    faq_id uuid NOT NULL,
    user_id uuid NOT NULL,
    phone_number text NOT NULL,
    sender_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: faqs; Type: TABLE; Schema: Binara_fashion; Owner: -
--

CREATE TABLE "Binara_fashion".faqs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    product_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    is_tracked boolean DEFAULT false NOT NULL,
    media_urls text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: fcm_tokens; Type: TABLE; Schema: Binara_fashion; Owner: -
--

CREATE TABLE "Binara_fashion".fcm_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    device_token text NOT NULL,
    device_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: leads; Type: TABLE; Schema: Binara_fashion; Owner: -
--

CREATE TABLE "Binara_fashion".leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    phone_number text NOT NULL,
    customer_name text,
    assigned_to uuid,
    status text DEFAULT 'new'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: message_queue; Type: TABLE; Schema: Binara_fashion; Owner: -
--

CREATE TABLE "Binara_fashion".message_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wsender_message_id text NOT NULL,
    user_id uuid NOT NULL,
    phone_number text NOT NULL,
    sender_name text DEFAULT 'Unknown'::text,
    message_text text DEFAULT ''::text,
    message_type text DEFAULT 'text'::text,
    session_api_key text,
    raw_payload jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    correlation_id text
);


--
-- Name: orders; Type: TABLE; Schema: Binara_fashion; Owner: -
--

CREATE TABLE "Binara_fashion".orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    customer_address text,
    order_items jsonb DEFAULT '[]'::jsonb NOT NULL,
    special_instructions text,
    payment_method text DEFAULT 'cod'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    total_amount numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    whatsapp_phone text,
    district text,
    call_date text,
    call_time text,
    call_type text,
    call_phone text,
    CONSTRAINT orders_payment_method_check CHECK ((payment_method = ANY (ARRAY['cod'::text, 'bank_transfer'::text]))),
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'pending_call'::text, 'pending call'::text, 'waiting_for_slip_verification'::text, 'waiting for slip verification'::text, 'pending_verification'::text, 'pendingverification'::text, 'processing'::text, 'shipped'::text, 'delivered'::text, 'cancelled'::text])))
);


--
-- Name: platform_settings; Type: TABLE; Schema: Binara_fashion; Owner: -
--

CREATE TABLE "Binara_fashion".platform_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: Binara_fashion; Owner: -
--

CREATE TABLE "Binara_fashion".products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    product_type text DEFAULT 'physical'::text NOT NULL,
    variations jsonb DEFAULT '[]'::jsonb,
    images text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    delivery_price numeric DEFAULT 0,
    video_url text,
    CONSTRAINT products_product_type_check CHECK ((product_type = ANY (ARRAY['physical'::text, 'digital'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: Binara_fashion; Owner: -
--

CREATE TABLE "Binara_fashion".profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    full_name text,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    plan_tier "Binara_fashion".plan_tier DEFAULT 'free'::"Binara_fashion".plan_tier NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    business_name text,
    max_products integer DEFAULT 5,
    max_faqs integer DEFAULT 10,
    billing_cycle_start timestamp with time zone DEFAULT now(),
    is_paused boolean DEFAULT false NOT NULL,
    addon_products integer DEFAULT 0 NOT NULL,
    addon_faqs integer DEFAULT 0 NOT NULL,
    addon_orders integer DEFAULT 0 NOT NULL,
    addon_ai_messages integer DEFAULT 0 NOT NULL,
    addon_images integer DEFAULT 0 NOT NULL,
    addon_staff integer DEFAULT 0 NOT NULL,
    addon_contacts integer DEFAULT 0 NOT NULL
);


--
-- Name: settings; Type: TABLE; Schema: Binara_fashion; Owner: -
--

CREATE TABLE "Binara_fashion".settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: staff_accounts; Type: TABLE; Schema: Binara_fashion; Owner: -
--

CREATE TABLE "Binara_fashion".staff_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    staff_user_id uuid NOT NULL,
    staff_email text NOT NULL,
    staff_name text,
    permissions text[] DEFAULT '{}'::text[] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    whatsapp_number text
);


--
-- Name: user_roles; Type: TABLE; Schema: Binara_fashion; Owner: -
--

CREATE TABLE "Binara_fashion".user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role "Binara_fashion".app_role DEFAULT 'business_user'::"Binara_fashion".app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_wsender_sessions; Type: TABLE; Schema: Binara_fashion; Owner: -
--

CREATE TABLE "Binara_fashion".user_wsender_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_id text NOT NULL,
    session_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    session_api_key text
);


--
-- Data for Name: ai_usage_logs; Type: TABLE DATA; Schema: Binara_fashion; Owner: -
--

COPY "Binara_fashion".ai_usage_logs (id, user_id, phone_number, created_at) FROM stdin;
\.


--
-- Data for Name: chat_takeovers; Type: TABLE DATA; Schema: Binara_fashion; Owner: -
--

COPY "Binara_fashion".chat_takeovers (id, user_id, phone_number, is_taken_over, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: contact_usage; Type: TABLE DATA; Schema: Binara_fashion; Owner: -
--

COPY "Binara_fashion".contact_usage (id, user_id, phone_number, period_start, created_at) FROM stdin;
\.


--
-- Data for Name: conversations; Type: TABLE DATA; Schema: Binara_fashion; Owner: -
--

COPY "Binara_fashion".conversations (id, phone_number, message, direction, message_type, metadata, created_at, user_id) FROM stdin;
\.


--
-- Data for Name: faq_usage_logs; Type: TABLE DATA; Schema: Binara_fashion; Owner: -
--

COPY "Binara_fashion".faq_usage_logs (id, faq_id, user_id, phone_number, sender_name, created_at) FROM stdin;
\.


--
-- Data for Name: faqs; Type: TABLE DATA; Schema: Binara_fashion; Owner: -
--

COPY "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) FROM stdin;
\.


--
-- Data for Name: fcm_tokens; Type: TABLE DATA; Schema: Binara_fashion; Owner: -
--

COPY "Binara_fashion".fcm_tokens (id, user_id, device_token, device_name, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: leads; Type: TABLE DATA; Schema: Binara_fashion; Owner: -
--

COPY "Binara_fashion".leads (id, user_id, phone_number, customer_name, assigned_to, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: message_queue; Type: TABLE DATA; Schema: Binara_fashion; Owner: -
--

COPY "Binara_fashion".message_queue (id, wsender_message_id, user_id, phone_number, sender_name, message_text, message_type, session_api_key, raw_payload, status, attempts, max_attempts, error_message, created_at, updated_at, processed_at, correlation_id) FROM stdin;
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: Binara_fashion; Owner: -
--

COPY "Binara_fashion".orders (id, customer_name, customer_phone, customer_address, order_items, special_instructions, payment_method, status, total_amount, created_at, updated_at, user_id, whatsapp_phone, district, call_date, call_time, call_type, call_phone) FROM stdin;
\.


--
-- Data for Name: platform_settings; Type: TABLE DATA; Schema: Binara_fashion; Owner: -
--

COPY "Binara_fashion".platform_settings (id, key, value, created_at, updated_at) FROM stdin;
9ef2f590-b246-448f-9635-c85c827ff103	plan_limits	{"pro": {"max_faqs": 100, "max_staff": 0, "max_products": 50, "contacts_per_month": 300, "max_orders_per_month": 500, "ai_messages_per_month": 2000, "max_images_per_product": 5}, "free": {"max_faqs": 10, "max_staff": 0, "max_products": 5, "contacts_per_month": 50, "max_orders_per_month": 50, "ai_messages_per_month": 100, "max_images_per_product": 1}, "enterprise": {"max_faqs": 999, "max_staff": 2, "max_products": 999, "contacts_per_month": 1500, "max_orders_per_month": 9999, "ai_messages_per_month": 99999, "max_images_per_product": 10}}	2026-10-22 05:00:06.143393+00	2026-10-22 05:00:06.143393+00
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: Binara_fashion; Owner: -
--

COPY "Binara_fashion".products (id, name, description, price, product_type, variations, images, is_active, created_at, updated_at, user_id, delivery_price, video_url) FROM stdin;
dadcbba0-9a1a-4ab3-8865-fc30341de7d6	c	this is a c type p	3.00	physical	[]	{http://localhost:9000/biz-1c843592-1067-4279-975b-26138ba3dc4b/products/ca76263c-38ba-4237-ab22-0fc7565b040a.jpeg}	t	2026-10-20 06:35:19.262329+00	2026-10-20 09:06:32.809468+00	1c843592-1067-4279-975b-26138ba3dc4b	0	\N
be2a6268-2cc3-418d-9c81-a47ae7fe1c77	b	this is a bbb type p	2.00	physical	[]	{http://localhost:9000/biz-1c843592-1067-4279-975b-26138ba3dc4b/products/e1536f68-2bbe-4c17-aea0-57c2db9b8c35.jpeg}	t	2026-10-20 06:35:06.566832+00	2026-10-20 09:06:41.764196+00	1c843592-1067-4279-975b-26138ba3dc4b	0	\N
4537b91f-bccc-49c5-92f8-b0c5d5e55fbb	a	this is a aaa thype p	1.00	physical	[]	{http://localhost:9000/biz-1c843592-1067-4279-975b-26138ba3dc4b/products/2df28779-f02d-498e-8a8e-e7990a4f14c7.jpeg}	t	2026-10-20 06:35:01.193981+00	2026-10-20 09:06:51.643844+00	1c843592-1067-4279-975b-26138ba3dc4b	0	\N
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: Binara_fashion; Owner: -
--

COPY "Binara_fashion".profiles (id, user_id, full_name, email, created_at, updated_at, plan_tier, is_active, business_name, max_products, max_faqs, billing_cycle_start, is_paused, addon_products, addon_faqs, addon_orders, addon_ai_messages, addon_images, addon_staff, addon_contacts) FROM stdin;
4094841b-e471-49bf-ae3c-679070f74354	1c843592-1067-4279-975b-26138ba3dc4b	qwe@buildstart.io	qwe@buildstart.io	2026-10-22 05:00:06.145301+00	2026-10-22 05:00:06.145301+00	enterprise	t	\N	5	10	2026-10-16 08:07:00.678639+00	f	0	0	0	0	0	0	0
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: Binara_fashion; Owner: -
--

COPY "Binara_fashion".settings (id, key, value, created_at, updated_at, user_id) FROM stdin;
b6638d4d-be14-47c7-8f27-82d9e7cd3b33	welcome_message	{"text": "Welcome! How can I help you today?"}	2026-10-22 05:00:06.152796+00	2026-10-22 05:00:06.152796+00	1c843592-1067-4279-975b-26138ba3dc4b
09a61d70-9833-4628-9006-530f3561922f	payment_info	{"bank_name": "", "account_name": "", "account_number": ""}	2026-10-22 05:00:06.152796+00	2026-10-22 05:00:06.152796+00	1c843592-1067-4279-975b-26138ba3dc4b
4d8060cb-4f96-4646-bdc2-9e09e2ce6f61	auto_responses	{"enabled": true}	2026-10-22 05:00:06.152796+00	2026-10-22 05:00:06.152796+00	1c843592-1067-4279-975b-26138ba3dc4b
\.


--
-- Data for Name: staff_accounts; Type: TABLE DATA; Schema: Binara_fashion; Owner: -
--

COPY "Binara_fashion".staff_accounts (id, owner_id, staff_user_id, staff_email, staff_name, permissions, is_active, created_at, updated_at, whatsapp_number) FROM stdin;
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: Binara_fashion; Owner: -
--

COPY "Binara_fashion".user_roles (id, user_id, role, created_at) FROM stdin;
fe95b7be-5521-4ffe-a8f0-3d77082bdecf	1c843592-1067-4279-975b-26138ba3dc4b	business_user	2026-10-22 05:00:06.150301+00
ce10eada-0423-4edf-b828-aecc125f99ac	1c843592-1067-4279-975b-26138ba3dc4b	super_admin	2026-10-22 05:00:06.150301+00
\.


--
-- Data for Name: user_wsender_sessions; Type: TABLE DATA; Schema: Binara_fashion; Owner: -
--

COPY "Binara_fashion".user_wsender_sessions (id, user_id, session_id, session_name, created_at, session_api_key) FROM stdin;
4e9394c5-1aa0-475a-a6a9-4c401949214c	1c843592-1067-4279-975b-26138ba3dc4b	u_1c84359210674279975b	tttt	2026-10-20 06:47:01.583721+00	u_1c84359210674279975b
\.


--
-- Name: ai_usage_logs ai_usage_logs_pkey; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_pkey PRIMARY KEY (id);


--
-- Name: chat_takeovers chat_takeovers_pkey; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".chat_takeovers
    ADD CONSTRAINT chat_takeovers_pkey PRIMARY KEY (id);


--
-- Name: chat_takeovers chat_takeovers_user_id_phone_number_key; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".chat_takeovers
    ADD CONSTRAINT chat_takeovers_user_id_phone_number_key UNIQUE (user_id, phone_number);


--
-- Name: contact_usage contact_usage_pkey; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".contact_usage
    ADD CONSTRAINT contact_usage_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: faq_usage_logs faq_usage_logs_pkey; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".faq_usage_logs
    ADD CONSTRAINT faq_usage_logs_pkey PRIMARY KEY (id);


--
-- Name: faqs faqs_pkey; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".faqs
    ADD CONSTRAINT faqs_pkey PRIMARY KEY (id);


--
-- Name: fcm_tokens fcm_tokens_pkey; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".fcm_tokens
    ADD CONSTRAINT fcm_tokens_pkey PRIMARY KEY (id);


--
-- Name: fcm_tokens fcm_tokens_user_id_device_token_key; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".fcm_tokens
    ADD CONSTRAINT fcm_tokens_user_id_device_token_key UNIQUE (user_id, device_token);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: leads leads_user_id_phone_number_key; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".leads
    ADD CONSTRAINT leads_user_id_phone_number_key UNIQUE (user_id, phone_number);


--
-- Name: message_queue message_queue_pkey; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".message_queue
    ADD CONSTRAINT message_queue_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: platform_settings platform_settings_key_key; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".platform_settings
    ADD CONSTRAINT platform_settings_key_key UNIQUE (key);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: settings settings_user_id_key_unique; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".settings
    ADD CONSTRAINT settings_user_id_key_unique UNIQUE (user_id, key);


--
-- Name: staff_accounts staff_accounts_owner_id_staff_user_id_key; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".staff_accounts
    ADD CONSTRAINT staff_accounts_owner_id_staff_user_id_key UNIQUE (owner_id, staff_user_id);


--
-- Name: staff_accounts staff_accounts_pkey; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".staff_accounts
    ADD CONSTRAINT staff_accounts_pkey PRIMARY KEY (id);


--
-- Name: message_queue unique_wsender_message; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".message_queue
    ADD CONSTRAINT unique_wsender_message UNIQUE (wsender_message_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: user_wsender_sessions user_wsender_sessions_pkey; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".user_wsender_sessions
    ADD CONSTRAINT user_wsender_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_wsender_sessions user_wsender_sessions_user_id_session_id_key; Type: CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".user_wsender_sessions
    ADD CONSTRAINT user_wsender_sessions_user_id_session_id_key UNIQUE (user_id, session_id);


--
-- Name: contact_usage_unique_per_cycle; Type: INDEX; Schema: Binara_fashion; Owner: -
--

CREATE UNIQUE INDEX contact_usage_unique_per_cycle ON "Binara_fashion".contact_usage USING btree (user_id, phone_number, period_start);


--
-- Name: idx_ai_usage_logs_user_created; Type: INDEX; Schema: Binara_fashion; Owner: -
--

CREATE INDEX idx_ai_usage_logs_user_created ON "Binara_fashion".ai_usage_logs USING btree (user_id, created_at);


--
-- Name: idx_contact_usage_user_created; Type: INDEX; Schema: Binara_fashion; Owner: -
--

CREATE INDEX idx_contact_usage_user_created ON "Binara_fashion".contact_usage USING btree (user_id, created_at);


--
-- Name: idx_conversations_created_at; Type: INDEX; Schema: Binara_fashion; Owner: -
--

CREATE INDEX idx_conversations_created_at ON "Binara_fashion".conversations USING btree (created_at DESC);


--
-- Name: idx_conversations_phone; Type: INDEX; Schema: Binara_fashion; Owner: -
--

CREATE INDEX idx_conversations_phone ON "Binara_fashion".conversations USING btree (phone_number);


--
-- Name: idx_faq_usage_logs_faq_id; Type: INDEX; Schema: Binara_fashion; Owner: -
--

CREATE INDEX idx_faq_usage_logs_faq_id ON "Binara_fashion".faq_usage_logs USING btree (faq_id);


--
-- Name: idx_faq_usage_logs_user_phone; Type: INDEX; Schema: Binara_fashion; Owner: -
--

CREATE INDEX idx_faq_usage_logs_user_phone ON "Binara_fashion".faq_usage_logs USING btree (user_id, phone_number);


--
-- Name: idx_leads_assigned; Type: INDEX; Schema: Binara_fashion; Owner: -
--

CREATE INDEX idx_leads_assigned ON "Binara_fashion".leads USING btree (assigned_to);


--
-- Name: idx_leads_user; Type: INDEX; Schema: Binara_fashion; Owner: -
--

CREATE INDEX idx_leads_user ON "Binara_fashion".leads USING btree (user_id);


--
-- Name: idx_message_queue_processed; Type: INDEX; Schema: Binara_fashion; Owner: -
--

CREATE INDEX idx_message_queue_processed ON "Binara_fashion".message_queue USING btree (processed_at) WHERE (status = 'done'::text);


--
-- Name: idx_message_queue_status; Type: INDEX; Schema: Binara_fashion; Owner: -
--

CREATE INDEX idx_message_queue_status ON "Binara_fashion".message_queue USING btree (status, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));


--
-- Name: idx_message_queue_status_created; Type: INDEX; Schema: Binara_fashion; Owner: -
--

CREATE INDEX idx_message_queue_status_created ON "Binara_fashion".message_queue USING btree (status, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));


--
-- Name: idx_message_queue_user_processing; Type: INDEX; Schema: Binara_fashion; Owner: -
--

CREATE INDEX idx_message_queue_user_processing ON "Binara_fashion".message_queue USING btree (user_id) WHERE (status = 'processing'::text);


--
-- Name: idx_orders_created_at; Type: INDEX; Schema: Binara_fashion; Owner: -
--

CREATE INDEX idx_orders_created_at ON "Binara_fashion".orders USING btree (created_at DESC);


--
-- Name: idx_orders_status; Type: INDEX; Schema: Binara_fashion; Owner: -
--

CREATE INDEX idx_orders_status ON "Binara_fashion".orders USING btree (status);


--
-- Name: orders check_order_limit; Type: TRIGGER; Schema: Binara_fashion; Owner: -
--

CREATE TRIGGER check_order_limit BEFORE INSERT ON "Binara_fashion".orders FOR EACH ROW EXECUTE FUNCTION "Binara_fashion".enforce_order_limit();


--
-- Name: faqs update_faqs_updated_at; Type: TRIGGER; Schema: Binara_fashion; Owner: -
--

CREATE TRIGGER update_faqs_updated_at BEFORE UPDATE ON "Binara_fashion".faqs FOR EACH ROW EXECUTE FUNCTION "Binara_fashion".update_updated_at_column();


--
-- Name: fcm_tokens update_fcm_tokens_updated_at; Type: TRIGGER; Schema: Binara_fashion; Owner: -
--

CREATE TRIGGER update_fcm_tokens_updated_at BEFORE UPDATE ON "Binara_fashion".fcm_tokens FOR EACH ROW EXECUTE FUNCTION "Binara_fashion".update_updated_at_column();


--
-- Name: leads update_leads_updated_at; Type: TRIGGER; Schema: Binara_fashion; Owner: -
--

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON "Binara_fashion".leads FOR EACH ROW EXECUTE FUNCTION "Binara_fashion".update_updated_at_column();


--
-- Name: message_queue update_message_queue_updated_at; Type: TRIGGER; Schema: Binara_fashion; Owner: -
--

CREATE TRIGGER update_message_queue_updated_at BEFORE UPDATE ON "Binara_fashion".message_queue FOR EACH ROW EXECUTE FUNCTION "Binara_fashion".update_updated_at_column();


--
-- Name: orders update_orders_updated_at; Type: TRIGGER; Schema: Binara_fashion; Owner: -
--

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON "Binara_fashion".orders FOR EACH ROW EXECUTE FUNCTION "Binara_fashion".update_updated_at_column();


--
-- Name: platform_settings update_platform_settings_updated_at; Type: TRIGGER; Schema: Binara_fashion; Owner: -
--

CREATE TRIGGER update_platform_settings_updated_at BEFORE UPDATE ON "Binara_fashion".platform_settings FOR EACH ROW EXECUTE FUNCTION "Binara_fashion".update_updated_at_column();


--
-- Name: products update_products_updated_at; Type: TRIGGER; Schema: Binara_fashion; Owner: -
--

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON "Binara_fashion".products FOR EACH ROW EXECUTE FUNCTION "Binara_fashion".update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: Binara_fashion; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON "Binara_fashion".profiles FOR EACH ROW EXECUTE FUNCTION "Binara_fashion".update_updated_at_column();


--
-- Name: settings update_settings_updated_at; Type: TRIGGER; Schema: Binara_fashion; Owner: -
--

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON "Binara_fashion".settings FOR EACH ROW EXECUTE FUNCTION "Binara_fashion".update_updated_at_column();


--
-- Name: staff_accounts update_staff_accounts_updated_at; Type: TRIGGER; Schema: Binara_fashion; Owner: -
--

CREATE TRIGGER update_staff_accounts_updated_at BEFORE UPDATE ON "Binara_fashion".staff_accounts FOR EACH ROW EXECUTE FUNCTION "Binara_fashion".update_updated_at_column();


--
-- Name: conversations conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".conversations
    ADD CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: faq_usage_logs faq_usage_logs_faq_id_fkey; Type: FK CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".faq_usage_logs
    ADD CONSTRAINT faq_usage_logs_faq_id_fkey FOREIGN KEY (faq_id) REFERENCES "Binara_fashion".faqs(id) ON DELETE CASCADE;


--
-- Name: faqs faqs_product_id_fkey; Type: FK CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".faqs
    ADD CONSTRAINT faqs_product_id_fkey FOREIGN KEY (product_id) REFERENCES "Binara_fashion".products(id) ON DELETE SET NULL;


--
-- Name: faqs faqs_user_id_fkey; Type: FK CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".faqs
    ADD CONSTRAINT faqs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: products products_user_id_fkey; Type: FK CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".products
    ADD CONSTRAINT products_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: settings settings_user_id_fkey; Type: FK CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".settings
    ADD CONSTRAINT settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: staff_accounts staff_accounts_staff_user_id_fkey; Type: FK CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".staff_accounts
    ADD CONSTRAINT staff_accounts_staff_user_id_fkey FOREIGN KEY (staff_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_wsender_sessions user_wsender_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: Binara_fashion; Owner: -
--

ALTER TABLE ONLY "Binara_fashion".user_wsender_sessions
    ADD CONSTRAINT user_wsender_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: platform_settings Authenticated users can view platform settings; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Authenticated users can view platform settings" ON "Binara_fashion".platform_settings FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: staff_accounts Owners can create staff; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Owners can create staff" ON "Binara_fashion".staff_accounts FOR INSERT WITH CHECK ((auth.uid() = owner_id));


--
-- Name: staff_accounts Owners can delete their staff; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Owners can delete their staff" ON "Binara_fashion".staff_accounts FOR DELETE USING ((auth.uid() = owner_id));


--
-- Name: staff_accounts Owners can update their staff; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Owners can update their staff" ON "Binara_fashion".staff_accounts FOR UPDATE USING ((auth.uid() = owner_id));


--
-- Name: staff_accounts Owners can view their staff; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Owners can view their staff" ON "Binara_fashion".staff_accounts FOR SELECT USING ((auth.uid() = owner_id));


--
-- Name: leads Owners manage their leads; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Owners manage their leads" ON "Binara_fashion".leads TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Service can insert profiles; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Service can insert profiles" ON "Binara_fashion".profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: conversations Staff can create owner conversations; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff can create owner conversations" ON "Binara_fashion".conversations FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "Binara_fashion".staff_accounts sa
  WHERE ((sa.staff_user_id = auth.uid()) AND (sa.owner_id = conversations.user_id) AND (sa.is_active = true) AND ('conversations'::text = ANY (sa.permissions))))));


--
-- Name: faqs Staff can create owner faqs; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff can create owner faqs" ON "Binara_fashion".faqs FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "Binara_fashion".staff_accounts sa
  WHERE ((sa.staff_user_id = auth.uid()) AND (sa.owner_id = faqs.user_id) AND (sa.is_active = true) AND ('faqs'::text = ANY (sa.permissions))))));


--
-- Name: products Staff can create owner products; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff can create owner products" ON "Binara_fashion".products FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "Binara_fashion".staff_accounts sa
  WHERE ((sa.staff_user_id = auth.uid()) AND (sa.owner_id = products.user_id) AND (sa.is_active = true) AND ('products'::text = ANY (sa.permissions))))));


--
-- Name: chat_takeovers Staff can manage owner takeovers; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff can manage owner takeovers" ON "Binara_fashion".chat_takeovers FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "Binara_fashion".staff_accounts sa
  WHERE ((sa.staff_user_id = auth.uid()) AND (sa.owner_id = chat_takeovers.user_id) AND (sa.is_active = true) AND ('conversations'::text = ANY (sa.permissions))))));


--
-- Name: faqs Staff can update owner faqs; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff can update owner faqs" ON "Binara_fashion".faqs FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "Binara_fashion".staff_accounts sa
  WHERE ((sa.staff_user_id = auth.uid()) AND (sa.owner_id = faqs.user_id) AND (sa.is_active = true) AND ('faqs'::text = ANY (sa.permissions))))));


--
-- Name: orders Staff can update owner orders; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff can update owner orders" ON "Binara_fashion".orders FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "Binara_fashion".staff_accounts sa
  WHERE ((sa.staff_user_id = auth.uid()) AND (sa.owner_id = orders.user_id) AND (sa.is_active = true) AND ('orders'::text = ANY (sa.permissions))))));


--
-- Name: products Staff can update owner products; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff can update owner products" ON "Binara_fashion".products FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "Binara_fashion".staff_accounts sa
  WHERE ((sa.staff_user_id = auth.uid()) AND (sa.owner_id = products.user_id) AND (sa.is_active = true) AND ('products'::text = ANY (sa.permissions))))));


--
-- Name: chat_takeovers Staff can update owner takeovers; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff can update owner takeovers" ON "Binara_fashion".chat_takeovers FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "Binara_fashion".staff_accounts sa
  WHERE ((sa.staff_user_id = auth.uid()) AND (sa.owner_id = chat_takeovers.user_id) AND (sa.is_active = true) AND ('conversations'::text = ANY (sa.permissions))))));


--
-- Name: staff_accounts Staff can view own record; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff can view own record" ON "Binara_fashion".staff_accounts FOR SELECT USING ((auth.uid() = staff_user_id));


--
-- Name: conversations Staff can view owner conversations; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff can view owner conversations" ON "Binara_fashion".conversations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "Binara_fashion".staff_accounts sa
  WHERE ((sa.staff_user_id = auth.uid()) AND (sa.owner_id = conversations.user_id) AND (sa.is_active = true) AND ('conversations'::text = ANY (sa.permissions))))));


--
-- Name: faq_usage_logs Staff can view owner faq usage logs; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff can view owner faq usage logs" ON "Binara_fashion".faq_usage_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "Binara_fashion".staff_accounts sa
  WHERE ((sa.staff_user_id = auth.uid()) AND (sa.owner_id = faq_usage_logs.user_id) AND (sa.is_active = true) AND ('faqs'::text = ANY (sa.permissions))))));


--
-- Name: faqs Staff can view owner faqs; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff can view owner faqs" ON "Binara_fashion".faqs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "Binara_fashion".staff_accounts sa
  WHERE ((sa.staff_user_id = auth.uid()) AND (sa.owner_id = faqs.user_id) AND (sa.is_active = true) AND ('faqs'::text = ANY (sa.permissions))))));


--
-- Name: orders Staff can view owner orders; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff can view owner orders" ON "Binara_fashion".orders FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "Binara_fashion".staff_accounts sa
  WHERE ((sa.staff_user_id = auth.uid()) AND (sa.owner_id = orders.user_id) AND (sa.is_active = true) AND ('orders'::text = ANY (sa.permissions))))));


--
-- Name: products Staff can view owner products; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff can view owner products" ON "Binara_fashion".products FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "Binara_fashion".staff_accounts sa
  WHERE ((sa.staff_user_id = auth.uid()) AND (sa.owner_id = products.user_id) AND (sa.is_active = true) AND ('products'::text = ANY (sa.permissions))))));


--
-- Name: profiles Staff can view owner profile; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff can view owner profile" ON "Binara_fashion".profiles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "Binara_fashion".staff_accounts sa
  WHERE ((sa.staff_user_id = auth.uid()) AND (sa.owner_id = profiles.user_id) AND (sa.is_active = true)))));


--
-- Name: settings Staff can view owner settings; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff can view owner settings" ON "Binara_fashion".settings FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "Binara_fashion".staff_accounts sa
  WHERE ((sa.staff_user_id = auth.uid()) AND (sa.owner_id = settings.user_id) AND (sa.is_active = true)))));


--
-- Name: chat_takeovers Staff can view owner takeovers; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff can view owner takeovers" ON "Binara_fashion".chat_takeovers FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "Binara_fashion".staff_accounts sa
  WHERE ((sa.staff_user_id = auth.uid()) AND (sa.owner_id = chat_takeovers.user_id) AND (sa.is_active = true) AND ('conversations'::text = ANY (sa.permissions))))));


--
-- Name: leads Staff insert owner leads; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff insert owner leads" ON "Binara_fashion".leads FOR INSERT TO authenticated WITH CHECK ("Binara_fashion".is_staff_of(auth.uid(), user_id));


--
-- Name: leads Staff update owner leads; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff update owner leads" ON "Binara_fashion".leads FOR UPDATE TO authenticated USING ("Binara_fashion".is_staff_of(auth.uid(), user_id)) WITH CHECK ("Binara_fashion".is_staff_of(auth.uid(), user_id));


--
-- Name: leads Staff view owner leads; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Staff view owner leads" ON "Binara_fashion".leads FOR SELECT TO authenticated USING ("Binara_fashion".is_staff_of(auth.uid(), user_id));


--
-- Name: faqs Super admins can delete all faqs; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can delete all faqs" ON "Binara_fashion".faqs FOR DELETE USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: platform_settings Super admins can delete platform settings; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can delete platform settings" ON "Binara_fashion".platform_settings FOR DELETE USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: user_roles Super admins can delete roles; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can delete roles" ON "Binara_fashion".user_roles FOR DELETE USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: platform_settings Super admins can insert platform settings; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can insert platform settings" ON "Binara_fashion".platform_settings FOR INSERT WITH CHECK ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: user_roles Super admins can manage roles; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can manage roles" ON "Binara_fashion".user_roles FOR INSERT WITH CHECK ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: faqs Super admins can update all faqs; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can update all faqs" ON "Binara_fashion".faqs FOR UPDATE USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: orders Super admins can update all orders; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can update all orders" ON "Binara_fashion".orders FOR UPDATE USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: profiles Super admins can update all profiles; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can update all profiles" ON "Binara_fashion".profiles FOR UPDATE USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: settings Super admins can update all settings; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can update all settings" ON "Binara_fashion".settings FOR UPDATE USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: platform_settings Super admins can update platform settings; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can update platform settings" ON "Binara_fashion".platform_settings FOR UPDATE USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: user_roles Super admins can update roles; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can update roles" ON "Binara_fashion".user_roles FOR UPDATE USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: ai_usage_logs Super admins can view all ai usage logs; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can view all ai usage logs" ON "Binara_fashion".ai_usage_logs FOR SELECT USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: contact_usage Super admins can view all contact usage; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can view all contact usage" ON "Binara_fashion".contact_usage FOR SELECT TO authenticated USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: conversations Super admins can view all conversations; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can view all conversations" ON "Binara_fashion".conversations FOR SELECT USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: faqs Super admins can view all faqs; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can view all faqs" ON "Binara_fashion".faqs FOR SELECT USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: orders Super admins can view all orders; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can view all orders" ON "Binara_fashion".orders FOR SELECT USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: profiles Super admins can view all profiles; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can view all profiles" ON "Binara_fashion".profiles FOR SELECT USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: user_wsender_sessions Super admins can view all sessions; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can view all sessions" ON "Binara_fashion".user_wsender_sessions FOR SELECT USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: settings Super admins can view all settings; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can view all settings" ON "Binara_fashion".settings FOR SELECT USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: staff_accounts Super admins can view all staff; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can view all staff" ON "Binara_fashion".staff_accounts FOR SELECT USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: platform_settings Super admins can view platform settings; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins can view platform settings" ON "Binara_fashion".platform_settings FOR SELECT USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: leads Super admins view all leads; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Super admins view all leads" ON "Binara_fashion".leads FOR SELECT TO authenticated USING ("Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role));


--
-- Name: conversations Users can create own conversations; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can create own conversations" ON "Binara_fashion".conversations FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: faqs Users can create own faqs; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can create own faqs" ON "Binara_fashion".faqs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: orders Users can create own orders; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can create own orders" ON "Binara_fashion".orders FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: products Users can create own products; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can create own products" ON "Binara_fashion".products FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_wsender_sessions Users can create own sessions; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can create own sessions" ON "Binara_fashion".user_wsender_sessions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: settings Users can create own settings; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can create own settings" ON "Binara_fashion".settings FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: conversations Users can delete own conversations; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can delete own conversations" ON "Binara_fashion".conversations FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: faqs Users can delete own faqs; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can delete own faqs" ON "Binara_fashion".faqs FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: orders Users can delete own orders; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can delete own orders" ON "Binara_fashion".orders FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: products Users can delete own products; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can delete own products" ON "Binara_fashion".products FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: user_wsender_sessions Users can delete own sessions; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can delete own sessions" ON "Binara_fashion".user_wsender_sessions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: settings Users can delete own settings; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can delete own settings" ON "Binara_fashion".settings FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: fcm_tokens Users can delete own tokens; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can delete own tokens" ON "Binara_fashion".fcm_tokens FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: chat_takeovers Users can delete their own takeovers; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can delete their own takeovers" ON "Binara_fashion".chat_takeovers FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: fcm_tokens Users can insert own tokens; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can insert own tokens" ON "Binara_fashion".fcm_tokens FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: chat_takeovers Users can insert their own takeovers; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can insert their own takeovers" ON "Binara_fashion".chat_takeovers FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: conversations Users can update own conversations; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can update own conversations" ON "Binara_fashion".conversations FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: faqs Users can update own faqs; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can update own faqs" ON "Binara_fashion".faqs FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: orders Users can update own orders; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can update own orders" ON "Binara_fashion".orders FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: products Users can update own products; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can update own products" ON "Binara_fashion".products FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: user_wsender_sessions Users can update own sessions; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can update own sessions" ON "Binara_fashion".user_wsender_sessions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: settings Users can update own settings; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can update own settings" ON "Binara_fashion".settings FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: fcm_tokens Users can update own tokens; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can update own tokens" ON "Binara_fashion".fcm_tokens FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can update their own profile" ON "Binara_fashion".profiles FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: chat_takeovers Users can update their own takeovers; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can update their own takeovers" ON "Binara_fashion".chat_takeovers FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: ai_usage_logs Users can view own ai usage logs; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can view own ai usage logs" ON "Binara_fashion".ai_usage_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: contact_usage Users can view own contact usage; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can view own contact usage" ON "Binara_fashion".contact_usage FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR "Binara_fashion".is_staff_of(auth.uid(), user_id)));


--
-- Name: conversations Users can view own conversations; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can view own conversations" ON "Binara_fashion".conversations FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: faq_usage_logs Users can view own faq usage logs; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can view own faq usage logs" ON "Binara_fashion".faq_usage_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: faqs Users can view own faqs; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can view own faqs" ON "Binara_fashion".faqs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: orders Users can view own orders; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can view own orders" ON "Binara_fashion".orders FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: products Users can view own products; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can view own products" ON "Binara_fashion".products FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_roles Users can view own roles; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can view own roles" ON "Binara_fashion".user_roles FOR SELECT USING (((auth.uid() = user_id) OR "Binara_fashion".has_role(auth.uid(), 'super_admin'::"Binara_fashion".app_role)));


--
-- Name: user_wsender_sessions Users can view own sessions; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can view own sessions" ON "Binara_fashion".user_wsender_sessions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: settings Users can view own settings; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can view own settings" ON "Binara_fashion".settings FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: fcm_tokens Users can view own tokens; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can view own tokens" ON "Binara_fashion".fcm_tokens FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can view their own profile" ON "Binara_fashion".profiles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: chat_takeovers Users can view their own takeovers; Type: POLICY; Schema: Binara_fashion; Owner: -
--

CREATE POLICY "Users can view their own takeovers" ON "Binara_fashion".chat_takeovers FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: ai_usage_logs; Type: ROW SECURITY; Schema: Binara_fashion; Owner: -
--

ALTER TABLE "Binara_fashion".ai_usage_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_takeovers; Type: ROW SECURITY; Schema: Binara_fashion; Owner: -
--

ALTER TABLE "Binara_fashion".chat_takeovers ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_usage; Type: ROW SECURITY; Schema: Binara_fashion; Owner: -
--

ALTER TABLE "Binara_fashion".contact_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: Binara_fashion; Owner: -
--

ALTER TABLE "Binara_fashion".conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: faq_usage_logs; Type: ROW SECURITY; Schema: Binara_fashion; Owner: -
--

ALTER TABLE "Binara_fashion".faq_usage_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: faqs; Type: ROW SECURITY; Schema: Binara_fashion; Owner: -
--

ALTER TABLE "Binara_fashion".faqs ENABLE ROW LEVEL SECURITY;

--
-- Name: fcm_tokens; Type: ROW SECURITY; Schema: Binara_fashion; Owner: -
--

ALTER TABLE "Binara_fashion".fcm_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: leads; Type: ROW SECURITY; Schema: Binara_fashion; Owner: -
--

ALTER TABLE "Binara_fashion".leads ENABLE ROW LEVEL SECURITY;

--
-- Name: message_queue; Type: ROW SECURITY; Schema: Binara_fashion; Owner: -
--

ALTER TABLE "Binara_fashion".message_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: Binara_fashion; Owner: -
--

ALTER TABLE "Binara_fashion".orders ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_settings; Type: ROW SECURITY; Schema: Binara_fashion; Owner: -
--

ALTER TABLE "Binara_fashion".platform_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: Binara_fashion; Owner: -
--

ALTER TABLE "Binara_fashion".products ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: Binara_fashion; Owner: -
--

ALTER TABLE "Binara_fashion".profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: settings; Type: ROW SECURITY; Schema: Binara_fashion; Owner: -
--

ALTER TABLE "Binara_fashion".settings ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_accounts; Type: ROW SECURITY; Schema: Binara_fashion; Owner: -
--

ALTER TABLE "Binara_fashion".staff_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: Binara_fashion; Owner: -
--

ALTER TABLE "Binara_fashion".user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_wsender_sessions; Type: ROW SECURITY; Schema: Binara_fashion; Owner: -
--

ALTER TABLE "Binara_fashion".user_wsender_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "Binara_fashion"; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA "Binara_fashion" TO anon;
GRANT USAGE ON SCHEMA "Binara_fashion" TO authenticated;
GRANT USAGE ON SCHEMA "Binara_fashion" TO service_role;


--
-- Name: FUNCTION can_read_usage(_user_id uuid); Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON FUNCTION "Binara_fashion".can_read_usage(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION "Binara_fashion".can_read_usage(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION "Binara_fashion".can_read_usage(_user_id uuid) TO service_role;


--
-- Name: FUNCTION enforce_order_limit(); Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON FUNCTION "Binara_fashion".enforce_order_limit() TO anon;
GRANT ALL ON FUNCTION "Binara_fashion".enforce_order_limit() TO authenticated;
GRANT ALL ON FUNCTION "Binara_fashion".enforce_order_limit() TO service_role;


--
-- Name: FUNCTION get_ai_message_usage(_user_id uuid, _since timestamp with time zone); Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON FUNCTION "Binara_fashion".get_ai_message_usage(_user_id uuid, _since timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION "Binara_fashion".get_ai_message_usage(_user_id uuid, _since timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION "Binara_fashion".get_ai_message_usage(_user_id uuid, _since timestamp with time zone) TO service_role;


--
-- Name: FUNCTION get_contact_usage(_user_id uuid, _since timestamp with time zone); Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON FUNCTION "Binara_fashion".get_contact_usage(_user_id uuid, _since timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION "Binara_fashion".get_contact_usage(_user_id uuid, _since timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION "Binara_fashion".get_contact_usage(_user_id uuid, _since timestamp with time zone) TO service_role;


--
-- Name: FUNCTION get_staff_owner_id(_user_id uuid); Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON FUNCTION "Binara_fashion".get_staff_owner_id(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION "Binara_fashion".get_staff_owner_id(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION "Binara_fashion".get_staff_owner_id(_user_id uuid) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON FUNCTION "Binara_fashion".handle_new_user() TO anon;
GRANT ALL ON FUNCTION "Binara_fashion".handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION "Binara_fashion".handle_new_user() TO service_role;


--
-- Name: FUNCTION handle_new_user_role(); Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON FUNCTION "Binara_fashion".handle_new_user_role() TO anon;
GRANT ALL ON FUNCTION "Binara_fashion".handle_new_user_role() TO authenticated;
GRANT ALL ON FUNCTION "Binara_fashion".handle_new_user_role() TO service_role;


--
-- Name: FUNCTION handle_new_user_settings(); Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON FUNCTION "Binara_fashion".handle_new_user_settings() TO anon;
GRANT ALL ON FUNCTION "Binara_fashion".handle_new_user_settings() TO authenticated;
GRANT ALL ON FUNCTION "Binara_fashion".handle_new_user_settings() TO service_role;


--
-- Name: FUNCTION has_role(_user_id uuid, _role "Binara_fashion".app_role); Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON FUNCTION "Binara_fashion".has_role(_user_id uuid, _role "Binara_fashion".app_role) TO anon;
GRANT ALL ON FUNCTION "Binara_fashion".has_role(_user_id uuid, _role "Binara_fashion".app_role) TO authenticated;
GRANT ALL ON FUNCTION "Binara_fashion".has_role(_user_id uuid, _role "Binara_fashion".app_role) TO service_role;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON FUNCTION "Binara_fashion".is_admin() TO anon;
GRANT ALL ON FUNCTION "Binara_fashion".is_admin() TO authenticated;
GRANT ALL ON FUNCTION "Binara_fashion".is_admin() TO service_role;


--
-- Name: FUNCTION is_staff_of(_staff_user_id uuid, _owner_id uuid); Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON FUNCTION "Binara_fashion".is_staff_of(_staff_user_id uuid, _owner_id uuid) TO anon;
GRANT ALL ON FUNCTION "Binara_fashion".is_staff_of(_staff_user_id uuid, _owner_id uuid) TO authenticated;
GRANT ALL ON FUNCTION "Binara_fashion".is_staff_of(_staff_user_id uuid, _owner_id uuid) TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON FUNCTION "Binara_fashion".update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION "Binara_fashion".update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION "Binara_fashion".update_updated_at_column() TO service_role;


--
-- Name: TABLE ai_usage_logs; Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON TABLE "Binara_fashion".ai_usage_logs TO anon;
GRANT ALL ON TABLE "Binara_fashion".ai_usage_logs TO authenticated;
GRANT ALL ON TABLE "Binara_fashion".ai_usage_logs TO service_role;


--
-- Name: TABLE chat_takeovers; Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON TABLE "Binara_fashion".chat_takeovers TO anon;
GRANT ALL ON TABLE "Binara_fashion".chat_takeovers TO authenticated;
GRANT ALL ON TABLE "Binara_fashion".chat_takeovers TO service_role;


--
-- Name: TABLE contact_usage; Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON TABLE "Binara_fashion".contact_usage TO anon;
GRANT ALL ON TABLE "Binara_fashion".contact_usage TO authenticated;
GRANT ALL ON TABLE "Binara_fashion".contact_usage TO service_role;


--
-- Name: TABLE conversations; Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON TABLE "Binara_fashion".conversations TO anon;
GRANT ALL ON TABLE "Binara_fashion".conversations TO authenticated;
GRANT ALL ON TABLE "Binara_fashion".conversations TO service_role;


--
-- Name: TABLE faq_usage_logs; Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON TABLE "Binara_fashion".faq_usage_logs TO anon;
GRANT ALL ON TABLE "Binara_fashion".faq_usage_logs TO authenticated;
GRANT ALL ON TABLE "Binara_fashion".faq_usage_logs TO service_role;


--
-- Name: TABLE faqs; Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON TABLE "Binara_fashion".faqs TO anon;
GRANT ALL ON TABLE "Binara_fashion".faqs TO authenticated;
GRANT ALL ON TABLE "Binara_fashion".faqs TO service_role;


--
-- Name: TABLE fcm_tokens; Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON TABLE "Binara_fashion".fcm_tokens TO anon;
GRANT ALL ON TABLE "Binara_fashion".fcm_tokens TO authenticated;
GRANT ALL ON TABLE "Binara_fashion".fcm_tokens TO service_role;


--
-- Name: TABLE leads; Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON TABLE "Binara_fashion".leads TO anon;
GRANT ALL ON TABLE "Binara_fashion".leads TO authenticated;
GRANT ALL ON TABLE "Binara_fashion".leads TO service_role;


--
-- Name: TABLE message_queue; Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON TABLE "Binara_fashion".message_queue TO anon;
GRANT ALL ON TABLE "Binara_fashion".message_queue TO authenticated;
GRANT ALL ON TABLE "Binara_fashion".message_queue TO service_role;


--
-- Name: TABLE orders; Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON TABLE "Binara_fashion".orders TO anon;
GRANT ALL ON TABLE "Binara_fashion".orders TO authenticated;
GRANT ALL ON TABLE "Binara_fashion".orders TO service_role;


--
-- Name: TABLE platform_settings; Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON TABLE "Binara_fashion".platform_settings TO anon;
GRANT ALL ON TABLE "Binara_fashion".platform_settings TO authenticated;
GRANT ALL ON TABLE "Binara_fashion".platform_settings TO service_role;


--
-- Name: TABLE products; Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON TABLE "Binara_fashion".products TO anon;
GRANT ALL ON TABLE "Binara_fashion".products TO authenticated;
GRANT ALL ON TABLE "Binara_fashion".products TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON TABLE "Binara_fashion".profiles TO anon;
GRANT ALL ON TABLE "Binara_fashion".profiles TO authenticated;
GRANT ALL ON TABLE "Binara_fashion".profiles TO service_role;


--
-- Name: TABLE settings; Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON TABLE "Binara_fashion".settings TO anon;
GRANT ALL ON TABLE "Binara_fashion".settings TO authenticated;
GRANT ALL ON TABLE "Binara_fashion".settings TO service_role;


--
-- Name: TABLE staff_accounts; Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON TABLE "Binara_fashion".staff_accounts TO anon;
GRANT ALL ON TABLE "Binara_fashion".staff_accounts TO authenticated;
GRANT ALL ON TABLE "Binara_fashion".staff_accounts TO service_role;


--
-- Name: TABLE user_roles; Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON TABLE "Binara_fashion".user_roles TO anon;
GRANT ALL ON TABLE "Binara_fashion".user_roles TO authenticated;
GRANT ALL ON TABLE "Binara_fashion".user_roles TO service_role;


--
-- Name: TABLE user_wsender_sessions; Type: ACL; Schema: Binara_fashion; Owner: -
--

GRANT ALL ON TABLE "Binara_fashion".user_wsender_sessions TO anon;
GRANT ALL ON TABLE "Binara_fashion".user_wsender_sessions TO authenticated;
GRANT ALL ON TABLE "Binara_fashion".user_wsender_sessions TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: Binara_fashion; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "Binara_fashion" GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "Binara_fashion" GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "Binara_fashion" GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "Binara_fashion" GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: Binara_fashion; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA "Binara_fashion" GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA "Binara_fashion" GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA "Binara_fashion" GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA "Binara_fashion" GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: Binara_fashion; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "Binara_fashion" GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "Binara_fashion" GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "Binara_fashion" GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "Binara_fashion" GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: Binara_fashion; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA "Binara_fashion" GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA "Binara_fashion" GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA "Binara_fashion" GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA "Binara_fashion" GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: Binara_fashion; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "Binara_fashion" GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "Binara_fashion" GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "Binara_fashion" GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "Binara_fashion" GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: Binara_fashion; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA "Binara_fashion" GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA "Binara_fashion" GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA "Binara_fashion" GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA "Binara_fashion" GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--




-- Auth triggers for new user creation in Binara_fashion
DROP TRIGGER IF EXISTS on_auth_user_created_binara_fashion ON auth.users;
CREATE TRIGGER on_auth_user_created_binara_fashion
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION "Binara_fashion".handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_created_role_binara_fashion ON auth.users;
CREATE TRIGGER on_auth_user_created_role_binara_fashion
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION "Binara_fashion".handle_new_user_role();

DROP TRIGGER IF EXISTS on_auth_user_created_settings_binara_fashion ON auth.users;
CREATE TRIGGER on_auth_user_created_settings_binara_fashion
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION "Binara_fashion".handle_new_user_settings();

-- Grants
GRANT USAGE ON SCHEMA "Binara_fashion" TO anon, authenticated, service_role, postgres;
GRANT ALL ON ALL TABLES IN SCHEMA "Binara_fashion" TO anon, authenticated, service_role, postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA "Binara_fashion" TO anon, authenticated, service_role, postgres;
GRANT ALL ON ALL ROUTINES IN SCHEMA "Binara_fashion" TO anon, authenticated, service_role, postgres;

ALTER DEFAULT PRIVILEGES IN SCHEMA "Binara_fashion" GRANT ALL ON TABLES TO anon, authenticated, service_role, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA "Binara_fashion" GRANT ALL ON SEQUENCES TO anon, authenticated, service_role, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA "Binara_fashion" GRANT ALL ON ROUTINES TO anon, authenticated, service_role, postgres;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE "Binara_fashion".conversations;
ALTER TABLE "Binara_fashion".conversations REPLICA IDENTITY FULL;

-- Copy seed/initial data from public
INSERT INTO "Binara_fashion".platform_settings SELECT * FROM public.platform_settings ON CONFLICT DO NOTHING;
INSERT INTO "Binara_fashion".profiles SELECT * FROM public.profiles ON CONFLICT DO NOTHING;
INSERT INTO "Binara_fashion".settings SELECT * FROM public.settings ON CONFLICT DO NOTHING;
INSERT INTO "Binara_fashion".user_roles SELECT * FROM public.user_roles ON CONFLICT DO NOTHING;
INSERT INTO "Binara_fashion".user_wsender_sessions SELECT * FROM public.user_wsender_sessions ON CONFLICT DO NOTHING;

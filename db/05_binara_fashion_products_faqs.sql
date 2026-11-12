-- ==============================================================================
-- BINARA FASHION - Products and FAQs SQL Dump / Migration Script
-- Schema: "Binara_fashion"
-- Target Tables: "Binara_fashion".products (5 items), "Binara_fashion".faqs (23 items)
-- Target User: 8ec761ff-b716-411b-85d2-1b56980d1e8a (qwe@buildstart.io)
-- Safe for execution: Uses IF NOT EXISTS and ON CONFLICT (id) DO UPDATE
-- ==============================================================================

-- 1. Ensure Schema Exists
CREATE SCHEMA IF NOT EXISTS "Binara_fashion";

-- 2. Create "products" Table (if not exists)
CREATE TABLE IF NOT EXISTS "Binara_fashion".products (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    description text,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    product_type text DEFAULT 'physical'::text NOT NULL CHECK (product_type IN ('physical', 'digital')),
    variations jsonb DEFAULT '[]'::jsonb,
    images text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    delivery_price numeric DEFAULT 0,
    video_url text
);

-- 3. Create "faqs" Table (if not exists)
CREATE TABLE IF NOT EXISTS "Binara_fashion".faqs (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    question text NOT NULL,
    answer text NOT NULL,
    product_id uuid REFERENCES "Binara_fashion".products(id) ON DELETE SET NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    is_tracked boolean DEFAULT false NOT NULL,
    media_urls text[] DEFAULT '{}'::text[] NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_binara_products_user_active ON "Binara_fashion".products(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_binara_faqs_user_active ON "Binara_fashion".faqs(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_binara_faqs_product_id ON "Binara_fashion".faqs(product_id);

-- Clean up placeholder products if any exist
DELETE FROM "Binara_fashion".products WHERE user_id = '8ec761ff-b716-411b-85d2-1b56980d1e8a' AND id NOT IN (
  '17a2553e-4b74-42b3-9478-5e9246cd0745',
  '06e65fc2-cc06-45c4-8d6c-1cfbc0862f54',
  '84b4ce51-a743-4ca3-977e-38e1b15fa324',
  'ae224639-794a-4449-8afb-02599f20ac5d',
  '69ac700f-54d3-459a-a81d-fb8b9da91cbf'
);

-- Update addon_faqs for user so they stay within allowed dashboard limits
UPDATE "Binara_fashion".profiles
SET addon_faqs = GREATEST(addon_faqs, 30),
    updated_at = now()
WHERE user_id = '8ec761ff-b716-411b-85d2-1b56980d1e8a';

-- ==============================================================================
-- 4. INSERT DATA: "Binara_fashion".products (5 Products)
-- ==============================================================================

INSERT INTO "Binara_fashion".products (id, name, description, price, product_type, variations, images, is_active, created_at, updated_at, user_id, delivery_price, video_url) VALUES ('17a2553e-4b74-42b3-9478-5e9246cd0745', 'Kyela Brand Single Jersey Cotton Shorts', '❤🔥Kyela Brand short ❤🔥

💁♀️ඉන 26 සිට 42 දක්වා (16 අගල් උස)
💁♀️සින්ගල් ජේසි කොට්න් මැටිරියල්



💁♀️Unisex ශෝට් 5ක් 2500/=  

💁♀️Unisex  ශෝට් 10ක 4500/=

💁♀️මෙ ඔෆර් එක දින 07ක් සදහ පමනි.
💁♀️ඩිලිවරි ෆ්රී/-

🌸අපගේ වෙනත් Item සදහා Watsap catalog බලන්න 🌸', 2500.00, 'physical', '[]', '{https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/20ac621c-ab46-4864-b250-8f535e6ef0e9.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/a14a5bba-862b-498c-81d9-73992d487b3c.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/1ff1297d-4001-48d2-883b-0124efc19cca.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/338efa9e-3185-403a-92db-0abf51dc98e5.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/0389248a-5130-453b-9c60-f512c3bf37f2.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/4c63cce7-d6d0-4fce-87ec-0d669c8079ff.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/1818ab15-23e3-4f56-9bf2-646572e05745.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/a56a8bfe-e106-4b28-9929-2d517e195c12.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/47d3a6d2-c27a-4f8b-a9ea-23bf63b38119.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/0000d99a-7fdd-411b-8b68-a5b9f3093c4f.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/61ff4194-d910-41a3-a227-5e0a96c99294.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/518f4a34-2b3e-4b8c-bc50-93f5626922ba.jpeg}', true, '2026-10-27 12:41:59.773735+00', '2026-11-03 11:28:06.001352+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', 0, NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  product_type = EXCLUDED.product_type,
  variations = EXCLUDED.variations,
  images = EXCLUDED.images,
  is_active = EXCLUDED.is_active,
  delivery_price = EXCLUDED.delivery_price,
  video_url = EXCLUDED.video_url,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".products (id, name, description, price, product_type, variations, images, is_active, created_at, updated_at, user_id, delivery_price, video_url) VALUES ('06e65fc2-cc06-45c4-8d6c-1cfbc0862f54', 'Rib Jacquard Shorts', '✌️ Unisex short✌️

🚚 Deliver free🚚
 05ම 2700යි!
10ම් 5100 යි!

🩳 ගැහැනු පිරිමි දෙගොල්ලන්ටම ඇදිය හැක.
🩳 රිබ් ජැකුවර්ඩ් මැටීරියල්
🩳 උස අගල්  16
🩳 ඉන 26 සිට 42 දක්වා ෆ්රී සයිස්

_(ශොර්ට් 5 ට අඩුවෙන් ලබා ගන්නා සෑම ඔඩරයකටම ඩිලිවරි චාජ් 450 ක් එකතු වේ..)_', 2700.00, 'physical', '[]', '{https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/ccbedbad-ece2-4ab5-9ba6-887a23dd6720.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/b29ddb39-9ea3-470c-b5fb-8e19501477a5.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/1cc73f45-fbca-47f6-aacb-7ba027969be1.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/ebf53300-1270-429d-8414-b5b1ebe64070.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/8cb2304a-43b1-4662-8592-1a6916ea1aee.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/6a62db0f-5dc1-4124-b07b-c96be5e9f984.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/c99ea9d2-db56-4755-b07b-2c7a0779b18d.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/223c5354-f085-4e60-9316-0d0d9ae8e9a2.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/1e8c0112-e09c-4c3b-bfe4-7bba3405edd8.jpeg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/4af72778-a586-4add-bd01-6c51fd22ba49.jpeg}', true, '2026-10-27 12:39:52.587777+00', '2026-11-01 18:30:42.653776+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', 0, NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  product_type = EXCLUDED.product_type,
  variations = EXCLUDED.variations,
  images = EXCLUDED.images,
  is_active = EXCLUDED.is_active,
  delivery_price = EXCLUDED.delivery_price,
  video_url = EXCLUDED.video_url,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".products (id, name, description, price, product_type, variations, images, is_active, created_at, updated_at, user_id, delivery_price, video_url) VALUES ('84b4ce51-a743-4ca3-977e-38e1b15fa324', 'SingleJersey Cotton උස අගල් 20', '🩳 Unisex short 🩳

🔥ඩිලිවරි ෆ්රී 🔥

04ම 2650 !!
10ම 6200  !!
🤷♀️කැමති පාටක් තෝරගන්න පුලුවන් 🤷♀️

🤷♀️ගැහැනු පිරිමි දෙගෙගොල්ලන්ටම අදින්න පුලුවන් ...🤷♀️

👉ඉන 26 සිට 42දක්වා  ෆ්රී සයිස්
👉උස අගල් 20
👉සින්ගල් ජේසි කොට්න් මැටීරියල් 

🚚ලන්කාවේ ඕනම තැනකට කෑශ් ඔන් ඩිලිවරි සේවාව 🚚
🌸අපගේ වෙනත් Item සදහා Watsap catalog බලන්න 🌸', 2650.00, 'physical', '[]', '{https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/262a67f3-9615-4a04-91fe-dcb2c668d763.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/32976877-dd44-49fa-8001-411360660a65.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/ac37bdca-e337-48b6-bc99-9454e59f67c2.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/aa27f2e3-c232-4ccf-9ee4-a4347c32c80f.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/99bfbdb2-54c5-4306-9277-0ab41fc1d26e.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/95f70df1-f6cb-4457-b52e-a6a665093de3.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/90d9da33-6d7d-4707-9f18-7108fbcd797a.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/1d988c27-9247-44ec-b1c5-aa6be5d2b84e.jpg}', true, '2026-11-02 05:34:53.825788+00', '2026-11-03 02:08:37.503221+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', 0, NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  product_type = EXCLUDED.product_type,
  variations = EXCLUDED.variations,
  images = EXCLUDED.images,
  is_active = EXCLUDED.is_active,
  delivery_price = EXCLUDED.delivery_price,
  video_url = EXCLUDED.video_url,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".products (id, name, description, price, product_type, variations, images, is_active, created_at, updated_at, user_id, delivery_price, video_url) VALUES ('ae224639-794a-4449-8afb-02599f20ac5d', 'පොප්කෝන්  ශෝර්ට් උස අගල්  18 ', '🩳 පොප්කෝන්  ශෝර්ට් 🩳  

🚚Deliver free 🔥Delivery free 🚚

 🌿කැමති පාට 4 ගන්න පුලුවන්🌿
  🔥ශෝර්ට් 04ම 2600 යි...🔥
 
🍬පොප් කෝන් පුල් කොට්න් මැටීරියල් 
🍬ඉන 26 සිට 40 දක්වා ෆ්රී සයිස්
🍬උස අගල්  18 යි..

👉👉👉තොග සීමිතයි ඉක්මනින් ඔඩර් දාන්න....
🌸අපගේ වෙනත් Item සදහා watsap catalog බලන්න 🌸', 2600.00, 'physical', '[]', '{https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/128f610d-1749-475a-9d94-fd3669bed772.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/15efcfce-d943-4ec1-b9cc-ee6c4a63dc51.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/aba5044b-7800-4a04-9255-d9ca2a7e62d7.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/50a9c071-6259-450d-a3bc-ec22ce6c21d1.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/65dd4879-f188-446f-8453-233b2b1369b1.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/66c2141f-61e7-4555-9a65-95913099b3a6.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/b093932c-d34a-4c89-9044-4f225ae00936.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/1d0b4b3f-c904-43a1-9a0c-cb8ab83640b4.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/b1969839-6653-4dab-9da5-4bd3bef960e9.jpg}', true, '2026-11-02 05:31:24.589101+00', '2026-11-03 02:03:58.268764+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', 0, NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  product_type = EXCLUDED.product_type,
  variations = EXCLUDED.variations,
  images = EXCLUDED.images,
  is_active = EXCLUDED.is_active,
  delivery_price = EXCLUDED.delivery_price,
  video_url = EXCLUDED.video_url,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".products (id, name, description, price, product_type, variations, images, is_active, created_at, updated_at, user_id, delivery_price, video_url) VALUES ('69ac700f-54d3-459a-a81d-fb8b9da91cbf', 'පොප්කොන් ශෝර්ට් උස අගල් 16', '❤🔥පොප්කෝන්  ශෝර්ට් ❤🔥

🚚Deliver free 🔥Delivery free 🚚

 🌿කැමති පාට 5ක් ගන්න පුලුවන්🌿

  🔥ශෝර්ට් 05ම 2600 යි...🔥
🔥ශෝර්ට් 10ම 4600යි....🔥
 
🍬පොප් කෝන් පුල් කොට්න් මැටීරියල් 
🍬ඉන 28 සිට 44 දක්වා ෆ්රී සයිස්
🍬උස අගල්  16 යි..

👉👉👉තොග සීමිතයි ඉක්මනින් ඔඩර් දාන්න....', 2600.00, 'physical', '[]', '{https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/07c7bbc3-35fa-472f-b809-5c206f6caffc.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/66e69069-c1bd-498e-aab8-536b83f751f5.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/619f7616-35cb-4183-a6aa-3f78425ef62d.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/ece845fd-25ca-41c5-af3c-a10992d8c289.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/6e2f7107-c09d-4b69-bdfa-5af2dc28156b.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/6a341a74-9e85-45a6-9154-89dda07ecc74.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/55e03563-bebf-4597-94b7-e7a762c5cfce.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/540a1353-2760-4377-98a8-5f3ab1ad5bd3.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/a3b9f071-de2d-44a0-877b-d3988176b53c.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/1e99fcaf-9960-48e7-9120-faaa6907a8ce.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/6b7651b0-d737-443f-95f1-ac0b4dde1d51.jpg,https://supabase.buildstart.io/storage/v1/object/public/biz-9fed10e6-72a8-43b4-afc1-ad4055c2371e/products/e5450131-2a64-470f-ac12-113a892a32ee.jpg}', true, '2026-11-01 15:33:14.797981+00', '2026-11-03 11:28:18.424055+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', 0, NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  product_type = EXCLUDED.product_type,
  variations = EXCLUDED.variations,
  images = EXCLUDED.images,
  is_active = EXCLUDED.is_active,
  delivery_price = EXCLUDED.delivery_price,
  video_url = EXCLUDED.video_url,
  user_id = EXCLUDED.user_id,
  updated_at = now();

-- ==============================================================================
-- 5. INSERT DATA: "Binara_fashion".faqs (23 FAQs)
-- ==============================================================================

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('fd087d11-04c4-4eae-b8e9-167770ba5f62', 'ඔයාලා ළඟ මොනවද තියෙන්නේ?', 'අපේ ළඟ කෙටි කලිසම් වර්ග දෙකක් තියෙනවා 😊 කැමති නම් වර්ග දෙකේම පින්තූර සහ විස්තර එවන්නම්.', NULL, true, '2026-10-27 12:42:30.415481+00', '2026-10-27 12:42:30.415481+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('8dcd2c34-c42a-415b-84b8-dd4bd4494204', 'කලිසම්වල පින්තූර බලන්න පුළුවන්ද?', 'ඔව්, පුළුවන්. ඔයාට බලන්න ඕන වර්ගය කියන්නකෝ. ඒකේ පින්තූර සහ පාට ටික එවන්නම්.', NULL, true, '2026-10-27 12:42:43.265371+00', '2026-10-27 12:42:43.265371+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('f9f897ba-6820-43d0-b5a8-8ce6c882c6c3', 'තියෙන පාට මොනවද?', 'ඔයා තෝරන කලිසම් වර්ගයට අදාළ පාට අංක එක්ක පින්තූර එවන්නම්. කැමති පාට අංකය කියන්නකෝ.', NULL, true, '2026-10-27 12:42:53.961865+00', '2026-10-27 12:42:53.961865+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('c702dd93-4b18-4a6e-a96f-5341c142e567', 'එක පැකේජයකට පාට කිහිපයක් තෝරන්න පුළුවන්ද?', 'ඔව්. කැමති පාට අංක සහ එක් එක් පාටින් ඕන ගණන කියන්න. පැකේජයේ මුළු ගණනට ඒවා ගැළපෙනවද කියලා බලලා කියන්නම්.', NULL, true, '2026-10-27 12:43:04.043346+00', '2026-10-27 12:43:04.043346+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('1030c597-6096-475c-9186-7d50cd2b29ab', 'මොන ප්රමාණවලින් තියෙනවද?', 'ඔයා කැමති කලිසම් වර්ගය කියන්නකෝ. ඒකට තියෙන ප්රමාණ සහ මිනුම් එවන්නම්.', NULL, true, '2026-10-27 12:43:17.762728+00', '2026-10-27 12:43:17.762728+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('ed76eee2-006b-421b-9a11-525052f76760', '6. මට ගැළපෙන ප්රමාණය තෝරගන්නේ කොහොමද?', 'ඔයාගේ ඉණ මිනුම කියන්න පුළුවන්ද? අපේ ප්රමාණ මිනුම් එක්ක බලලා තෝරගන්න උදව් කරන්නම්.', NULL, true, '2026-10-27 12:43:31.892365+00', '2026-10-27 12:43:31.892365+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('070775b8-de87-470e-b028-345f96f43818', 'රෙදි වර්ගය මොකක්ද?', 'ඔයා බලන කලිසම් වර්ගය කියන්නකෝ. ඒකේ රෙදි වර්ගය සහ විස්තර එවන්නම්.', NULL, true, '2026-10-27 12:44:00.238866+00', '2026-10-27 12:44:00.238866+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('1a2b2c0e-6f45-4273-af67-7c37ac7f24a8', 'පැකේජ් මිල කීයද?', 'මිල කලිසම් වර්ගය සහ තෝරන පැකේජය අනුව වෙනස් වෙනවා. ඔයාට ඕන වර්ගයයි, ගණනයි කියන්න; ඒකට අදාළ මිල එවන්නම්.', NULL, true, '2026-10-27 12:44:20.974881+00', '2026-10-27 12:44:20.974881+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('07cdca9a-300d-4977-ad06-8665762ede3b', 'කලිසම් වර්ග දෙකම එකම පැකේජයකට ගන්න පුළුවන්ද?', 'ඒක අපේ කෙනෙක් එක්ක තහවුරු කරලා ඔයාට කියන්නම්. ඔයාට ඕන වර්ග දෙක සහ ගණන් එවන්නකෝ.', NULL, true, '2026-10-27 12:44:30.320267+00', '2026-10-27 12:44:30.320267+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('20eb69a4-1061-4146-834e-75e91f232396', 'එක කලිසමක් විතරක් ගන්න පුළුවන්ද?', 'අවම ඇණවුම් ගණන ගැන අපේ කෙනෙක් තහවුරු කරලා ඔයාට කියන්නම්.', NULL, true, '2026-10-27 12:44:42.775748+00', '2026-10-27 12:44:42.775748+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('dd9551ac-bba5-4771-8f8e-7ec94ad39400', 'බෙදාහැරීමේ ගාස්තුව කීයද?', 'කලිසම් 5ට අඩු ඇණවුමකට බෙදාහැරීමේ ගාස්තුව රු.450යි. මේ ගාස්තුව එක ඇණවුමකට එක වරක් පමණයි', NULL, true, '2026-10-27 12:44:52.089715+00', '2026-10-27 12:44:52.089715+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('6c8c0dd5-9ef6-41b7-803a-9610ed51e747', 'කලිසම් 5ක් ගත්තොත් බෙදාහැරීම නොමිලේද?', 'ඔව්, කලිසම් 5ක් හෝ ඊට වැඩි ඇණවුම් සඳහා බෙදාහැරීම නොමිලේ', NULL, true, '2026-10-27 12:45:03.641737+00', '2026-10-27 12:45:03.641737+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('086d55f5-06f3-42f6-9eb3-73e937085102', 'මගේ ප්රදේශයට බෙදාහරිනවද?', 'ඔයාගේ නගරය හෝ ප්රදේශය කියන්නකෝ. බෙදාහැරීමේ හැකියාව තහවුරු කරලා කියන්න', NULL, true, '2026-10-27 12:45:15.149786+00', '2026-10-27 12:45:15.149786+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('bede48c7-e863-4d1f-afc0-b7cec9337157', 'ගෙවන්න පුළුවන් කොහොමද?', 'ඔයාට කැමති ගෙවීම් ක්රමය කියන්නකෝ. ඒ ක්රමය මේ ඇණවුමට ලබාදිය හැකිද කියලා තහවුරු කරලා කියන්නම්', NULL, true, '2026-10-27 12:45:38.379982+00', '2026-10-27 12:45:38.379982+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('54f75af8-dae1-4028-9f02-6628eb1d82b8', 'බැංකුවට මුදල් දැම්මට පස්සේ මොකද කරන්න ඕන?', 'ගෙවීමේ රිසිට්පතේ පින්තූරයක් මෙතැනට එවන්න. අපේ කෙනෙක් ගෙවීම පරීක්ෂා කරලා ඔයාට දැනුම් දෙයි.', NULL, true, '2026-10-27 12:45:53.518476+00', '2026-10-27 12:45:53.518476+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('2018ba7e-e3c1-4970-ba7c-dfcd2501395e', 'ඇණවුමක් දාන්නේ කොහොමද?', 'කලිසම් වර්ගය, පැකේජය, ප්රමාණය සහ කැමති පාට අංක කියන්නකෝ. ඊට පස්සේ නම, දුරකථන අංකය සහ බෙදාහැරීමේ ලිපිනය අරගෙන ඇණවුමේ විස්තර එවන්නම්', NULL, true, '2026-10-27 12:46:03.403596+00', '2026-10-27 12:46:03.403596+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('dc9f70ca-61f1-4b3b-9fa5-cfc264092893', 'විස්තර එව්ව ගමන් ඇණවුම තහවුරු වෙනවද?', 'විස්තර ලැබුණු පසු අපේ කෙනෙක් ඔයාට කතා කරලා ඇණවුම තහවුරු කරයි. ඊට කලින් එවන ඇණවුම් සාරාංශය හොඳින් බලන්නකෝ.', NULL, true, '2026-10-27 12:46:16.375238+00', '2026-10-27 12:46:16.375238+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('fad08efa-cd53-44d4-a4db-5ebef67c7f80', 'ඇණවුම ලැබෙන්න කොච්චර කල් යනවද?', ' 🌸 දින 2-3 ඇතුලත ඕඩර් එක ලැබෙනු ඇත 🌸', NULL, true, '2026-10-27 12:45:25.912007+00', '2026-10-28 04:41:24.529224+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('d753d857-9bd9-4d37-97bd-c4e721424920', 'පැකේජ් මොනවද තියෙන්නේ?', 'කලිසම් 2, 3 සහ 5 , 10 බැගින් පැකේජ් තියෙනවා. ඔයාට ඕන ඔන ප්රමාණයක්  ගන්න පුලුවන්.', NULL, true, '2026-10-27 12:44:08.720751+00', '2026-10-28 04:47:12.842627+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('10ea014c-497b-44d7-a63e-e2dc0b430420', 'ඇණවුමේ පාට, ප්රමාණය හෝ ලිපිනය වෙනස් කරන්න පුළුවන්ද?', 'වෙනස් කරන්න ඕන දේ මෙතැනට කියන්න. ඇණවුමේ විස්තර යාවත්කාලීන කරලා නැවත සාරාංශයක් එවන්නම්.
', NULL, true, '2026-10-27 12:46:26.694671+00', '2026-10-27 12:46:26.694671+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('3dc65aec-0e3a-472a-9bdd-286bd81b392e', 'ඇණවුම අවලංගු කරන්න පුළුවන්ද?', 'ඔයාගේ ඇණවුම් අංකය හෝ දුරකථන අංකය එවන්නකෝ. ඇණවුමේ තත්ත්වය බලලා අපේ කෙනෙක් උදව් කරයි.', NULL, true, '2026-10-27 12:46:38.40174+00', '2026-10-27 12:46:38.40174+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('30ce8367-0e0b-4fcf-9bb7-4ce01f2c55e9', '22. භාණ්ඩය මාරු කරන්න හෝ ආපසු දෙන්න පුළුවන්ද?', 'ඒ ගැන අපේ කෙනෙක් ඔයාට අදාළ කොන්දේසි තහවුරු කරලා කියයි. ඔයාගේ ගැටලුව සහ ඇණවුම් අංකය එවන්නකෝ.', NULL, true, '2026-10-27 12:46:51.840769+00', '2026-10-27 12:46:51.840769+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

INSERT INTO "Binara_fashion".faqs (id, question, answer, product_id, is_active, created_at, updated_at, user_id, is_tracked, media_urls) VALUES ('d6e842cb-2be2-460b-9201-557f703331f8', 'Can i contact staff?', 'yes  can it is 0761122620', NULL, true, '2026-11-05 13:07:08.282453+00', '2026-11-05 13:07:08.282453+00', '8ec761ff-b716-411b-85d2-1b56980d1e8a', false, '{}')
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  product_id = EXCLUDED.product_id,
  is_active = EXCLUDED.is_active,
  is_tracked = EXCLUDED.is_tracked,
  media_urls = EXCLUDED.media_urls,
  user_id = EXCLUDED.user_id,
  updated_at = now();

-- ==============================================================================
-- End of Script
-- ==============================================================================


-- Data migration: the outerwear category has had only one DB
-- subcategory, "business_jacket", since the wardrobe schema was first
-- seeded -- every jacket, whether an actual blazer or a casual full-zip
-- jacket, was filed under the same generic bucket. This silently fed the
-- wrong garment description into the FLUX visualization prompt (fixed
-- separately in buildGarmentInput.ts) and made the catalog's category
-- filter useless for telling jacket types apart. This migration adds
-- distinct outerwear subcategories and reassigns existing items to the
-- correct one based on their own AI analysis, then retires the old
-- generic bucket.
--
-- Idempotent: safe to re-run -- inserts are guarded by "not exists", the
-- reassignment updates are no-ops once already applied, and the retiring
-- delete only fires once nothing references the old row anymore.

insert into public.clothing_subcategories (category_id, name)
select 3, v.name
from (values
  ('blazer'),
  ('full_zip_jacket'),
  ('bomber_jacket'),
  ('denim_jacket'),
  ('cardigan'),
  ('overcoat')
) as v(name)
where not exists (
  select 1 from public.clothing_subcategories
  where category_id = 3 and name = v.name
);

-- Reassign existing items away from the generic bucket, based on what
-- the AI analyzer already correctly identified them as.
update public.clothing_items
set subcategory_id = (
  select id from public.clothing_subcategories where category_id = 3 and name = 'blazer'
)
where subcategory_id = (
  select id from public.clothing_subcategories where category_id = 3 and name = 'business_jacket'
)
  and ai_analysis ->> 'subcategory' ilike '%blazer%';

update public.clothing_items
set subcategory_id = (
  select id from public.clothing_subcategories where category_id = 3 and name = 'full_zip_jacket'
)
where subcategory_id = (
  select id from public.clothing_subcategories where category_id = 3 and name = 'business_jacket'
)
  and ai_analysis ->> 'subcategory' ilike '%zip%';

-- Retire the generic bucket once nothing references it. Left in place
-- (not deleted) if any item still points to it -- e.g. one with no AI
-- analysis to reclassify from -- so this migration can never fail or
-- orphan a row.
delete from public.clothing_subcategories
where category_id = 3
  and name = 'business_jacket'
  and not exists (
    select 1 from public.clothing_items
    where subcategory_id = clothing_subcategories.id
  );

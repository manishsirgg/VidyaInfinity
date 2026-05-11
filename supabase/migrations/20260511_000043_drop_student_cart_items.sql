-- Cart system retired.
-- Vidya Infinity now uses direct checkout only.
-- This migration removes the legacy student cart table after app references were removed.

drop policy if exists student_cart_items_select_own on public.student_cart_items;
drop policy if exists student_cart_items_insert_own on public.student_cart_items;
drop policy if exists student_cart_items_delete_own on public.student_cart_items;

drop index if exists public.idx_student_cart_items_student;

drop table if exists public.student_cart_items cascade;

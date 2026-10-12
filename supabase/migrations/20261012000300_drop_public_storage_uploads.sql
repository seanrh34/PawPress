-- PawPress: stop anonymous uploads to the post-images bucket.
--
-- "Allow public uploads" let the PUBLIC role (anyone holding the anon key, which ships in the site's
-- JavaScript) insert arbitrary objects into post-images. Since PR #4 every upload goes through the
-- server (POST /api/uploads, POST /api/v1/media, and lib/uploadImages.ts), using the service-role key,
-- which bypasses RLS, after checking for an admin session or token. No insert policy is needed.
-- "Allow public reads" stays, so published images keep working.
--
-- Only apply AFTER the server-side upload code (PR #4) is deployed, or the old editor's uploads fail.

drop policy if exists "Allow public uploads" on storage.objects;

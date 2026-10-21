-- V2 F7: every stored image is under 100 KB. Uploads are optimised on the server (WebP) before they are stored; the
-- bucket limit makes sure nothing larger can be stored by any other path. Existing files are untouched (the one-off
-- scripts/recompress-images.ts shrinks them in place). Additive: no rows or objects are changed or removed.
update storage.buckets
set file_size_limit = 102400,
    allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg']
where id in ('logos', 'screenshots', 'thumbnails');

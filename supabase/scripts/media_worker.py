"""One-shot trusted worker. Run periodically in a bounded container, never in a browser.
Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the process environment.
"""
import hashlib
import io
import json
import os
import urllib.request
import urllib.parse
import warnings

from PIL import Image, ImageOps
import pymupdf

BASE = os.environ['SUPABASE_URL'].rstrip('/')
KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
HEADERS = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}
MAX_BYTES = 20 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 40_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)


def request(path, data=None, mime='application/json', method=None):
    req = urllib.request.Request(BASE + path, data=data, headers={**HEADERS, 'Content-Type': mime}, method=method)
    with urllib.request.urlopen(req, timeout=30) as response:
        body = response.read(MAX_BYTES + 1)
        if len(body) > MAX_BYTES:
            raise ValueError('response_too_large')
        return body


def rpc(action, data):
    return json.loads(request('/rest/v1/rpc/travel_worker', json.dumps({'p_action': action, 'p_input': data}).encode()))


def upload(bucket, path, content, mime):
    if len(content) > MAX_BYTES:
        raise ValueError('output_too_large')
    request('/storage/v1/object/' + urllib.parse.quote(bucket + '/' + path, safe='/'), content, mime, 'POST')


def metadata(content, mime, **extra):
    return {'mime': mime, 'bytes': len(content), 'checksum': hashlib.sha256(content).hexdigest(), **extra}


def process_image(source):
    with Image.open(io.BytesIO(source)) as image:
        if image.width * image.height > 40_000_000:
            raise ValueError('too_many_pixels')
        image = ImageOps.exif_transpose(image).convert('RGB')
        image.thumbnail((1600, 1600))
        clean = Image.new('RGB', image.size)
        clean.paste(image)
        buf = io.BytesIO()
        clean.save(buf, 'JPEG', quality=85, optimize=True)
        data = buf.getvalue()
        return data, metadata(data, 'image/jpeg', width=clean.width, height=clean.height)


def process_pdf(source):
    with pymupdf.open(stream=source, filetype='pdf') as doc:
        if doc.needs_pass or doc.is_encrypted or not 1 <= len(doc) <= 200:
            raise ValueError('invalid_pdf')
        page = doc[0]
        if page.rect.width <= 0 or page.rect.height <= 0:
            raise ValueError('invalid_page')
        scale = min(1200 / page.rect.width, 1600 / page.rect.height)
        pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
        preview = pix.tobytes('png')
        return preview, metadata(preview, 'image/png', width=pix.width, height=pix.height), len(doc)


def run_once():
    item = rpc('claim', {})
    if not item:
        print('No queued jobs')
        return
    job, asset = item['job'], item['asset']
    proof = {'job_id': job['id'], 'lease_until': job['lease_until'], 'attempt': job['attempts']}
    try:
        if job['type'] == 'invalidate_cache':
            # Current API is no-store. Add the frontend revalidation hook before enabling page caching.
            rpc('complete', proof)
        else:
            source = request('/storage/v1/object/authenticated/' + urllib.parse.quote(asset['bucket'] + '/' + asset['object_path'], safe='/'))
            prefix = f"{asset['site_id']}/{asset['id']}/attempt-{job['attempts']}"
            if asset['kind'] == 'image':
                output, meta = process_image(source)
                path = prefix + '/processed.jpg'
                upload(asset['bucket'], path, output, 'image/jpeg')
                rpc('complete', {**proof, 'metadata': meta, 'object_path': path})
            else:
                preview, preview_meta, pages = process_pdf(source)
                path = prefix + '/document.pdf'
                preview_path = prefix + '/first-page.png'
                upload(asset['bucket'], path, source, 'application/pdf')
                upload('documents-private', preview_path, preview, 'image/png')
                rpc('complete', {**proof, 'metadata': metadata(source, 'application/pdf', page_count=pages), 'object_path': path, 'preview_path': preview_path, 'preview_metadata': preview_meta})
        print(json.dumps({'job_id': job['id'], 'status': 'done'}))
    except Exception:
        rpc('fail', proof)
        print(json.dumps({'job_id': job['id'], 'status': 'retry_or_failed'}))
        raise RuntimeError('media_processing_failed') from None


if __name__ == '__main__':
    run_once()

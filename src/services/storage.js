'use strict';
/**
 * Dónde se guardan las fotos subidas desde el panel:
 *  - Supabase Storage (producción, Vercel): si están SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 *    El bucket (público) se crea solo la primera vez. Se usa la API REST con fetch, sin librerías.
 *  - Carpeta local (public/uploads): en tu computadora, sin configurar nada.
 *
 * Todas las URLs que se guardan en la base son completas en Supabase ("https://...supabase.co/...")
 * y relativas en local ("/uploads/..."). El resto del código no necesita distinguirlas.
 */
const fs = require('fs/promises');
const path = require('path');
const config = require('../config');

const { url: baseUrl, serviceKey, bucket } = config.supabase;
const useSupabase = !!(baseUrl && serviceKey);

const authHeaders = () => ({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}` });
const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/');

let bucketReady = null;
function ensureBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      const get = await fetch(`${baseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`, { headers: authHeaders() });
      if (get.ok) return;
      const create = await fetch(`${baseUrl}/storage/v1/bucket`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bucket, name: bucket, public: true, file_size_limit: 10 * 1024 * 1024 }),
      });
      if (!create.ok && create.status !== 409) {
        const body = await create.text().catch(() => '');
        if (!/already exists/i.test(body)) throw new Error(`No se pudo crear el bucket "${bucket}" en Supabase Storage (${create.status}): ${body}`);
      }
    })();
    bucketReady.catch(() => { bucketReady = null; });
  }
  return bucketReady;
}

/** URL pública de un archivo guardado con `put`. */
function publicUrl(key) {
  return useSupabase
    ? `${baseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeKey(key)}`
    : `${config.uploadsUrl}/${key}`;
}

/** Guarda un archivo y devuelve su URL pública. */
async function put(key, buffer, contentType = 'application/octet-stream') {
  if (useSupabase) {
    await ensureBucket();
    const res = await fetch(`${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeKey(key)}`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': contentType, 'Cache-Control': 'max-age=31536000', 'x-upsert': 'true' },
      body: buffer,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`No se pudo subir la imagen a Supabase Storage (${res.status}): ${body}`);
    }
  } else {
    await fs.mkdir(config.uploadsDir, { recursive: true });
    await fs.writeFile(path.join(config.uploadsDir, key), buffer);
  }
  return publicUrl(key);
}

/** Borra archivos por clave. Los que no existan se ignoran. */
async function remove(keys) {
  if (!keys.length) return;
  if (useSupabase) {
    await ensureBucket();
    const res = await fetch(`${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}`, {
      method: 'DELETE',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: keys }),
    });
    if (!res.ok) console.warn(`[storage] no se pudieron borrar ${keys.length} archivos (${res.status})`);
  } else {
    // Borrar es "lo mejor posible": si Windows tiene un archivo en uso un instante, no se rompe el panel
    await Promise.all(keys.map((k) => fs.rm(path.join(config.uploadsDir, path.basename(k)), { force: true, maxRetries: 3, retryDelay: 100 })
      .catch((err) => console.warn(`[storage] no se pudo borrar ${k}: ${err.code || err.message}`))));
  }
}

/** Devuelve la clave de una URL que pertenece a este almacenamiento, o null (ilustraciones de /img, etc.). */
function keyFromUrl(url) {
  if (!url) return null;
  if (useSupabase) {
    const prefix = `${baseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/`;
    return url.startsWith(prefix) ? decodeURIComponent(url.slice(prefix.length)) : null;
  }
  return url.startsWith(config.uploadsUrl + '/') ? url.slice(config.uploadsUrl.length + 1) : null;
}

/** Origen (https://xxxx.supabase.co) para permitir las imágenes en la política de seguridad (CSP). */
const origin = useSupabase ? new URL(baseUrl).origin : null;

module.exports = { put, remove, publicUrl, keyFromUrl, useSupabase, origin };

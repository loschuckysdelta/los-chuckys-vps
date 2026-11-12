# Recursos locales en el VPS

Las URLs y las carpetas físicas usan uploads/<id>/<archivo> para banners y uploads/<id>/gallery/<archivo> para recursos. Al iniciar, el backend migra uploads/local/collections/<id> a uploads/<id> y elimina las carpetas antiguas vacías. También puedes ejecutar node utils/migrate-uploads.js con el servidor detenido. La migración no sobrescribe archivos existentes. Los identificadores antiguos guardados en MongoDB siguen siendo compatibles con la lectura y el borrado; las nuevas subidas guardan identificadores sin el prefijo. Los enlaces largos anteriores siguen funcionando mediante una ruta de compatibilidad.

El panel sube el archivo a `POST /api/uploads` como multipart (`file`, `folder`, `type`) y luego guarda sus metadatos mediante la API de recursos existente. Los banners se siguen enviando con el formulario de colecciones. Se conservan los campos `public_id`, `secure_url` y `resource_type` en MongoDB.

Configura en `.env` del backend:

```dotenv
UPLOADS_DIR=uploads
MAX_UPLOAD_MB=500
```

Las respuestas HTTP construyen `secure_url` con el protocolo, dominio y puerto de cada petición al backend. Si consultas desde localhost, devuelven localhost; si consultas desde el dominio del VPS, devuelven ese dominio. Las nuevas escrituras guardan rutas relativas en MongoDB y los registros antiguos se corrigen al responder, sin migrar la base. `PUBLIC_BASE_URL` solo sirve como respaldo para código ejecutado fuera de una petición HTTP; no se necesita para la API.

Para HTTPS detrás de Nginx, conserva las cabeceras Host y X-Forwarded-Proto del ejemplo. Por defecto se confía en el proxy local (`loopback`); si está en otra máquina, configura `TRUST_PROXY` con su IP o CIDR. Reinicia el backend después de actualizar el código o la configuración.

`UPLOADS_DIR` admite una ruta absoluta o relativa a `chucky-server`. El proceso Node necesita permisos de escritura. Los archivos se guardan en `uploads/<id>/...`, con nombres únicos, y Express los sirve por `/uploads/...`, incluyendo solicitudes parciales para reproducir videos. Mantén esta carpeta persistente entre despliegues y respáldala junto con MongoDB.

El panel de producción usa `/api` en el mismo dominio. Si el backend está en otro dominio, cambia `apiBackend` en `chucky-panel/src/environments/environment.ts` por `https://recursos.tudominio.com/api` antes de compilar. Desarrollo sigue usando `http://localhost:4000/api`.

Si usas Nginx, integra estas rutas en el bloque `server` de tu dominio (ajusta el límite junto con `MAX_UPLOAD_MB`):

```nginx
client_max_body_size 501m;

location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_request_buffering off;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
}

location /uploads/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
}
```

Las subidas de imágenes y videos ahora usan una solicitud multipart completa, escrita en un archivo temporal en disco; ya no usan la subida por fragmentos de Cloudinary. No hay transformación ni conversión de formatos. La carpeta temporal del sistema necesita espacio suficiente para la subida.

Los archivos existentes en Cloudinary no se descargan automáticamente. Sus URLs siguen guardadas y visibles; vuelve a subirlos o migra los archivos y sus metadatos antes de desactivar la cuenta. El borrado reconoce las rutas locales nuevas y antiguas y no llama a Cloudinary. Las variables `CLOUD_NAME`, `CLOUD_API_KEY` y `CLOUD_API_SECRET` ya no se utilizan.

Verificación: `node --test tests/storage.test.js tests/media-url.test.js` desde `chucky-server`.

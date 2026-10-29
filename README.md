# MAREA Surfwear · Tienda online

Tienda web completa para una marca de mallas de surf: catálogo, ficha de producto con galería, carrito persistente,
checkout validado, **pedido por WhatsApp con el mensaje ya armado**, **stock por talle** y **panel de administración**.

- Pensada primero para celulares (mobile-first) y adaptada a tablets y escritorio.
- Todo (productos, talles, stock, fotos, pedidos) vive en una **base de datos**; nada está hardcodeado en el HTML o JavaScript.
- Node.js + Express + SQLite. Páginas renderizadas en el servidor (rápidas y buenas para Google) con JavaScript solo donde hace falta.

---

## Índice

1. [Qué incluye](#qué-incluye)
2. [Instalación local](#instalación-local)
3. [Configuración (.env)](#configuración-env)
4. [Base de datos](#base-de-datos)
5. [Crear el usuario administrador](#crear-el-usuario-administrador)
6. [Usar el panel de administración](#usar-el-panel-de-administración)
7. [Cómo funciona la compra y el WhatsApp](#cómo-funciona-la-compra-y-el-whatsapp)
8. [Cómo funciona el stock](#cómo-funciona-el-stock)
9. [Poner la tienda en producción](#poner-la-tienda-en-producción) (VPS o Render)
10. [Backups](#backups)
11. [Seguridad](#seguridad)
12. [Estructura del proyecto](#estructura-del-proyecto)
13. [Personalización](#personalización)
14. [Pruebas](#pruebas)
15. [Pendientes antes de lanzar](#pendientes-antes-de-lanzar)

---

## Qué incluye

**Tienda pública**
- Home con hero, beneficios, destacados, catálogo, "cómo comprar", envíos, preguntas frecuentes y llamado a WhatsApp.
- Catálogo con **filtros por casillas de color y talle (varios a la vez, con cantidad de productos), rango de precio, "solo con stock", buscador y orden**. En computadora los filtros van en una columna a la izquierda; en celular se abren con el botón "Filtrar". Todo se aplica solo, sin botón "Aplicar" y sin recargar la página.
- Tarjetas con imagen, precio, talles (los agotados tachados) e indicador de stock ("Disponible", "Últimas unidades", "Sin stock"). Toda la tarjeta es clickeable y lleva a la ficha del producto (además del botón "Ver producto").
- Ficha de producto: galería con deslizamiento táctil + miniaturas + flechas, selector de talle (los agotados dicen "Agotado" y no se pueden elegir), stock por talle, selector de cantidad limitado al stock, descripción, material, características, productos relacionados y breadcrumbs.
- Carrito en panel lateral (hoja inferior en celulares): cambiar cantidades, quitar productos (con confirmación), vaciar, total, persistente entre páginas y visitas.
- Checkout en 2 pasos (datos → resumen final) y botón **"Confirmar pedido por WhatsApp"**.
- Páginas: Envíos y pagos, Preguntas frecuentes, Cambios y devoluciones, Términos y condiciones, Contacto, 404/500.
- Botón flotante de WhatsApp, footer completo, redes sociales configurables.
- SEO: título y description únicos, URLs amigables, Open Graph, datos estructurados (Product, Breadcrumb, FAQ, Store), `sitemap.xml` y `robots.txt` automáticos.

**Panel de administración** (`/admin`)
- Login con sesión segura.
- Resumen con ventas, pedidos pendientes y **alertas de stock bajo/agotado**.
- Productos: crear, editar, eliminar, activar/desactivar, destacar, subir fotos (se optimizan solas), editar nombre, descripción, precio, talles y stock por talle.
- Stock rápido: una pantalla para editar el stock de todos los talles de una vez.
- Pedidos: lista con filtro por estado y búsqueda, detalle (cliente, dirección, productos, talles, cantidades, fecha y hora), cambio de estado, historial y notas internas, botón para escribirle al cliente por WhatsApp.
- Configuración: número de WhatsApp, email, dirección, redes sociales, umbral de stock bajo.

---

## Instalación local

**Requisitos:** [Node.js](https://nodejs.org) 20 o superior (probado con Node 24).

```bash
# 1. Instalar dependencias
npm install

# 2. Crear el archivo de configuración
cp .env.example .env        # en Windows (PowerShell): copy .env.example .env

# 3. Crear la base de datos con los talles y 6 productos de demostración
npm run setup

# 4. Crear tu usuario administrador (te pregunta email y contraseña)
npm run admin:create

# 5. Iniciar la tienda
npm start                   # o "npm run dev" para que se reinicie al editar el código
```

Abrí <http://localhost:3000> (tienda) y <http://localhost:3000/admin> (panel).

> Los productos de demostración usan **ilustraciones de ejemplo**. Reemplazalas subiendo fotos reales desde
> *Admin → Productos → Editar → Imágenes*. Si no querés los productos demo, usá `node scripts/db-seed.js --no-demo`
> en vez de `npm run setup` (o eliminalos desde el panel).

---

## Configuración (.env)

Copiá `.env.example` a `.env`. Las variables principales:

| Variable | Para qué sirve |
|---|---|
| `PORT` | Puerto del servidor (por defecto 3000). |
| `NODE_ENV` | `production` en el servidor real (activa cookies seguras, HSTS y caché). |
| `SITE_URL` | URL pública, sin barra final. Se usa en el sitemap, Open Graph y datos estructurados. |
| `TRUST_PROXY` | `1` si hay Nginx/Render/Railway/Cloudflare delante (necesario para HTTPS y límites por IP). |
| `DATABASE_PATH` | Ruta del archivo SQLite (por defecto `data/marea.db`). |
| `UPLOADS_DIR` | Carpeta de las fotos subidas (por defecto `public/uploads`). |
| `WHATSAPP_NUMBER` | Número que recibe los pedidos, solo dígitos con código de país. |
| `CONTACT_EMAIL`, `STORE_ADDRESS`, `INSTAGRAM_URL`, `TIKTOK_URL`, `FACEBOOK_URL` | Datos de contacto y redes (también se editan desde el panel). |
| `LOW_STOCK_THRESHOLD` | Unidades por debajo de las cuales un talle se marca "Últimas unidades". |

Los datos de tienda (WhatsApp, email, redes, umbral) se pueden **cambiar después desde Admin → Configuración**, sin tocar archivos.

### Sobre el número de WhatsApp

El número configurado es **+54 299 415-4002** (`542994154002`). Se verificó que WhatsApp reconoce el enlace y muestra
"Chatea en WhatsApp con el +54 299 415-4002" con el pedido completo. Si en algún dispositivo el chat no abriera,
WhatsApp a veces requiere el **9 de celulares argentinos**: cambiá el número a `5492994154002` en *Admin → Configuración*.

---

## Base de datos

Se usa **SQLite** (un único archivo, sin servidor aparte): ideal para una tienda que empieza y fácil de respaldar.
Las tablas están separadas para que el sistema pueda crecer:

| Tabla | Contenido |
|---|---|
| `categories` | Categorías (hoy "Mallas"; podés agregar remeras, accesorios, etc.). |
| `products` | Producto: nombre, slug (URL), descripciones, material, color, características, precio, activo, destacado. |
| `product_images` | Fotos de cada producto, con orden y texto alternativo. |
| `sizes` | Catálogo de talles (XS, S, M… "Único", "38", lo que necesites). |
| `product_variants` | **Producto + talle = variante, y ahí vive el stock.** |
| `customers` | Clientes (por teléfono). |
| `orders` | Pedidos: estado, entrega, pago, dirección, totales, copia de los datos del cliente al momento de comprar. |
| `order_items` | Detalle: producto, talle, cantidad, precio unitario y subtotal (copia, para que el historial no cambie si editás el producto). |
| `order_status_history` | Historial de cambios de estado. |
| `admins`, `admin_sessions` | Administradores (contraseña con scrypt) y sesiones. |
| `settings` | Configuración editable desde el panel. |
| `schema_migrations` | Versiones del esquema aplicadas. |

**Migraciones:** los cambios de estructura se escriben como archivos `src/db/migrations/00N_nombre.sql`. Se aplican solos al
iniciar la app (o con `npm run db:init`), en orden y una sola vez. Para agregar una función nueva, creá `002_algo.sql`.

**Crecer en el futuro:** el acceso a datos está aislado en `src/repositories/` y `src/services/`. Si algún día necesitás
PostgreSQL o MySQL (varios servidores, mucho tráfico), solo hay que reescribir esa capa; las vistas y rutas no cambian.

---

## Crear el usuario administrador

```bash
npm run admin:create
# o sin preguntas:
npm run admin:create -- tu@email.com "UnaClaveSegura123"
```

- La contraseña debe tener **al menos 10 caracteres, con letras y números**.
- Se guarda cifrada (scrypt); nunca en texto plano.
- Si el email ya existe, el mismo comando **cambia la contraseña** (sirve para recuperar el acceso).
- Podés crear más administradores repitiendo el comando con otro email.
- Después de entrar, podés cambiar tu clave en *Admin → Mi cuenta*.

---

## Usar el panel de administración

Entrá a `/admin` (el panel no aparece enlazado en la tienda pública y está marcado `noindex`).

**Cargar un producto nuevo**
1. *Productos → + Nuevo producto*.
2. Completá nombre, descripciones, material, **color** (aparece en el filtro de la tienda), características (una por línea) y precio.
3. En **Talles y stock** tildá los talles que ofrece y poné las unidades de cada uno. Podés crear talles nuevos ("XXL, 38, Único").
4. Subí las fotos (JPG/PNG/WebP, idealmente verticales 4:5, mínimo 1200 px de ancho). La primera es la principal.
5. Dejá **Activo** tildado para que se vea en la tienda y **Destacado** si querés que aparezca arriba.

**Stock:** *Stock* muestra todos los talles de todos los productos; editá los números y guardá una vez. Amarillo = pocas unidades, rojo = agotado.

**Pedidos:** *Pedidos → abrir un pedido* para ver todo y cambiar el estado: Pendiente → Confirmado → Preparando → Enviado → Entregado (o Cancelado).
Al **cancelar**, las unidades **vuelven al stock automáticamente**.

**Eliminar vs. desactivar:** desactivar oculta el producto sin perderlo; eliminar lo borra (los pedidos viejos conservan su detalle).

---

## Cómo funciona la compra y el WhatsApp

1. El cliente arma el carrito (se guarda en su navegador y sobrevive a recargas y navegación).
2. En el checkout completa sus datos (validados en el navegador **y otra vez en el servidor**).
3. Ve un **resumen final** (productos, talles, cantidades, precios, total, datos, dirección, entrega y pago).
4. Al tocar **"Confirmar pedido por WhatsApp"**, el servidor:
   - vuelve a leer precios y stock de la base (no confía en lo que manda el navegador),
   - **descuenta el stock por talle** en una transacción atómica,
   - guarda cliente, pedido y detalle,
   - arma el mensaje y devuelve el enlace `https://wa.me/542994154002?text=...`.
5. Se abre WhatsApp con el pedido ya escrito. El cliente solo tiene que **enviarlo**.
6. El pedido aparece en el panel con estado *Pendiente*.

Formato del mensaje:

```
NUEVO PEDIDO
Código: MAR-5WNYVA

Cliente:
Nombre: Juan
Apellido: Pérez
Teléfono: 2991234567

Dirección:
Av. Argentina 123
Neuquén, Neuquén
CP: 8300

Entrega:
Envío a domicilio

Productos:
1. Malla Ocean Blue
Talle: M
Cantidad: 1
Precio: $45.000
Subtotal: $45.000

TOTAL: $45.000

Método de pago:
Transferencia bancaria

Comentarios:
Entregar por la tarde.
```

No se usa ningún servicio externo de mensajería: es el enlace oficial de WhatsApp.
Los datos personales del cliente no quedan en la URL de la página de confirmación.

> **Importante:** el stock se descuenta al confirmar el pedido (queda reservado). Si el cliente nunca paga, cancelá el pedido en el
> panel y las unidades vuelven al stock.

---

## Cómo funciona el stock

- El stock se guarda **por producto y por talle** (`product_variants`).
- En la tienda: los talles con stock 0 aparecen "Agotado" y no se pueden seleccionar; con 3 o menos unidades aparece "Quedan N" / "Últimas unidades"; si todos están en 0 el producto muestra "Sin stock".
- No se puede agregar al carrito más que el stock disponible (ni más de 10 unidades por línea).
- El servidor revalida todo al confirmar. Si el stock cambió mientras el cliente compraba, el pedido **no se crea** y se le avisa qué ajustar. Dos clientes comprando la última unidad a la vez: solo uno se la lleva.
- Cada vez que se abre el carrito o el checkout, las cantidades se ajustan al stock real y se quitan los productos desactivados.

---

## Poner la tienda en producción

Necesitás: un dominio, un servidor con **disco persistente** (la base SQLite y las fotos viven en archivos) y HTTPS.

### Opción A: VPS (Ubuntu 22.04/24.04) con Nginx + HTTPS — recomendada

```bash
# 1. Node.js 20+ y herramientas
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git build-essential
sudo npm install -g pm2

# 2. Subir el proyecto (git clone o copiar la carpeta) y entrar
cd /var/www/marea-surfwear
npm ci --omit=dev

# 3. Configurar
cp .env.example .env
nano .env       # SITE_URL=https://tudominio.com  NODE_ENV=production  TRUST_PROXY=1  ...

# 4. Base de datos (sin productos demo) y administrador
node scripts/db-init.js
node scripts/db-seed.js --no-demo
npm run admin:create

# 5. Dejarla corriendo siempre
pm2 start server.js --name marea
pm2 save && pm2 startup        # ejecutá el comando que te muestra
```

Nginx (`/etc/nginx/sites-available/marea`):

```nginx
server {
    server_name tudominio.com www.tudominio.com;
    client_max_body_size 40M;            # subida de fotos desde el panel

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/marea /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tudominio.com -d www.tudominio.com     # HTTPS gratis y renovación automática
```

**Actualizar la tienda:** subir los cambios, `npm ci --omit=dev` y `pm2 restart marea`. Las migraciones se aplican solas.

### Opción B: Render (ya configurado en `render.yaml`)

El repositorio trae un *Blueprint* de Render listo. El arranque (`npm run start:prod`)
prepara la base de datos y crea el administrador solo, así que no hace falta consola.

1. Creá una cuenta en [render.com](https://render.com) (podés entrar con GitHub).
2. **New → Blueprint** y elegí el repositorio `Marea-Surfwear`.
3. Render te pide tres datos:
   - `ADMIN_EMAIL`: el email con el que vas a entrar al panel.
   - `ADMIN_PASSWORD`: mínimo 10 caracteres, con letras y números.
   - `SITE_URL`: dejalo vacío hasta tener dominio propio (se usa la dirección `.onrender.com`).
4. Confirmá con **Apply**. El primer deploy tarda unos minutos.
5. Entrá a `https://<tu-servicio>.onrender.com/admin`, cargá los productos y revisá
   *Configuración* (WhatsApp, redes, email).

**Costo:** el plan *Starter* (alrededor de USD 7 por mes) es el más barato que permite
disco persistente. En el plan gratis la base y las fotos se borrarían en cada reinicio.

**Dominio propio:** en el servicio, *Settings → Custom Domains*. Después poné la
dirección en `SITE_URL` (con `https://`) y reiniciá.

**Actualizar la tienda:** cada `git push` a `main` vuelve a publicarla sola. La base y
las fotos están en el disco `/data`, así que no se pierden.

**Productos de demostración:** si querés que la tienda arranque con las mallas de
ejemplo, agregá la variable `SEED_DEMO=1` antes del primer deploy.

**Backups:** en el servicio, *Disks → Snapshots*: Render guarda copias diarias del disco.

### Opción C: otras plataformas (Railway / Fly.io)

- Servicio web Node: build `npm ci --omit=dev`, start `npm run start:prod` (prepara la base y crea el admin con `ADMIN_EMAIL` / `ADMIN_PASSWORD`).
- **Agregá un disco/volumen persistente** (por ejemplo montado en `/data`) y poné en las variables de entorno:
  `DATABASE_PATH=/data/marea.db` y `UPLOADS_DIR=/data/uploads`. Sin disco persistente, cada deploy borra la base y las fotos.
- Variables: `NODE_ENV=production`, `TRUST_PROXY=1`, `SITE_URL=https://tu-dominio`, `WHATSAPP_NUMBER=...`.
- Primer arranque: en la consola de la plataforma ejecutá `node scripts/db-init.js && node scripts/db-seed.js --no-demo` y `npm run admin:create`.
- Usá **una sola instancia** (SQLite no está pensado para varias instancias escribiendo a la vez).

### Lista de verificación antes de abrir al público
- [ ] `SITE_URL` con `https://` y `NODE_ENV=production`.
- [ ] HTTPS funcionando (candado en el navegador).
- [ ] Administrador creado con una contraseña fuerte y única.
- [ ] Productos demo eliminados y fotos reales subidas.
- [ ] Número de WhatsApp, email, dirección y redes cargados en *Admin → Configuración*.
- [ ] Textos de envíos, cambios y términos revisados (ver [Pendientes](#pendientes-antes-de-lanzar)).
- [ ] Hiciste un pedido de prueba completo y lo cancelaste (el stock vuelve).
- [ ] Backup automático configurado.
- [ ] Sitemap enviado a Google Search Console (`https://tudominio.com/sitemap.xml`).

---

## Backups

Se respaldan **dos cosas**: el archivo de base de datos y la carpeta de fotos.

```bash
# Copia consistente de la base (aun con la tienda funcionando)
sqlite3 data/marea.db ".backup 'backup/marea-$(date +%F).db'"
# Fotos
tar czf backup/uploads-$(date +%F).tar.gz public/uploads
```

Programalo con `cron` (por ejemplo todos los días a las 3 AM) y copiá los archivos a otro lugar (Google Drive, otro servidor, etc.).
Para restaurar: detené la app, reemplazá `data/marea.db` y la carpeta de fotos, y arrancala de nuevo.

---

## Seguridad

- **Panel protegido:** todas las rutas de `/admin` exigen sesión; cookie `HttpOnly`, `SameSite=Lax` y `Secure` en producción, limitada a `/admin`; sesiones con vencimiento.
- **Contraseñas** con scrypt y sal; comparación en tiempo constante; mensaje de error idéntico para email o clave incorrectos.
- **CSRF:** todos los formularios del panel llevan token; el login usa un token propio.
- **Límite de intentos** en el login (8 cada 15 min por IP) y en la creación de pedidos.
- **Validación en el servidor** de todo: datos del cliente, cantidades, stock, precios (siempre se leen de la base), formularios del panel y subida de imágenes (se verifica que sean imágenes reales y se recodifican a WebP).
- **Stock atómico:** descuento condicional dentro de una transacción; imposible quedar en negativo ni vender dos veces la última unidad.
- **Cabeceras de seguridad** (Helmet): Content-Security-Policy estricta (sin scripts inline), HSTS en producción, sin `X-Powered-By`.
- **API de pedidos** solo acepta JSON del mismo origen.
- SQL siempre con parámetros (sin concatenar datos del usuario). Todo el HTML se escapa en las vistas.
- Los datos personales no viajan por la URL ni se muestran en la página de confirmación.

Recomendaciones: usá una clave única y larga para el administrador, mantené Node y las dependencias al día (`npm audit`) y hacé backups.

---

## Estructura del proyecto

```
server.js                    Arranque
src/
  app.js                     Configuración de Express, seguridad y variables de las vistas
  config.js · constants.js   Configuración, métodos de entrega/pago, estados, provincias
  db/                        Conexión SQLite y migraciones (migrations/*.sql)
  repositories/              Acceso a datos: productos, pedidos, talles/categorías, configuración
  services/
    orders.js                Crear pedido + descontar stock + cambiar estado (transacciones)
    cart.js                  Estado real del carrito (precio/stock) a partir de lo que manda el navegador
    whatsapp.js              Armado del mensaje y del enlace de WhatsApp
    auth.js · images.js      Login/sesiones y procesamiento de fotos
  middleware/admin-auth.js   Sesión y CSRF del panel
  routes/                    public.js (tienda) · api.js (carrito/pedidos) · admin.js (panel)
  utils/                     Validaciones y formato (moneda, fechas)
  content/faq.js             Preguntas frecuentes
  views/                     Plantillas EJS: pages/ partials/ admin/
public/
  css/main.css · admin.css   Estilos
  js/                        cart.js (carrito) · cart-ui.js · product.js · checkout.js · ui.js · admin.js
  img/ · uploads/            Imágenes del sitio y fotos subidas
scripts/                     db-init · db-seed · create-admin · generate-art
tests/                       Pruebas automáticas
```

---

## Personalización

- **Colores y tipografías:** variables al inicio de `public/css/main.css` (`--ink`, `--coral`, `--aqua`…). Fuentes: Bricolage Grotesque + DM Sans (Google Fonts), definidas en `src/views/partials/head.ejs`.
- **Imagen principal (hero):** reemplazá `public/img/hero.svg` por tu foto (por ejemplo `hero.jpg`) y cambiá el nombre en `src/views/pages/home.ejs`. Imagen para compartir en redes: `public/img/og-default.jpg` (1200×630).
- **Logo:** el ícono de ola está en `src/views/partials/icons.ejs` (`i-wave`) y el nombre en *Admin → Configuración* / `src/config.js`.
- **Preguntas frecuentes:** `src/content/faq.js`.
- **Métodos de entrega y pago, provincias:** `src/constants.js`.
- **Textos legales y de envíos:** `src/views/pages/` (`shipping`, `returns`, `terms`).
- **Nuevos tipos de producto:** creá categorías desde el panel (campo "categoría nueva" en el producto) y talles nuevos ("Único", números, etc.). Los filtros y el catálogo ya los soportan.

---

## Pruebas

```bash
npm test
```

25 pruebas automáticas contra una base temporal: stock por talle, pedidos simultáneos por la última unidad, rechazo de talles agotados y cantidades inválidas,
validación del checkout, mensaje y número de WhatsApp, cancelación/reactivación de pedidos, API del carrito, SEO, seguridad del panel (sin sesión, CSRF, login),
alta/edición de productos, subida y borrado de imágenes, configuración.

---

## Pendientes antes de lanzar

1. **Fotos reales.** Las ilustraciones de los productos demo son de ejemplo.
2. **Revisar los textos legales y de políticas** (`envios`, `cambios-y-devoluciones`, `terminos-y-condiciones`, preguntas frecuentes). Son una base razonable
   para Argentina (plazos de cambio, botón de arrepentimiento de 10 días, etc.), pero **deben ser validados/ajustados por vos o por un profesional** según cómo operes.
3. **Pagos:** la tienda no cobra online. Transferencia, Mercado Pago y efectivo se coordinan por WhatsApp. Más adelante se puede integrar Mercado Pago Checkout.
4. **Costo de envío:** hoy se coordina por WhatsApp (el pedido muestra "A coordinar"). Se puede agregar una tabla de tarifas por provincia.
5. **Redes sociales:** cargá los enlaces en *Admin → Configuración* para que aparezcan los íconos.
6. **Horario de atención** de la página de contacto: editalo en `src/views/pages/contact.ejs`.

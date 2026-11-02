# MAREA Surfwear · Tienda online

Tienda web completa para una marca de mallas de surf: catálogo, ficha de producto con galería, carrito persistente,
checkout validado, **pedido por WhatsApp con el mensaje ya armado**, **stock por talle** y **panel de administración**.

- Pensada primero para celulares (mobile-first) y adaptada a tablets y escritorio.
- Todo (productos, talles, stock, fotos, pedidos) vive en una **base de datos**; nada está hardcodeado en el HTML o JavaScript.
- Node.js + Express + **PostgreSQL (Supabase)**, publicada en **Vercel**. Páginas renderizadas en el servidor (rápidas y buenas para Google) con JavaScript solo donde hace falta.

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
9. [Poner la tienda en producción](#poner-la-tienda-en-producción) (Vercel + Supabase)
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

**Requisitos:** [Node.js](https://nodejs.org) 20 o superior (probado con Node 24). No hace falta instalar ninguna base de datos:
en tu computadora la tienda usa un Postgres embebido (PGlite) que se guarda en `data/pglite`.

```bash
# 1. Instalar dependencias
npm install

# 2. Crear el archivo de configuración
cp .env.example .env        # en Windows (PowerShell): copy .env.example .env

# 3. Cargar los productos de demostración (opcional) y crear tu administrador
npm run setup
npm run admin:create        # te pregunta email y contraseña

# 4. Iniciar la tienda
npm start                   # o "npm run dev" para que se reinicie al editar el código
```

Abrí <http://localhost:3000> (tienda) y <http://localhost:3000/admin> (panel).

> **Si ya tenías la tienda con la base anterior (`data/marea.db`):** al iniciar por primera vez en tu computadora, la tienda
> la detecta y **copia sola tus productos, pedidos y administrador** a la base nueva. No tenés que hacer nada.
>
> Los productos de demostración usan **ilustraciones de ejemplo**: reemplazalas con fotos reales desde
> *Admin → Productos → Editar → Imágenes*, o usá `node scripts/db-seed.js --no-demo` en vez de `npm run setup`.

---

## Configuración (.env)

Copiá `.env.example` a `.env`. Las variables principales:

| Variable | Para qué sirve |
|---|---|
| `PORT` | Puerto del servidor (por defecto 3000). |
| `NODE_ENV` | `production` en el servidor real (activa cookies seguras, HSTS y caché). |
| `SITE_URL` | URL pública, sin barra final. Se usa en el sitemap, Open Graph y datos estructurados. |
| `TRUST_PROXY` | `1` si hay Nginx/Render/Railway/Cloudflare delante (necesario para HTTPS y límites por IP). |
| `DATABASE_URL` | Conexión a PostgreSQL (Supabase). **Obligatoria en producción.** Vacía = Postgres embebido local. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Dónde se guardan las fotos subidas (Supabase Storage). Vacías = carpeta local `public/uploads`. |
| `SUPABASE_BUCKET` | Nombre del bucket de fotos (por defecto `productos`; se crea solo). |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Administrador inicial: solo se crea si todavía no hay ninguno. |
| `DATABASE_PATH` | Base SQLite **anterior**, solo para importarla (`npm run db:import-sqlite`). |
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

Se usa **PostgreSQL**: en producción el de **Supabase**, y en tu computadora un Postgres embebido (PGlite) sin instalar nada.
El código es el mismo en los dos casos. Las tablas están separadas para que el sistema pueda crecer:

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
| `rate_limits` | Contadores del límite de intentos (login y pedidos). |
| `schema_migrations` | Versiones del esquema aplicadas. |

**Migraciones:** los cambios de estructura se escriben como archivos `src/db/migrations/00N_nombre.sql`. Se aplican solos al
iniciar la app (o con `npm run db:init`), en orden, una sola vez y de forma segura aunque haya varias instancias iniciando a la vez.
Para agregar una función nueva, creá `002_algo.sql`.

**Seguridad de los datos en Supabase:** todas las tablas tienen RLS activado y sin políticas, así que la clave pública (`anon`)
de Supabase no puede leer ni escribir nada. Solo la tienda (servidor) accede, con la cadena de conexión.

**Fotos:** se guardan en **Supabase Storage** (bucket público `productos`, creado automáticamente). La base solo guarda la URL.

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

La tienda se publica en **Vercel** (el sitio) usando **Supabase** (base de datos PostgreSQL y fotos). Todo se hace con cuentas web;
ningún paso requiere instalar un servidor.

> **Importante sobre costos y condiciones**
> - **Vercel Hobby (gratis) es solo para uso personal y no comercial.** Para una tienda que vende, sus condiciones piden el plan **Pro** (unos US$ 20 por mes).
> - **Supabase gratis** pausa el proyecto si pasa una semana sin actividad y **no incluye copias de seguridad automáticas**. Para vender de verdad conviene el plan Pro de Supabase (backups diarios y sin pausas).
> - Vercel **no puede guardar archivos**: por eso la base y las fotos viven en Supabase.

### Paso 1 · Crear el proyecto en Supabase
1. Entrá a <https://supabase.com> → **New project**. Nombre: `marea-surfwear`. Elegí una **contraseña de base de datos** (guardala) y la región **South America (São Paulo)**. Esperá un par de minutos.
2. Botón **Connect** (arriba) → pestaña **Connection string** → método **Transaction pooler** → copiá la dirección y reemplazá `[YOUR-PASSWORD]` por tu contraseña. Es tu `DATABASE_URL` (puerto `6543`).
   Si la contraseña tiene símbolos (`@ : / # ?`), escribilos codificados (por ejemplo `@` → `%40`) o elegí una contraseña solo con letras y números.
3. **Project Settings → API**: copiá la **Project URL** (`SUPABASE_URL`) y la clave **`service_role`** (`SUPABASE_SERVICE_ROLE_KEY`). Esta clave es **secreta**: nunca la pegues en el código ni la subas a GitHub.

### Paso 2 · Pasar tus datos y fotos a Supabase (una sola vez, desde tu computadora)
1. En tu archivo `.env` completá `DATABASE_URL`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
2. Ejecutá:
   ```bash
   npm install
   npm run db:init            # crea las tablas en Supabase
   npm run db:import-sqlite   # copia productos, stock, pedidos y administrador de data/marea.db y SUBE tus fotos a Supabase Storage
   ```
   Si empezás de cero (sin base anterior): ejecutá `npm run db:init` y `npm run admin:create`.
3. Comprobá en Supabase: **Table Editor** (tus productos) y **Storage → productos** (tus fotos).

> Mientras esas variables estén en tu `.env`, `npm start` en tu computadora trabaja contra la base **real**. Para probar sin tocar la tienda,
> dejalas vacías (o comentalas con `#`) cuando no las necesites.

### Paso 3 · Subir el código a GitHub
```bash
git add .
git commit -m "Pasar la tienda a Supabase y Vercel"
git push
```
El archivo `.env` **no se sube** (está en `.gitignore`).

### Paso 4 · Publicar en Vercel
1. Entrá a <https://vercel.com> con tu cuenta de GitHub → **Add New… → Project** → elegí el repositorio `Marea-Surfwear` → **Import**.
2. **Framework Preset: Other.** No toques *Build Command* ni *Output Directory* (ya los define `vercel.json`).
3. En **Environment Variables** cargá:
   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | la dirección del *Transaction pooler* (Paso 1) |
   | `SUPABASE_URL` | la Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | la clave `service_role` |
   | `WHATSAPP_NUMBER` | `542994154002` (o el tuyo, solo dígitos) |
   | `SITE_URL` | tu dominio (ej. `https://www.mareasurfwear.com.ar`); si todavía no tenés, dejalo vacío |
4. **Deploy.** Al terminar, abrí la dirección `*.vercel.app` que te da Vercel: esa es tu tienda. El panel está en `/admin`.

La función corre en Washington D. C. (`iad1`, ver `vercel.json`), la misma región que tu base de Supabase (US East). Si creás el proyecto de Supabase en otra región, cambiá `regions` en `vercel.json` por la más cercana.

### Paso 5 · Dominio propio
En Vercel → **Settings → Domains** agregá tu dominio y seguí las instrucciones para apuntar el DNS. Después poné ese dominio en la variable `SITE_URL` y volvé a desplegar (*Deployments → ⋯ → Redeploy*).

### Actualizar la tienda
Cada `git push` publica solo la versión nueva. Los cambios de estructura de la base (migraciones) se aplican automáticamente al recibir la primera visita.
Para cambiar productos, fotos, precios o stock no hace falta tocar el código: se hace desde el panel.

### Qué cambia con Vercel (para tener en cuenta)
- **Fotos:** se guardan en Supabase Storage. Vercel acepta pedidos de hasta 4,5 MB, así que el panel **reduce las fotos en tu navegador** antes de subirlas (máx. 1600 px, WebP) y luego el servidor genera sus tamaños optimizados.
- **Banner de inicio (collage):** es un archivo estático. Si cambiás las mallas, ejecutá `npm run hero:build` en tu computadora (con tu `.env` apuntando a Supabase), y luego `git add`, `git commit` y `git push` para publicar el collage nuevo.
- **Límite de intentos (login, pedidos):** se guarda en la base de datos, así funciona aunque Vercel use varias instancias a la vez.
- **Errores y registros:** Vercel → tu proyecto → **Logs**.

### Alternativa: Render u otro servidor
`render.yaml` quedó listo para Render **sin disco** (usa Supabase igual que Vercel): *New → Blueprint*, cargá `DATABASE_URL`, `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY`. El comando `npm run start:prod` hace lo mismo que `npm start`. Sirve también para un VPS con Node: definí las mismas variables y ejecutá `npm start` detrás de Nginx.

### Lista de verificación antes de abrir al público
- [ ] `SITE_URL` con `https://` (Vercel ya usa modo producción).
- [ ] HTTPS funcionando (candado en el navegador; Vercel lo da solo).
- [ ] Administrador creado con una contraseña fuerte y única.
- [ ] Productos demo eliminados y fotos reales subidas.
- [ ] Número de WhatsApp, email, dirección y redes cargados en *Admin → Configuración*.
- [ ] Textos de envíos, cambios y términos revisados (ver [Pendientes](#pendientes-antes-de-lanzar)).
- [ ] Hiciste un pedido de prueba completo y lo cancelaste (el stock vuelve).
- [ ] Copias de seguridad (plan Pro de Supabase o tus propios `pg_dump`).
- [ ] Sitemap enviado a Google Search Console (`https://tudominio.com/sitemap.xml`).

---

## Backups

Se respaldan **dos cosas**: la base de datos y las fotos.

- **Base de datos (Supabase):** el plan Pro incluye copias diarias (*Database → Backups*). En el plan gratis hacé tus propias copias.
  Con las herramientas de PostgreSQL y la conexión **directa** (*Connect → Direct connection*, puerto 5432):
  ```bash
  pg_dump "postgresql://postgres:TU_CLAVE@db.TU_PROYECTO.supabase.co:5432/postgres" --no-owner -f backup-marea-$(date +%F).sql
  ```
- **Fotos:** *Storage → productos* permite descargarlas desde el panel de Supabase. Además, las originales las tenés en tu computadora y en tu celular.
- Guardá las copias en otro lugar (Google Drive, disco externo). Para restaurar: `psql "<conexión>" -f backup.sql`.

---

## Seguridad

- **Panel protegido:** todas las rutas de `/admin` exigen sesión; cookie `HttpOnly`, `SameSite=Lax` y `Secure` en producción, limitada a `/admin`; sesiones con vencimiento.
- **Contraseñas** con scrypt y sal; comparación en tiempo constante; mensaje de error idéntico para email o clave incorrectos.
- **CSRF:** todos los formularios del panel llevan token; el login usa un token propio.
- **Límite de intentos** en el login (8 cada 15 min por IP) y en la creación de pedidos, guardado en la base (vale aunque haya varias instancias).
- **Validación en el servidor** de todo: datos del cliente, cantidades, stock, precios (siempre se leen de la base), formularios del panel y subida de imágenes (se verifica que sean imágenes reales y se recodifican a WebP).
- **Stock atómico:** descuento condicional dentro de una transacción; imposible quedar en negativo ni vender dos veces la última unidad.
- **Cabeceras de seguridad** (Helmet): Content-Security-Policy estricta (sin scripts inline), HSTS en producción, sin `X-Powered-By`.
- **API de pedidos** solo acepta JSON del mismo origen.
- SQL siempre con parámetros (sin concatenar datos del usuario). Todo el HTML se escapa en las vistas. En Supabase las tablas tienen RLS activado (la clave pública no accede).
- Los datos personales no viajan por la URL ni se muestran en la página de confirmación.

Recomendaciones: usá una clave única y larga para el administrador, mantené Node y las dependencias al día (`npm audit`) y hacé backups.

---

## Estructura del proyecto

```
server.js                    Arranque local / Render / VPS
api/index.js                 Entrada de Vercel (la app Express)
vercel.json                  Configuración de Vercel (región, función, rutas)
src/
  app.js                     Configuración de Express, seguridad y variables de las vistas
  config.js · constants.js   Configuración, métodos de entrega/pago, estados, provincias
  db/                        Conexión PostgreSQL (Supabase o PGlite local), migraciones (migrations/*.sql) e importador desde SQLite
  bootstrap.js               Prepara la base al iniciar (migraciones, datos básicos, administrador inicial)
  repositories/              Acceso a datos: productos, pedidos, talles/categorías, configuración
  services/
    orders.js                Crear pedido + descontar stock + cambiar estado (transacciones)
    cart.js                  Estado real del carrito (precio/stock) a partir de lo que manda el navegador
    whatsapp.js              Armado del mensaje y del enlace de WhatsApp
    auth.js                  Login y sesiones
    images.js · storage.js   Procesamiento de fotos y almacenamiento (Supabase Storage o carpeta local)
    rate-limit-store.js      Contadores de límite de intentos en la base
  middleware/admin-auth.js   Sesión y CSRF del panel
  routes/                    public.js (tienda) · api.js (carrito/pedidos) · admin.js (panel)
  utils/                     Validaciones y formato (moneda, fechas)
  content/faq.js             Preguntas frecuentes
  views/                     Plantillas EJS: pages/ partials/ admin/
public/
  css/main.css · admin.css   Estilos
  js/                        cart.js (carrito) · cart-ui.js · product.js · checkout.js · ui.js · admin.js
  img/ · uploads/            Imágenes del sitio y fotos subidas
scripts/                     db-init · db-seed · db:import-sqlite · create-admin · hero:build · generate-art
tests/                       Pruebas automáticas
```

---

## Personalización

- **Colores y tipografías:** variables al inicio de `public/css/main.css` (`--ink`, `--coral`, `--aqua`…). Fuentes: Bricolage Grotesque + DM Sans (Google Fonts), definidas en `src/views/partials/head.ejs`.
- **Imagen principal (banner):** es un collage con las 6 mallas que se arma solo con las fotos principales de tus productos. Cuando cambies mallas o fotos, corré `npm run hero:build` y recargá la tienda. El fondo (atardecer) es `public/img/hero.svg`; si preferís una foto de playa, reemplazalo por tu foto con el mismo nombre de archivo o cambiá la ruta en `src/views/pages/home.ejs`. La imagen para compartir en redes (`public/img/og-default.jpg`) se genera en el mismo paso.
- **Logo:** se dibuja en `scripts/build-logo.js` (la M de MAREA con el sol en la V y una ola). Si cambiás colores o formas, corré `npm run logo:build`: regenera los SVG de `public/img/logo/`, el favicon y, en la carpeta `brand/`, los PNG para Instagram, WhatsApp e impresión (versión color, fondo oscuro y una sola tinta). El encabezado y el pie usan `marea-logo.svg` / `marea-logo-sand.svg`, así que el nombre que cargues en *Admin → Configuración* ya no cambia el logo del encabezado (sí el título de la pestaña y los textos).
- **Preguntas frecuentes:** `src/content/faq.js`.
- **Métodos de entrega y pago, provincias:** `src/constants.js`.
- **Textos legales y de envíos:** `src/views/pages/` (`shipping`, `returns`, `terms`).
- **Nuevos tipos de producto:** creá categorías desde el panel (campo "categoría nueva" en el producto) y talles nuevos ("Único", números, etc.). Los filtros y el catálogo ya los soportan.

---

## Pruebas

```bash
npm test
```

32 pruebas automáticas contra una base PostgreSQL temporal (en memoria): stock por talle, pedidos simultáneos por la última unidad, rechazo de talles agotados y cantidades inválidas,
validación del checkout, mensaje y número de WhatsApp, cancelación/reactivación de pedidos, API del carrito, SEO, seguridad del panel (sin sesión, CSRF, login),
alta/edición de productos, subida y borrado de imágenes, configuración, almacenamiento en Supabase Storage (con un servidor simulado), límite de intentos compartido e importación desde SQLite.

---

## Pendientes antes de lanzar

1. **Fotos reales.** Las ilustraciones de los productos demo son de ejemplo.
2. **Revisar los textos legales y de políticas** (`envios`, `cambios-y-devoluciones`, `terminos-y-condiciones`, preguntas frecuentes). Son una base razonable
   para Argentina (plazos de cambio, botón de arrepentimiento de 10 días, etc.), pero **deben ser validados/ajustados por vos o por un profesional** según cómo operes.
3. **Pagos:** la tienda no cobra online. Transferencia, Mercado Pago y efectivo se coordinan por WhatsApp. Más adelante se puede integrar Mercado Pago Checkout.
4. **Costo de envío:** hoy se coordina por WhatsApp (el pedido muestra "A coordinar"). Se puede agregar una tabla de tarifas por provincia.
5. **Redes sociales:** cargá los enlaces en *Admin → Configuración* para que aparezcan los íconos.
6. **Horario de atención** de la página de contacto: editalo en `src/views/pages/contact.ejs`.


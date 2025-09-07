# Parámetros de exportación y autenticación

Para exportar guías debes hacer una petición al endpoint `/guides` con los siguientes parámetros en la URL:

- `stardate`: (opcional) Fecha de inicio del rango a exportar, en formato ISO (ejemplo: `2025-08-01T00:00:00.000Z`). Si no se especifica, se toma el inicio del mes anterior.
- `enddate`: (opcional) Fecha de fin del rango a exportar, en formato ISO (ejemplo: `2025-09-01T23:59:59.000Z`). Si no se especifica, se toma el final del día actual.
- `storeName`: (opcional si solo hay una tienda) Nombre de la tienda a usar, debe coincidir con el nombre configurado en las variables de entorno (por ejemplo: `ZILONIX`). Si hay más de una tienda, es obligatorio.

### Ejemplo de URL

```
http://localhost:3004/guides?stardate=2025-08-01T00:00:00.000Z&enddate=2025-09-01T23:59:59.000Z&storeName=ZILONIX
```

### Autenticación con JSON Web Token (JWT)

Todos los endpoints protegidos requieren un header `Authorization` con un JWT firmado usando tu `TOKEN_SECRET` definido en el `.env`.

Ejemplo de header:

```
Authorization: Bearer <tu_token_jwt>
```

Puedes generar un token usando el script incluido:

```
npm run token '{"user":"admin"}'
```

El token debe ser válido y firmado con el mismo secreto configurado en el backend.

# extractLead

Este proyecto automatiza la exportación de guías de transporte desde Effi, permitiendo seleccionar diferentes tiendas configuradas mediante variables de entorno. Utiliza Node.js, Express y Playwright para la automatización y generación de archivos descargables.

## ¿Cómo funciona?

- El backend expone endpoints para iniciar la exportación de guías (`/guides`), consultar el estado de la tarea y descargar el archivo generado.
- Soporta múltiples tiendas, cada una configurada mediante variables de entorno.
- La exportación se realiza en segundo plano y se puede consultar el progreso mediante un jobId.

## Configuración de variables de entorno

Debes definir en tu archivo `.env` las credenciales de cada tienda con el siguiente formato:

```
EFFI_STORE_NOMBRE_USERNAME=usuario
EFFI_STORE_NOMBRE_PASSWORD=contraseña
```

Ejemplo:

```
PORT=3004
TOKEN_SECRET=mi-clave-secreta
EFFI_STORE_ZILONIX_USERNAME=grupozilonix@gmail.com
EFFI_STORE_ZILONIX_PASSWORD=2025ZILONIX12
```

Puedes definir varias tiendas cambiando `NOMBRE` por el identificador de cada tienda.

## Lógica de selección de tienda

La función `escojerTienda(storeName)` busca todas las variables de entorno que sigan el patrón anterior y agrupa usuario y contraseña por tienda. Si hay más de una tienda, debes especificar el parámetro `storeName` en la consulta. Si solo hay una, se selecciona automáticamente.

## Docker Usage

### Quick Start with Docker

The easiest way to run extractLead is using Docker:

```bash
# Build and run with docker-compose
docker compose up --build

# Or run directly with Docker
docker build -t extractlead .
docker run -d -p 3004:3004 -e PORT=3004 -e TOKEN_SECRET=your-secret --name extractlead extractlead
```

### Environment Variables for Docker

When running with Docker, you can set environment variables in several ways:

1. **Using .env file** (recommended for local development):
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   docker compose up
   ```

2. **Using environment variables directly**:
   ```bash
   docker run -d -p 3004:3004 \
     -e PORT=3004 \
     -e TOKEN_SECRET=your-secret \
     -e EFFI_STORE_ZILONIX_USERNAME=user@example.com \
     -e EFFI_STORE_ZILONIX_PASSWORD=password123 \
     --name extractlead extractlead
   ```

3. **Using docker-compose with environment file**:
   ```yaml
   services:
     extractlead:
       build: .
       environment:
         - PORT=3004
         - TOKEN_SECRET=your-secret
         - EFFI_STORE_ZILONIX_USERNAME=user@example.com
         - EFFI_STORE_ZILONIX_PASSWORD=password123
   ```

### Docker Health Check

The Docker image includes a health check that monitors the `/health` endpoint:

```bash
# Check container health
docker ps
# or
docker inspect extractlead --format='{{.State.Health.Status}}'
```

### GitHub Container Registry

This project is automatically published to GitHub Container Registry (GHCR) when changes are pushed to the main branch. You can pull and run the pre-built image:

```bash
# Pull from GitHub Container Registry
docker pull ghcr.io/pedropab/extractlead:latest

# Run the pre-built image
docker run -d -p 3004:3004 --env-file .env ghcr.io/pedropab/extractlead:latest
```

### Available Images and Tags

- `ghcr.io/pedropab/extractlead:latest` - Latest stable version from main branch
- `ghcr.io/pedropab/extractlead:v1.0.0` - Specific version tags (when using semantic versioning)

### Docker Best Practices Implemented

- ✅ Multi-stage build optimization
- ✅ Non-root user for security
- ✅ Health checks for container monitoring
- ✅ Proper .dockerignore for smaller build context
- ✅ Environment variable configuration
- ✅ Automatic publishing to GitHub Container Registry

## Uso

1. Instala las dependencias:

   ```sh
   npm install
   ```

2. Configura tu archivo `.env` con las tiendas y credenciales.
3. Inicia el servidor:

   ```sh
   npm run dev
   ```

4. Inicia una exportación de guías:

   ```sh
   curl 'http://localhost:3004/guides?stardate=5-09-2025&enddate=6-09-2025&storeName=ZILONIX'
   ```

   Esto devolverá un `jobId`.
5. Consulta el estado del job:

   ```sh
   curl 'http://localhost:3004/jobs/<jobId>'
   ```

6. Descarga el archivo generado (cuando el job esté listo):

   ```sh
   curl -O 'http://localhost:3004/jobs/<jobId>/download'
   ```

## Notas

- El tiempo de espera para descargas grandes está configurado a 5 minutos.
- El sistema es compatible con múltiples tiendas y es robusto ante configuraciones incompletas.
- El backend no almacena archivos ni credenciales, todo es en memoria y por variables de entorno.

---

¿Dudas? Consulta el código fuente o abre un issue.

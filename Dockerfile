# Imagen base oficial de Node.js (alpine es ligera)
FROM node:20-alpine

# Directorio de trabajo
WORKDIR /app

# Copiar solo package.json y package-lock.json para instalar dependencias primero (mejor cache)
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --omit=dev

# Copiar el resto del código, excluyendo archivos .env
COPY . .

# Crear carpeta temp y definir como volumen
RUN mkdir -p /app/temp
VOLUME ["/app/temp"]


# Exponer el puerto definido por la variable de entorno PORT (por defecto 3004)
ARG PORT=3004
ENV PORT=${PORT}
EXPOSE ${PORT}

# Comando por defecto
CMD ["npm", "run", "start"]

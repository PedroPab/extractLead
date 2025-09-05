# Imagen base oficial de Node.js (alpine es ligera)
FROM node:20-alpine

# Directorio de trabajo
WORKDIR /app

# Copiar solo package.json y package-lock.json para instalar dependencias primero (mejor cache)
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --omit=dev

# Copiar el resto del código
COPY . .

# Exponer el puerto (ajusta si usas otro)
EXPOSE 3004

# Comando por defecto
CMD ["npm", "run", "start"]

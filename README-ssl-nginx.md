# Configuración de Nginx como proxy y SSL con Certbot para extractlead.toxolinko.site

## 1. Archivo de configuración Nginx (básico, sin SSL)

Guarda esto como `nginx-extractlead.conf`:

```nginx
server {
    listen 80;
    server_name extractlead.toxolinko.site;

    location / {
        proxy_pass http://localhost:3004;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    client_max_body_size 50M;
}
```

---

## 2. Habilitar el sitio en Nginx

1. Copia el archivo a `/etc/nginx/sites-available/`:

   ```sh
   sudo cp nginx-extractlead.conf /etc/nginx/sites-available/extractlead
   ```

2. Crea un enlace simbólico:

   ```sh
   sudo ln -s /etc/nginx/sites-available/extractlead /etc/nginx/sites-enabled/
   ```

3. Recarga Nginx:

   ```sh
   sudo nginx -t && sudo systemctl reload nginx
   ```

---

## 3. Instalar SSL con Certbot (Let's Encrypt)

1. Instala Certbot y el plugin para Nginx:

   ```sh
   sudo apt update
   sudo apt install certbot python3-certbot-nginx
   ```

2. Ejecuta Certbot para tu dominio:

   ```sh
   sudo certbot --nginx -d extractlead.toxolinko.site
   ```

3. Sigue las instrucciones y Certbot configurará el SSL automáticamente.

---

## 4. Verifica el acceso seguro

- Accede a <https://extractlead.toxolinko.site> y verifica que el certificado sea válido.
- Certbot renovará el certificado automáticamente.

---

¿Dudas? Consulta la documentación oficial de Certbot: <https://certbot.eff.org/instructions>

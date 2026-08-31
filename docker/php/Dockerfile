# lagricontrol — Apache + PHP 8.1
#
# Decision de Kevin (2026-08-31): se trabaja en PHP 8.1.
#
# El comentario anterior decia que Grocery CRUD y CodeIgniter 3.1.11 "rompen en
# PHP 8.x". Se probo y NO es cierto: con la app corriendo en el contenedor bajo
# PHP 8.4.21 (mas estricto que 8.1) arrancan CodeIgniter 3.1.11 e ion_auth, y
# Grocery CRUD 1.6.1 renderiza el listado, el formulario de alta y el de
# edicion sin un solo fatal ni un deprecation en el log.
#
# Lo que ese ensayo NO cubrio, y hay que mirar al levantar el contenedor:
#   - guardar de verdad desde Grocery CRUD (POST de alta/edicion/borrado)
#   - los campos de archivo/imagen (postcosecha)
#   - el login real de ion_auth (POST) y las sesiones
#   - los controladores de Operations/PM (reportes de pago)
#
# CAMBIO DE COMPORTAMIENTO IMPORTANTE: desde PHP 8.1 mysqli LANZA
# mysqli_sql_exception en vez de devolver FALSE. CodeIgniter 3 no lo sabe: su
# chequeo de db_debug no llega a correr y cualquier error de base se vuelve una
# excepcion no capturada. V4.php ya lo maneja; V3 y la web NO. Si aparece una
# pantalla de "uncaught Exception mysqli_sql_exception", es esto.
FROM php:8.1-apache

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpng-dev libjpeg-dev libfreetype6-dev libzip-dev unzip \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" mysqli gd zip \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*

# Subida de imágenes de postcosecha
RUN { \
      echo 'upload_max_filesize = 256M'; \
      echo 'post_max_size = 256M'; \
      echo 'memory_limit = 512M'; \
      echo 'date.timezone = America/Guayaquil'; \
    } > /usr/local/etc/php/conf.d/zz-lagricontrol.ini

COPY vhost.conf /etc/apache2/sites-available/000-default.conf

WORKDIR /var/www/html

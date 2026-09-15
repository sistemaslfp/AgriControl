# lagricontrol — Apache + PHP 7.3
#
# Decision de Kevin (2026-09-15): el contenedor corre la MISMA version que
# produccion. El servidor real es PHP 7.3.27 sobre XAMPP; desarrollar en 8.1
# contra un destino 7.3 es probar en un runtime que no es el de llegada.
#
# La 7.3 tambien hace desaparecer el problema que nos costo la tarde: bajo
# PHP 8.1, CodeIgniter 3.1.11 emite seis E_DEPRECATED al cargar
# CI_Session_database_driver (implementa SessionHandlerInterface sin los tipos
# de retorno nuevos), el _error_handler de CI los imprime, la salida sale antes
# que los headers y se cae en cascada session_start() y el redirect a
# auth/login. En 7.3 no existe ninguno de esos avisos.
#
# SI ALGUN DIA SE SUBE PRODUCCION A 8.x: el arreglo NO es callar E_DEPRECATED,
# es actualizar system/ a CodeIgniter 3.1.13. La 3.1.12 (2022-03-03) agrego
# clases wrapper alrededor de los drivers de Session justo para esto, y la
# 3.1.13 corrige un bug que aquella introdujo. 3.1.13 es la ultima de la rama 3
# y sigue soportando PHP viejo, asi que sirve para 7.3 y para 8.1 a la vez.
#
# La imagen oficial php:7.3-apache es 7.3.33 (produccion: 7.3.27). Son parches
# de la misma minor: mismas funciones, mismo comportamiento del lenguaje.
FROM php:7.3-apache

# Debian buster esta ARCHIVADO. Sin esto, el apt-get update de abajo muere con
# 404 contra deb.debian.org y la imagen no compila. Check-Valid-Until off
# porque los indices archivados tienen la fecha de expiracion vencida.
RUN set -eux; \
    sed -i 's|deb.debian.org/debian|archive.debian.org/debian|g; \
            s|security.debian.org/debian-security|archive.debian.org/debian-security|g; \
            s|deb.debian.org/debian-security|archive.debian.org/debian-security|g; \
            /buster-updates/d' /etc/apt/sources.list; \
    echo 'Acquire::Check-Valid-Until "false";' > /etc/apt/apt.conf.d/99no-check-valid-until

# OJO con gd: en 7.3 las opciones llevan sufijo `-dir=`. La forma sin sufijo
# (--with-freetype --with-jpeg) es de 7.4 en adelante y aqui se ignora con un
# "unrecognized options", dejando gd sin soporte de JPEG ni FreeType.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpng-dev libjpeg-dev libfreetype6-dev libzip-dev unzip \
    && docker-php-ext-configure gd --with-freetype-dir=/usr/include/ --with-jpeg-dir=/usr/include/ \
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

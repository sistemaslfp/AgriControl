# lagricontrol — Apache + PHP 7.4
# PHP 7.4 es deliberado: Grocery CRUD y CodeIgniter 3.1.11 rompen en PHP 8.x.
FROM php:7.4-apache

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

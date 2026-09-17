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

# ---------------------------------------------------------------------------
# REPOSITORIOS: la imagen esta sobre Debian 11 (bullseye), ya archivado.
#
# El sources.list NO se edita con sed, se REESCRIBE entero. Editarlo dependia
# de adivinar como venian escritas las lineas y fallo dos veces; esto no
# depende de nada previo.
#
# Se quedan solo los dos repos que SI existen en archive.debian.org: `bullseye`
# y `bullseye-updates`. El de seguridad NO esta archivado -- responde 404 a
# `bullseye-security` -- y basta ese 404 para que apt-get update salga con
# codigo 100 y tumbe el build entero.
#
# Consecuencia asumida: los paquetes de abajo quedan sin los parches de
# seguridad de bullseye. Es un contenedor de desarrollo local que no se expone;
# si algun dia sale a una red, esto se revisa.
#
# Check-Valid-Until off porque los indices archivados tienen vencida su fecha
# de expiracion y apt los rechazaria por eso. El `cat` final deja el archivo
# resultante en el log del build: si algo vuelve a fallar aca, se ve.
# ---------------------------------------------------------------------------
RUN set -eux; \
    rm -rf /etc/apt/sources.list.d/*; \
    printf '%s\n' \
      'deb http://archive.debian.org/debian bullseye main' \
      'deb http://archive.debian.org/debian bullseye-updates main' \
      > /etc/apt/sources.list; \
    printf '%s\n' \
      'Acquire::Check-Valid-Until "false";' \
      > /etc/apt/apt.conf.d/99no-check-valid-until; \
    cat /etc/apt/sources.list

# OJO con gd: en PHP 7.3 las opciones llevan sufijo `-dir=`. La forma sin
# sufijo (--with-freetype --with-jpeg) es de 7.4 en adelante y aqui se ignora
# con un "unrecognized options" SIN fallar el build, dejando gd sin soporte de
# JPEG ni FreeType -- o sea las fotos de postcosecha rotas y ningun error que
# lo explique. El grep del final falla el build si eso pasa.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        libpng-dev libjpeg62-turbo-dev libfreetype6-dev libzip-dev unzip; \
    docker-php-ext-configure gd --with-freetype-dir=/usr/include/ --with-jpeg-dir=/usr/include/; \
    docker-php-ext-install -j"$(nproc)" mysqli gd zip; \
    a2enmod rewrite headers; \
    rm -rf /var/lib/apt/lists/*; \
    php -r 'print_r(gd_info());' | grep -Ei 'JPEG|FreeType'

# Subida de imagenes de postcosecha
RUN { \
      echo 'upload_max_filesize = 256M'; \
      echo 'post_max_size = 256M'; \
      echo 'memory_limit = 512M'; \
      echo 'date.timezone = America/Guayaquil'; \
    } > /usr/local/etc/php/conf.d/zz-lagricontrol.ini

# RENDIMIENTO (2026-09-17): el codigo vive en un bind mount de Windows y cada
# include de PHP es I/O lento sobre ese mount. Medido en el log de CI: la pantalla
# de login tardaba 3-6 s y el reporte de pagos 5,5-6,3 s, casi todo repartido en
# cargar clases (la parte de Grocery CRUD + SQL no pasaba de 1 s). Sin opcache,
# PHP relee y recompila unos 80 archivos en cada request.
# revalidate_freq=2: un cambio en un .php se ve a los 2 s como maximo.
RUN set -eux; \
    docker-php-ext-install opcache; \
    { \
      echo 'opcache.enable = 1'; \
      echo 'opcache.memory_consumption = 128'; \
      echo 'opcache.max_accelerated_files = 10000'; \
      echo 'opcache.validate_timestamps = 1'; \
      echo 'opcache.revalidate_freq = 2'; \
      echo 'realpath_cache_size = 4096K'; \
      echo 'realpath_cache_ttl = 600'; \
    } > /usr/local/etc/php/conf.d/zz-opcache.ini

COPY vhost.conf /etc/apache2/sites-available/000-default.conf

WORKDIR /var/www/html

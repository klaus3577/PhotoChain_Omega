# syntax=docker/dockerfile:1
# PhotoChain – többlépcsős (multi-stage) Docker-kép (L31).
#   1. client-build:  a webes felület buildje (Vite) → /build/client/dist
#   2. server-build:  a szerver függőségei (a fejlesztőiekkel), Prisma-kliens, TypeScript-fordítás;
#                     ezt a képet használja a Compose `migrate` szolgáltatása is (prisma migrate deploy)
#   3. runtime:       node:24-slim (glibc – a sharp előre fordított libvips-e így közvetlenül fut), csak
#                     a futtatáshoz szükséges függőségek, nem root felhasználó (node)
# A titkos kulcsok nem kerülnek a képbe: a .env fájlokat a .dockerignore kizárja, a változókat a
# Compose adja át futáskor.
# Források: Docker Docs – Multi-stage builds, https://docs.docker.com/build/building/multi-stage/;
# Node.js Docker Best Practices (nem root felhasználó, NODE_ENV=production, init),
# https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md; sharp – Installation
# (Linux, glibc), https://sharp.pixelplumbing.com/install; Docker Docs – Building best practices (Pin
# base image versions), https://docs.docker.com/build/building/best-practices/; Render – Deploy from
# a Dockerfile (build-argumentumok), https://render.com/docs/docker; sharp – Performance
# (MALLOC_ARENA_MAX), https://sharp.pixelplumbing.com/performance (adaptálva)

# Pontos verzióra és tartalmi ujjlenyomatra (digest) rögzítve (Node és Debian): egy újraépítés nem
# cserélheti ki csendben az alapot – a vízjel betűkészlete és így az előnézet is ezen múlik. A frissítést
# a fejlesztői repóban a Dependabot javasolja (dependabot.yml, L32): ezért literális FROM, nem ARG.
FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS node-base

# --- 1. A webes felület buildje --------------------------------------------------------------
FROM node-base AS client-build
WORKDIR /build/client
# Előbb csak a csomagjegyzék: a függőségek rétege csak akkor épül újra, ha ezek változnak
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
# A képpontkorlát (L32) a kliens súgójába és előzetes ellenőrzésébe is bekerül. A Render a környezeti
# változókat build-argumentumként is átadja – csak a deklaráltakat használja a build, titkot nem –,
# így a szerver és a kliens ugyanazt az IMAGE_MAX_MEGAPIXELS értéket kapja.
ARG IMAGE_MAX_MEGAPIXELS=50
RUN VITE_IMAGE_MAX_MEGAPIXELS="$IMAGE_MAX_MEGAPIXELS" npm run build

# --- 2. A szerver buildje ---------------------------------------------------------------------
FROM node-base AS server-build
# A Prisma sémamotorja (a `migrate` szolgáltatás) OpenSSL-t kér – a slim kép nem tartalmazza
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /build/server
# A postinstall `prisma generate`-hez a séma és a Prisma-konfiguráció is kell – csak ezek (egy új
# migráció vagy a seed módosítása így nem építteti újra a függőségek rétegét)
COPY server/package.json server/package-lock.json server/prisma.config.ts ./
COPY server/prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci --no-audit --no-fund
COPY server/ ./
RUN npm run build

# --- 3. A futtatókép ----------------------------------------------------------------------------
FROM node-base AS runtime
# A vízjel szövegéhez betűkészlet kell (a slim kép üres; nélküle csak a vízjel vonalai látszanának)
RUN apt-get update \
  && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*
# MALLOC_ARENA_MAX=2: a glibc memóriafoglalója a sok szálú képfeldolgozásnál kevesebb memóriát hagy
# kihasználatlanul (sharp – Performance; az ingyenes Render-példány 512 MB-os, L32)
ENV NODE_ENV=production \
  MALLOC_ARENA_MAX=2
WORKDIR /app/server
# Csak a futtatáshoz szükséges függőségek. A telepítő scriptek nem futnak: a Prisma-kliens a
# build-szakaszban már elkészült (a lefordított dist/ része), a sharp az előre fordított,
# platformhoz illő csomagjából tölti be a libvips-et. A választható „peer” függőségek sem kellenek
# (--legacy-peer-deps): a @prisma/client ilyenként a teljes Prisma parancssori eszközt és a
# TypeScriptet húzná be (~200 MB).
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps --ignore-scripts --no-audit --no-fund \
  && npm cache clean --force
COPY --from=server-build /build/server/dist ./dist
COPY --from=client-build /build/client/dist /app/client
# Az éles adatbázis (Supabase) tanúsítványát aláíró CA – nyilvános tanúsítvány (L32, DATABASE_SSL_CA_FILE)
COPY server/certs ./certs
# A feltöltött képek helye (a Compose kötetet csatol ide); a node felhasználó írhatja
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
# TRUST_PROXY_HOPS=0: proxy nélkül futtatva (pl. docker run -p) az X-Forwarded-For fejlécben nem
# bízunk; fordított proxy mögött (L32) kifejezetten be kell állítani
ENV PORT=4000 \
  UPLOAD_DIR=/app/uploads \
  CLIENT_DIST_DIR=/app/client \
  TRUST_PROXY_HOPS=0
EXPOSE 4000
# Az állapotellenőrzés a kép saját Node-jával (a slim képben nincs curl), a beállított porton
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 4000}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server.js"]

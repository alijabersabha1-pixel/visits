# نظام زيارات فريق السفراء — صورة واحدة للموقع
# البناء: docker compose build      التشغيل: docker compose up -d

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: ما بنحتاج سكربتات التثبيت، وتوليد Prisma بيصير بالخطوة الجاية
RUN npm ci --ignore-scripts

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# توليد Prisma Client ما بيحتاج محرك الـ migrations، فبنمنع تنزيله (البناء بيشتغل بدون نت)
ENV PRISMA_SCHEMA_ENGINE_BINARY=/bin/false
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# الأدوات (إنشاء أول حساب وغيره): docker compose run --rm tools npm run create-user -- ...
FROM builder AS tools

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system app && useradd --system --gid app app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/prisma/migrations ./prisma/migrations
COPY --from=builder --chown=app:app /app/scripts/migrate.mjs ./scripts/migrate.mjs
# مكتبة pg (للـ migrations) موجودة أصلاً بـ standalone لأن Prisma بيستعملها
USER app
EXPOSE 3000
# الـ migrations بتنطبق تلقائياً قبل ما يشتغل الموقع
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]

FROM node:22-alpine AS build
WORKDIR /app
COPY apps/api/package.json ./package.json
RUN npm install --include=dev
COPY apps/api .
RUN npx prisma generate --schema prisma/schema.prisma && npx nest build
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/public ./public
CMD ["sh","-c","./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma && node dist/src/main.js"]

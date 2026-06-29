FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY public ./public
COPY .env.example ./.env.example
COPY README.md ./README.md
COPY SUBMISSION_CHECKLIST.md ./SUBMISSION_CHECKLIST.md

RUN npm run build

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/.env.example ./.env.example
COPY --from=build /app/README.md ./README.md
COPY --from=build /app/SUBMISSION_CHECKLIST.md ./SUBMISSION_CHECKLIST.md

EXPOSE 8787

CMD ["npm", "run", "start"]

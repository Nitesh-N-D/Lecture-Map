# Dev-mode Dockerfile for the Vite frontend, used by docker-compose.yml
# for local development (hot reload via the mounted volume). This is NOT
# the production build artifact — Vercel/Netlify/static hosts build the
# frontend directly with `npm run build` and serve the static `dist/`
# output, bypassing this file entirely. See vercel.json for that path.

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

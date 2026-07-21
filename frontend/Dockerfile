FROM node:20-alpine AS build

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 300000

# Railway exposes service variables as build args for declared ARGs.
ARG REACT_APP_BACKEND_URL
ARG REACT_APP_CHECKOUT_URL
ARG REACT_APP_GOOGLE_MAPS_API_KEY
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL \
    REACT_APP_CHECKOUT_URL=$REACT_APP_CHECKOUT_URL \
    REACT_APP_GOOGLE_MAPS_API_KEY=$REACT_APP_GOOGLE_MAPS_API_KEY \
    CI=false

COPY . .
RUN yarn build

FROM node:20-alpine
RUN npm install -g serve@14
WORKDIR /app
COPY --from=build /app/build ./build
CMD serve -s build -l ${PORT:-3000}

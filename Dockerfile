# ---- Dependencies ----
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN yarn install
ARG BASE_PATH=/
RUN yarn build --base=${BASE_PATH}

FROM nginx:1.24-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/sub-proxy.inc /etc/nginx/conf.d/sub-proxy.inc
COPY --chmod=755 docker/40-subweb-config.sh /docker-entrypoint.d/40-subweb-config.sh
# 原样中转默认开启：token 自动生成；显式 -e VITE_SUB_PROXY_TOKEN= 置空可关闭
ENV VITE_SUB_PROXY_TOKEN=auto
EXPOSE 80
CMD [ "nginx", "-g", "daemon off;" ]

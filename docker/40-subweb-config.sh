#!/bin/sh
set -eu

escape() {
  printf '%s' "$1" | tr '\n' ' ' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

# VITE_SUB_PROXY_TOKEN=auto 时自动生成随机 token 并持久化到状态文件。
# 注意：容器重建且状态目录无卷时 token 轮换，已生成的中转链接会失效
if [ "${VITE_SUB_PROXY_TOKEN:-}" = "auto" ]; then
  TOKEN_STATE="${SUB_PROXY_TOKEN_STATE:-/var/lib/sub-web/token}"
  TOKEN_DIR="${TOKEN_STATE%/*}"
  [ "$TOKEN_DIR" = "$TOKEN_STATE" ] && TOKEN_DIR=.
  mkdir -p "$TOKEN_DIR" 2>/dev/null || true
  VITE_SUB_PROXY_TOKEN=$(cat "$TOKEN_STATE" 2>/dev/null || true)
  case "$VITE_SUB_PROXY_TOKEN" in
    *[!A-Za-z0-9_-]*|'')
      VITE_SUB_PROXY_TOKEN=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
      if ! printf '%s' "$VITE_SUB_PROXY_TOKEN" > "$TOKEN_STATE" 2>/dev/null; then
        echo "sub-web: token 无法持久化到 $TOKEN_STATE，容器重建后中转链接将失效" >&2
      fi ;;
  esac
fi

# off 显式关闭端点；token 只允许 [A-Za-z0-9_-]（$ 会引发 nginx 变量插值——鉴权绕过或启动
# 失败；空格会被 URLSearchParams 编码成 + 而 nginx 的 arg 解码不还原 +），非法值置空后
# config.js 才能正确提示"未配置"，否则前端会生成注定 403 的链接
if [ "${VITE_SUB_PROXY_TOKEN:-}" = "off" ]; then
  VITE_SUB_PROXY_TOKEN=''
fi
if [ -n "${VITE_SUB_PROXY_TOKEN:-}" ]; then
  case "${VITE_SUB_PROXY_TOKEN}" in
    *[!A-Za-z0-9_-]*)
      echo "sub-web: VITE_SUB_PROXY_TOKEN 只允许 [A-Za-z0-9_-]，/sub-proxy 保持关闭" >&2
      VITE_SUB_PROXY_TOKEN='' ;;
  esac
fi

# VITE_SUB_PROXY_ALLOW 可选：逗号分隔的源域名后缀白名单（token 随 config.js 公开，白名单
# 是收敛手段）。只允许域名字符——正则元字符会让生成的 nginx 配置非法导致整个容器起不来，
# 非法值宁可关闭端点也不放行
PROXY_ALLOW=''
if [ -n "${VITE_SUB_PROXY_ALLOW:-}" ]; then
  case "$(printf '%s' "${VITE_SUB_PROXY_ALLOW}" | tr -d '[:space:]')" in
    *[!A-Za-z0-9.,_-]*)
      echo "sub-web: VITE_SUB_PROXY_ALLOW 含非法字符，/sub-proxy 保持关闭" >&2
      VITE_SUB_PROXY_TOKEN='' ;;
    *)
      PROXY_ALLOW=$(printf '%s' "${VITE_SUB_PROXY_ALLOW}" | tr -d '[:space:]' | sed 's/\./\\./g; s/,/|/g') ;;
  esac
fi

cat > /usr/share/nginx/html/config.js <<EOF
window.__SUB_WEB_CONFIG__ = {
  VITE_PROJECT: "$(escape "${VITE_PROJECT:-}")",
  VITE_BOT_LINK: "$(escape "${VITE_BOT_LINK:-}")",
  VITE_BACKEND_RELEASE: "$(escape "${VITE_BACKEND_RELEASE:-}")",
  VITE_SUBCONVERTER_REMOTE_CONFIG: "$(escape "${VITE_SUBCONVERTER_REMOTE_CONFIG:-}")",
  VITE_SUBCONVERTER_DOC_ADVANCED: "$(escape "${VITE_SUBCONVERTER_DOC_ADVANCED:-}")",
  VITE_SUBCONVERTER_DEFAULT_BACKEND: "$(escape "${VITE_SUBCONVERTER_DEFAULT_BACKEND:-}")",
  VITE_BACKEND_OPTIONS: "$(escape "${VITE_BACKEND_OPTIONS:-}")",
  VITE_MYURLS_API: "$(escape "${VITE_MYURLS_API:-}")",
  VITE_CONFIG_UPLOAD_API: "$(escape "${VITE_CONFIG_UPLOAD_API:-}")",
  VITE_USE_STORAGE: "$(escape "${VITE_USE_STORAGE:-}")",
  VITE_CACHE_TTL: "$(escape "${VITE_CACHE_TTL:-}")",
  VITE_SUB_PROXY_BASE: "$(escape "${VITE_SUB_PROXY_BASE:-}")",
  VITE_SUB_PROXY_TOKEN: "$(escape "${VITE_SUB_PROXY_TOKEN:-}")"
}
EOF

# 原样中转端点：配置 VITE_SUB_PROXY_TOKEN 后启用 /sub-proxy 透传（未配置时保留镜像内 404 存根）
# resolver 固定公网 DNS：词法封禁挡不住"域名解析到内网"（如 compose 网络的 <svc>.<net> 这类
# 带点 FQDN、host.docker.internal），而中转目标按设计只有外部源，不需要容器内 DNS。
# 残余面：公网域名故意指向私网 IP（rebinding）无法在纯 nginx 内拦截
if [ -n "${VITE_SUB_PROXY_TOKEN:-}" ]; then
cat > /etc/nginx/conf.d/sub-proxy.inc <<EOF
location = /sub-proxy {
    limit_except GET HEAD { deny all; }
    if (\$arg_token != "$(escape "${VITE_SUB_PROXY_TOKEN}")") { return 403; }
    if (\$arg_url !~* "^https?://[^/]+/") { return 400; }
    if (\$arg_url ~* "[\\x00-\\x20]") { return 400; }
    # 只中转外部源：硬封回环、私网、链路本地（含云元数据 169.254）、CGNAT/Tailscale、
    # 单标签主机名（容器服务名）、Docker 内部域名、全部 IPv6 字面量；自指 /sub-proxy 递归亦拒绝
    if (\$arg_url ~* "^https?://(localhost|[^./]+[:/]|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.|host\.docker\.internal|gateway\.docker\.internal|\[)") { return 400; }
    if (\$arg_url ~* "/sub-proxy(\?|/|$)") { return 400; }
$(if [ -n "$PROXY_ALLOW" ]; then printf '    if ($arg_url !~* "^https?://([^/]*\\.)?(%s)([/:]|$)") { return 403; }\n' "$PROXY_ALLOW"; fi)
    resolver 223.5.5.5 1.1.1.1 ipv6=off valid=300s;
    resolver_timeout 5s;
    proxy_pass \$arg_url;
    proxy_http_version 1.1;
    proxy_ssl_server_name on;
    proxy_set_header Connection "";
    proxy_set_header User-Agent \$http_user_agent;
    proxy_set_header Cookie "";
    proxy_set_header Authorization "";
    proxy_set_header Accept-Encoding "";
    proxy_connect_timeout 15s;
    proxy_read_timeout 90s;
    proxy_max_temp_file_size 16m;
    proxy_cache subweb_proxy;
    proxy_cache_key "\$request_method \$arg_url";
    proxy_cache_valid 200 10m;
    proxy_cache_lock on;
    proxy_hide_header Set-Cookie;
    proxy_ignore_headers Cache-Control Expires Set-Cookie X-Accel-Redirect X-Accel-Expires;
    # 中转内容在本站源下返回：sandbox 阻止其中脚本执行（防读 localStorage 里的订阅链接），
    # nosniff 防 Content-Type 嗅探成可执行类型；对订阅客户端无影响
    add_header Content-Security-Policy "sandbox" always;
    add_header X-Content-Type-Options "nosniff" always;
}
EOF
fi

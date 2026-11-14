# 原样中转端点默认关闭；设置 VITE_SUB_PROXY_TOKEN 后由 40-subweb-config.sh 覆盖本文件启用
location = /sub-proxy { return 404; }

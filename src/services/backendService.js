import { CONSTANTS } from '@/config/constants';
import { formatVersion } from '@/utils/formatters';
import { BACKEND_TYPES, parseBackendIdentity, formatBackendVersion } from '@/config/backend-types';

/**
 * 后端版本与类型探测服务
 */
export class BackendService {
  /**
   * 探测后端信息
   * @param {Object} $axios - Axios实例
   * @param {string} backend - 后端转换地址
   * @returns {Promise<{family: string, version: string}|null>} 无法访问时返回 null
   */
  static async probeBackend($axios, backend = CONSTANTS.DEFAULT_BACKEND) {
    const versionApiUrl = backend.split('?')[0].replace(/\/sub$/, '') + "/version";

    try {
      const response = await $axios.get(versionApiUrl, { timeout: 8000 });
      const text = typeof response.data === 'string' ? response.data : String(response.data || '');
      const identity = parseBackendIdentity(text);
      if (identity.family === BACKEND_TYPES.UNKNOWN && !text.trim()) {
        return null;
      }
      // legacy 保持旧的清理格式展示
      const version = identity.family === BACKEND_TYPES.LEGACY
        ? formatVersion(text)
        : formatBackendVersion(identity);
      return {
        family: identity.family,
        version
      };
    } catch {
      // 静默处理：浏览器跨域或后端不可达时返回 null，由调用方回退
      return null;
    }
  }

  /**
   * 获取后端版本信息（兼容旧接口，仅返回展示文本）
   * @param {Object} $axios - Axios实例
   * @param {string} backend - 后端转换地址
   * @returns {Promise<string>} 版本信息
   */
  static async getBackendVersion($axios, backend = CONSTANTS.DEFAULT_BACKEND) {
    const info = await BackendService.probeBackend($axios, backend);
    return info ? info.version : "";
  }

  /**
   * 请求 SubConverter-Extended 诊断信息（在转换链接上附加 explain=true）
   * @param {Object} $axios - Axios实例
   * @param {string} subUrl - 已生成的转换链接
   * @returns {Promise<Object>} 后端返回的诊断 JSON
   */
  static async explain($axios, subUrl) {
    const url = new URL(subUrl);
    url.searchParams.set('explain', 'true');
    try {
      const response = await $axios.get(url.toString(), { timeout: 15000, responseType: 'json' });
      return BackendService.parseExplainBody(response.data);
    } catch (error) {
      // 后端对失败的转换也会返回诊断 JSON（如 400），优先展示该内容
      const body = error?.response?.data;
      if (body) {
        const parsed = BackendService.parseExplainBody(body);
        if (parsed && typeof parsed === 'object') return parsed;
      }
      throw new Error('诊断请求失败', { cause: error });
    }
  }

  static parseExplainBody(data) {
    if (typeof data !== 'string') return data;
    try {
      return JSON.parse(data);
    } catch {
      return { ok: false, message: data.slice(0, 2000) };
    }
  }
}

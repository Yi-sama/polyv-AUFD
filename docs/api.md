# 接口草案 v0.1（前端起草，待后端确认后冻结）

> 后端对接补充（2026-10-23）：可执行契约见同目录 `backend-api.md`。
> 本草案保留，不覆盖前端设计。默认端口沿用 4317；`/api/portfolio` 与
> `/api/creators/liurunsen` 共享数据；Demo 仅一位作者。支持两种上传格式，
> 错误为 `{error: string, code: string}`，新增 `media` 图片尺寸。

在 `aufd-demo` 现有字段（`revision`、`profile`、`works`、`videoId`、`highlights`）的基础上改成“多位创作者”。字段名沿用原型，新增项标注【新】。

## 数据结构

```ts
interface Creator {                 // 一位创作者 = 一间展厅
  slug: string;                     // 【新】URL 标识，/^[a-z0-9-]{2,40}$/，如 "liurunsen"
  revision: number;                 // 乐观锁，PUT 时携带
  profile: {
    name: string; alias: string; role: string;
    bio: string;                    // 一句话，≤300
    about: string;                  // 页尾“关于”，≤2000
    email: string;
    avatar: string;                 // /assets/... 或 /uploads/...
    updatedAt: string;
  };
  works: Work[];                    // 数组顺序即展示顺序
}

interface Work {
  id: string;
  type: 'poster' | 'photo' | 'video';
  title: string;
  subtitle: string;                 // 可空
  date: string;                     // YYYY-MM-DD，可空
  description: string;              // 可空，空时前端不占位
  cover: string;
  images: string[];                 // ≥2 张时前端显示为“专题”素材条
  featured: boolean;                // 用作展馆索引的代表作
  videoId: string;                  // type=video 必填
  isDemo: boolean;                  // 官方示例视频，前端如实标注
  highlights: { title: string; seconds: number }[];
}
```

【新】图片尺寸：前端需要宽高来预留位置、避免加载时跳动。建议 `GET` 时后端为每个图片地址附带尺寸：

```ts
media: Record<string, { width: number; height: number }>  // key 为图片地址，放在 Creator 顶层
```

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/creators` | 【新】展馆索引：`{ items: { slug, profile: {name, alias, role, avatar}, featured: Work \| null }[] }` |
| GET | `/api/creators/:slug` | 【新】一位创作者完整数据 `Creator`（含 `media`） |
| PUT | `/api/creators/:slug` | 【新】整体保存；`revision` 不一致返回 409 |
| POST | `/api/uploads` | 沿用原型（JSON base64），返回 `{ url, width, height }`【新增宽高】 |
| GET | `/api/polyv/play-token?vid=` | 由后端决定是否需要；前端只在返回 `token` 非空时传给播放器 |

错误：沿用原型 `{ error: string }`，状态码 400 / 403 / 404 / 409 / 413 / 500。

## 前端约定
- 开发时 Vite 把 `/api`、`/uploads`、`/assets` 代理到后端（默认 `http://127.0.0.1:4317`）。
- 后端接口未就绪前，前端使用 `web/src/data/mock.ts`，结构与本文件一致。
- 原型对 Host / Origin 有校验，代理需设置 `changeOrigin`；后端请确认放行 Vite 代理的请求。

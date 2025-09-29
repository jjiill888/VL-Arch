# OPDS 书架缓存策略实现

## 概述

本实现为 OPDS 图书馆系统添加了智能书架缓存策略，显著减少了返回上一级书架的时间，并提供了更好的用户体验。

## 核心特性

### 1. 双层缓存架构
- **内存缓存 (Memory Cache)**: 优先使用内存 Map 进行即时访问
- **持久化缓存 (localStorage)**: 用于应用重启后的数据恢复

### 2. 智能缓存策略
- **新鲜数据 (Fresh)**: 1分钟内访问的数据，直接返回
- **过期数据 (Stale)**: 1-5分钟内的数据，立即返回但触发后台刷新
- **过期数据 (Expired)**: 超过5分钟的数据，重新从网络获取

### 3. 书架导航优化
- **即时返回**: 已缓存的书架数据立即显示
- **面包屑导航**: 支持完整的导航路径缓存
- **父级关系**: 维护书架之间的层级关系

## 实现细节

### 缓存数据结构

```typescript
interface CachedShelfData {
  feed: OPDSFeed;
  books: OPDSBook[];
  navigationItems: OPDSNavigationItem[];
  parentUrl?: string; // 父级书架URL
  breadcrumb?: Array<{ title: string; url: string }>; // 导航面包屑
  lastUpdated: number;
  lastAccessed: number;
}
```

### 核心方法

#### 1. 书架数据获取
```typescript
public async fetchShelfByLink(
  url: string,
  credentials?: OPDSCredentials,
  timeoutMs?: number,
  forceRefresh: boolean = false,
  parentUrl?: string,
  breadcrumb?: Array<{ title: string; url: string }>
): Promise<OPDSFeed>
```

#### 2. 智能导航
```typescript
public async navigateToShelf(
  shelfUrl: string,
  shelfTitle: string,
  parentUrl: string,
  credentials?: OPDSCredentials,
  timeoutMs?: number,
  currentBreadcrumb?: Array<{ title: string; url: string }>
): Promise<OPDSFeed>
```

#### 3. 父级导航
```typescript
public async navigateToParentShelf(
  currentUrl: string,
  credentials?: OPDSCredentials,
  timeoutMs?: number
): Promise<OPDSFeed | null>
```

## 使用场景

### 1. 页面初始化
- 使用 `fetchShelfByLink` 加载初始书架数据
- 自动缓存到内存和 localStorage

### 2. 手动刷新
- 使用 `forceRefresh: true` 强制从服务器获取最新数据
- 更新缓存并同步到 localStorage

### 3. 书架导航
- 点击子书架时使用 `navigateToShelf`
- 自动维护面包屑和父级关系

### 4. 面包屑导航
- 点击面包屑时使用 `fetchShelfByLink`
- 优先使用缓存数据，提供即时响应

### 5. 分页导航
- 下一页/上一页使用 `fetchShelfByLink`
- 保持当前书架上下文

## 性能优化

### 1. 即时响应
- 内存缓存优先，提供毫秒级响应
- 避免不必要的网络请求

### 2. 后台刷新
- 过期数据立即返回，后台异步更新
- 不阻塞用户界面

### 3. 智能过期
- 基于访问时间的动态过期策略
- 自动清理过期缓存

## 服务器更新处理

### 1. 自动检测
- 页面初始化时检查缓存有效性
- 手动刷新时强制获取最新数据

### 2. 更新机制
- `loadShelfData`: 页面初始化
- `refreshLibrary`: 手动刷新按钮
- `handleNavigationClick`: 书架导航
- `handleBreadcrumbClick`: 面包屑导航

### 3. 数据同步
- 每次网络请求后更新缓存
- 同步更新内存和 localStorage

## 配置选项

```typescript
const opdsFeedCache = new OPDSFeedCache({
  maxAge: 5 * 60 * 1000, // 5分钟最大缓存时间
  staleAge: 1 * 60 * 1000 // 1分钟过期时间
});
```

## 日志和调试

系统提供详细的日志输出，包括：
- 缓存命中情况 (Fresh/Stale/Expired)
- 后台刷新状态
- 导航路径跟踪
- 性能指标

## 兼容性

- 完全向后兼容现有 OPDS 功能
- 支持所有现有的认证方式
- 适用于 Tauri 和 Web 平台

## 总结

此实现通过智能缓存策略显著提升了 OPDS 书架导航的用户体验，同时保持了数据的实时性和准确性。用户现在可以享受即时响应的书架导航，而服务器端的新增书架也能通过现有的刷新机制及时更新。


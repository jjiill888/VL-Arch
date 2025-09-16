import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('OPDS Proxy handler called:', { method: req.method, query: req.query });
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, username, password } = req.query;

  if (!url || typeof url !== 'string') {
    console.error('Missing or invalid URL:', { url, type: typeof url });
    return res.status(400).json({ error: 'URL is required' });
  }

  console.log('OPDS Proxy request:', { url, username: username ? '***' : undefined });

  try {
    // 验证URL格式
    let targetUrl: URL;
    try {
      targetUrl = new URL(url);
    } catch (urlError) {
      console.error('Invalid URL:', url, urlError);
      return res.status(400).json({ error: '无效的URL格式' });
    }
    const headers: HeadersInit = {
      'Accept': 'application/atom+xml;profile=opds-catalog, application/atom+xml, text/xml, */*',
      'User-Agent': 'Readest/1.0 (OPDS Client)',
    };

    // 如果有认证信息，添加Basic认证
    if (username && password && typeof username === 'string' && typeof password === 'string') {
      // 使用UTF-8编码处理中文用户名和密码
      const credentials = `${username}:${password}`;
      const encoder = new TextEncoder();
      const data = encoder.encode(credentials);
      const base64 = btoa(String.fromCharCode(...data));
      headers['Authorization'] = `Basic ${base64}`;
    }

    console.log('Fetching URL:', targetUrl.toString());
    
    // 设置超时时间，对于下载链接使用更长的超时
    const isDownloadUrl = targetUrl.pathname.includes('/download/') || targetUrl.pathname.includes('/cover/');
    const timeout = isDownloadUrl ? 60000 : 30000; // 下载60秒，其他30秒
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401) {
        return res.status(401).json({ error: '此OPDS服务器需要认证。请提供正确的用户名和密码。' });
      } else if (response.status === 403) {
        return res.status(403).json({ error: '访问被拒绝。您可能没有权限访问此图书馆。' });
      } else if (response.status === 404) {
        return res.status(404).json({ error: 'OPDS目录未找到。请检查URL是否正确。' });
      } else if (response.status >= 500) {
        return res.status(500).json({ error: '服务器错误。请稍后重试。' });
      } else {
        return res.status(response.status).json({ error: `HTTP ${response.status}: ${response.statusText}` });
      }
    }

    const contentType = response.headers.get('content-type') || '';
    
    // 检查是否是二进制文件下载（书籍文件）
    if (contentType.includes('application/') && 
        (contentType.includes('epub') || contentType.includes('pdf') || 
         contentType.includes('mobi') || contentType.includes('zip'))) {
      
      // 处理二进制文件下载
      const arrayBuffer = await response.arrayBuffer();
      
      // 设置正确的Content-Type和Content-Disposition
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', arrayBuffer.byteLength.toString());
      
      // 从URL中提取文件名
      const urlPath = targetUrl.pathname;
      const fileName = urlPath.split('/').pop() || 'book';
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      
      res.status(200).send(Buffer.from(arrayBuffer));
      return;
    }

    // 处理XML/文本响应（OPDS feed）
    const xmlText = await response.text();

    if (!xmlText.trim()) {
      return res.status(500).json({ error: '服务器返回空响应。' });
    }

    // 检查内容格式
    const trimmedText = xmlText.trim();
    if (!trimmedText.startsWith('<')) {
      return res.status(500).json({ error: '无效的响应类型。期望OPDS feed (XML/Atom格式)。' });
    }

    // 检查是否是有效的OPDS feed
    if (!trimmedText.includes('feed') && !trimmedText.includes('atom') && !trimmedText.includes('entry')) {
      // 如果内容看起来像HTML重定向页面，提供更具体的错误信息
      if (trimmedText.includes('<html') || trimmedText.includes('<!doctype')) {
        if (trimmedText.includes('Unauthorized Access')) {
          return res.status(401).json({ error: 'OPDS功能未启用或需要管理员权限。请联系Calibre-Web管理员启用OPDS功能。' });
        }
        return res.status(500).json({ error: '服务器返回了HTML页面而不是OPDS feed。可能需要重新认证或OPDS功能未启用。' });
      }
      return res.status(500).json({ error: '无效的OPDS feed格式。响应内容不包含feed元素。' });
    }

    // 设置正确的Content-Type
    res.setHeader('Content-Type', contentType || 'application/atom+xml');
    res.status(200).send(xmlText);

  } catch (error) {
    console.error('OPDS proxy error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url: url
    });
    
    if (error instanceof TypeError) {
      return res.status(500).json({ error: '网络错误。请检查您的网络连接和URL。' });
    }

    return res.status(500).json({ 
      error: `获取OPDS feed失败: ${error instanceof Error ? error.message : '未知错误'}`,
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

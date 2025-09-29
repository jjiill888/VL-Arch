#!/usr/bin/env node

/**
 * 测试OPDS封面解析脚本
 * 使用方法: node test-opds-covers.js
 */

async function testOPDSCovers() {
    const OPDS_URL = 'http://server.15110y.top:8083/opds';
    const credentials = {
        username: 'reader01',
        password: '123456'
    };

    console.log('🔍 Testing OPDS cover image extraction...');
    console.log('OPDS URL:', OPDS_URL);

    try {
        // 创建Basic Auth header
        const auth = btoa(`${credentials.username}:${credentials.password}`);

        // 获取OPDS feed
        const response = await fetch(OPDS_URL, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/atom+xml, application/xml, text/xml'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const xmlText = await response.text();
        console.log('✅ Successfully fetched OPDS feed');
        console.log('📄 Feed size:', xmlText.length, 'characters');

        // 解析XML
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, 'text/xml');

        // 检查解析错误
        const parserError = doc.querySelector('parsererror');
        if (parserError) {
            throw new Error(`XML parsing error: ${parserError.textContent}`);
        }

        // 查找所有entry元素
        const entries = doc.querySelectorAll('entry');
        console.log('📚 Found', entries.length, 'book entries');

        let coverCount = 0;
        let noCoverCount = 0;

        // 检查每个entry的封面链接
        entries.forEach((entry, index) => {
            const title = entry.querySelector('title')?.textContent || 'Unknown Title';
            const links = entry.querySelectorAll('link');

            console.log(`\n📖 Book ${index + 1}: ${title}`);

            let foundCover = false;
            const coverRels = [
                'http://opds-spec.org/image',
                'http://opds-spec.org/cover',
                'http://opds-spec.org/image/thumbnail',
                'http://opds-spec.org/thumbnail'
            ];

            const imageTypes = [
                'image/jpeg',
                'image/jpg',
                'image/png',
                'image/gif',
                'image/webp'
            ];

            links.forEach(link => {
                const rel = link.getAttribute('rel');
                const type = link.getAttribute('type');
                const href = link.getAttribute('href');

                // 检查是否是封面链接
                const isCoverRel = coverRels.includes(rel);
                const isImageType = imageTypes.includes(type);

                if (isCoverRel || isImageType) {
                    console.log('  🖼️  Cover found:', {
                        rel: rel,
                        type: type,
                        href: href
                    });
                    foundCover = true;
                } else {
                    console.log('  🔗 Link:', {
                        rel: rel,
                        type: type,
                        href: href?.substring(0, 60) + (href?.length > 60 ? '...' : '')
                    });
                }
            });

            if (foundCover) {
                coverCount++;
            } else {
                noCoverCount++;
                console.log('  ❌ No cover image found');
            }
        });

        console.log('\n📊 Summary:');
        console.log(`✅ Books with covers: ${coverCount}`);
        console.log(`❌ Books without covers: ${noCoverCount}`);
        console.log(`📚 Total books: ${entries.length}`);
        console.log(`📈 Cover percentage: ${entries.length > 0 ? Math.round((coverCount / entries.length) * 100) : 0}%`);

        // 保存原始XML用于调试
        const fs = require('fs');
        fs.writeFileSync('opds-feed-debug.xml', xmlText);
        console.log('\n💾 Saved raw OPDS feed to: opds-feed-debug.xml');

    } catch (error) {
        console.error('❌ Error testing OPDS covers:', error.message);

        if (error.message.includes('fetch')) {
            console.log('\n💡 Troubleshooting tips:');
            console.log('1. Check if the OPDS server is accessible');
            console.log('2. Verify the credentials are correct');
            console.log('3. Check if there are any network restrictions');
        }
    }
}

// 在Node.js环境中运行
if (typeof window === 'undefined') {
    // Node.js环境，需要polyfill
    const { DOMParser } = require('xmldom');
    const fetch = require('node-fetch');

    global.DOMParser = DOMParser;
    global.fetch = fetch;
    global.btoa = (str) => Buffer.from(str).toString('base64');

    testOPDSCovers().catch(console.error);
} else {
    // 浏览器环境
    testOPDSCovers().catch(console.error);
}
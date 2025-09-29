/**
 * 浏览器OPDS封面测试脚本
 * 在浏览器开发者工具控制台中运行此代码
 */

async function testOPDSCoversInBrowser() {
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
        const booksWithCovers = [];
        const booksWithoutCovers = [];

        // 检查每个entry的封面链接
        entries.forEach((entry, index) => {
            const title = entry.querySelector('title')?.textContent || 'Unknown Title';
            const links = entry.querySelectorAll('link');

            console.log(`\n📖 Book ${index + 1}: ${title}`);

            let foundCover = null;
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

            const allLinks = [];

            links.forEach(link => {
                const rel = link.getAttribute('rel');
                const type = link.getAttribute('type');
                const href = link.getAttribute('href');

                allLinks.push({ rel, type, href });

                // 检查是否是封面链接
                const isCoverRel = coverRels.includes(rel);
                const isImageType = imageTypes.includes(type);

                if (isCoverRel || isImageType) {
                    console.log('  🖼️  Cover found:', {
                        rel: rel,
                        type: type,
                        href: href
                    });
                    foundCover = { rel, type, href };
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
                booksWithCovers.push({ title, cover: foundCover });
            } else {
                noCoverCount++;
                booksWithoutCovers.push({ title, links: allLinks });
                console.log('  ❌ No cover image found');
            }
        });

        console.log('\n📊 Summary:');
        console.log(`✅ Books with covers: ${coverCount}`);
        console.log(`❌ Books without covers: ${noCoverCount}`);
        console.log(`📚 Total books: ${entries.length}`);
        console.log(`📈 Cover percentage: ${entries.length > 0 ? Math.round((coverCount / entries.length) * 100) : 0}%`);

        if (booksWithCovers.length > 0) {
            console.log('\n🖼️  Books with covers:');
            booksWithCovers.forEach(book => {
                console.log(`  - ${book.title}`, book.cover);
            });
        }

        if (booksWithoutCovers.length > 0) {
            console.log('\n❌ Books without covers:');
            booksWithoutCovers.slice(0, 5).forEach(book => {
                console.log(`  - ${book.title}`, book.links);
            });
            if (booksWithoutCovers.length > 5) {
                console.log(`  ... and ${booksWithoutCovers.length - 5} more`);
            }
        }

        // 测试第一个封面图片的可访问性
        if (booksWithCovers.length > 0) {
            const firstCover = booksWithCovers[0];
            console.log('\n🧪 Testing first cover image accessibility...');

            try {
                const coverResponse = await fetch(firstCover.cover.href, {
                    method: 'HEAD',
                    headers: {
                        'Authorization': `Basic ${auth}`
                    }
                });

                console.log(`✅ Cover accessible: ${coverResponse.status} ${coverResponse.statusText}`);
                console.log(`📄 Content-Type: ${coverResponse.headers.get('content-type')}`);
                console.log(`📏 Content-Length: ${coverResponse.headers.get('content-length')} bytes`);

                // 创建测试图片元素
                const testImg = document.createElement('img');
                testImg.style.maxWidth = '200px';
                testImg.style.maxHeight = '300px';
                testImg.style.border = '2px solid green';
                testImg.src = firstCover.cover.href;
                testImg.title = `Cover for: ${firstCover.title}`;

                testImg.onload = () => {
                    console.log('✅ Cover image loaded successfully!');
                };

                testImg.onerror = (e) => {
                    console.log('❌ Cover image failed to load:', e);
                };

                document.body.appendChild(testImg);
                console.log('🖼️  Test image added to page (check bottom of page)');

            } catch (error) {
                console.log('❌ Failed to test cover accessibility:', error.message);
            }
        }

        // 返回结果供进一步分析
        return {
            totalBooks: entries.length,
            booksWithCovers: booksWithCovers.length,
            booksWithoutCovers: booksWithoutCovers.length,
            coverPercentage: entries.length > 0 ? Math.round((coverCount / entries.length) * 100) : 0,
            sampleCovers: booksWithCovers.slice(0, 3),
            rawXML: xmlText.substring(0, 1000) + '...'
        };

    } catch (error) {
        console.error('❌ Error testing OPDS covers:', error.message);

        if (error.message.includes('Failed to fetch')) {
            console.log('\n💡 Troubleshooting tips:');
            console.log('1. Check if the OPDS server is accessible');
            console.log('2. Verify the credentials are correct');
            console.log('3. Check CORS policy - server might not allow browser requests');
            console.log('4. Try accessing the URL directly in a new tab');
        }

        return null;
    }
}

// 运行测试
console.log('🚀 Starting OPDS cover test...');
console.log('Copy and paste the following line to run the test:');
console.log('testOPDSCoversInBrowser()');

// 为了方便使用，将函数暴露到全局
if (typeof window !== 'undefined') {
    window.testOPDSCoversInBrowser = testOPDSCoversInBrowser;
}
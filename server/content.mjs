import editions from '../src/data/editions.json' with {type:'json'};

const publishedEditions = editions.map(edition => ({
  ...edition,
  status: 'published',
  works: edition.works.map(work => ({...work, status: 'published', version: 1})),
}));
export const catalog = publishedEditions;
export const allPublishedWorks = publishedEditions.flatMap(edition => edition.works);

export function findEdition(id) {
  return publishedEditions.find(edition => edition.id === id);
}
export function findWork(id) {
  return allPublishedWorks.find(work => work.id === id);
}
export function queryWorks({editionId, track, q} = {}) {
  const needle = (q || '').trim().toLocaleLowerCase();
  return allPublishedWorks.filter(work =>
    (!editionId || work.editionId === editionId) &&
    (!track || track === '全部' || work.track === track) &&
    (!needle || [work.title, work.author, work.track, work.tagline, work.description, ...(work.tags || [])]
      .join(' ').toLocaleLowerCase().includes(needle)),
  );
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
function routeId(pathname, prefix) {
  const value = decodeURIComponent(pathname.slice(prefix.length));
  return value && !value.includes('/') ? value : null;
}

export function contentPlugin() {
  const plugin = {name: 'atom-content-service', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/content') && !url.pathname.startsWith('/api/exhibitions') && !url.pathname.startsWith('/api/works')) return next();
      if (req.method !== 'GET') return send(res, 405, {error: '内容服务只读'});
      if (url.pathname === '/api/content/health') return send(res, 200, {ok: true, editions: publishedEditions.length, works: allPublishedWorks.length});
      if (url.pathname === '/api/exhibitions') {
        return send(res, 200, {items: publishedEditions.map(({works, ...edition}) => ({...edition, workCount: works.length}))});
      }
      if (url.pathname.startsWith('/api/exhibitions/')) {
        const edition = findEdition(routeId(url.pathname, '/api/exhibitions/'));
        return edition ? send(res, 200, edition) : send(res, 404, {error: '赛事不存在'});
      }
      if (url.pathname === '/api/works') {
        const items = queryWorks({editionId: url.searchParams.get('edition'), track: url.searchParams.get('track'), q: url.searchParams.get('q')});
        return send(res, 200, {items, total: items.length});
      }
      if (url.pathname.startsWith('/api/works/')) {
        const work = findWork(routeId(url.pathname, '/api/works/'));
        return work ? send(res, 200, work) : send(res, 404, {error: '作品不存在'});
      }
      return send(res, 404, {error: '内容路径不存在'});
    });
  }};
  plugin.configurePreviewServer = plugin.configureServer;
  return plugin;
}

"""Collect public article metadata only. No third-party dependencies."""
import concurrent.futures
import datetime as dt
import email.utils
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'data/articles.json'
SOURCES = {
    'agora': 'https://agora-web.jp/archives/author/george_kujo/',
    'note': 'https://note.com/g_kujo_ir/rss',
    'yahoo': 'https://news.yahoo.co.jp/search?p=' + urllib.parse.quote('九条丈二') + '&ei=utf-8',
}

def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'GeorgeReader/0.4 (+https://github.com/GeorgeKujo/george-reader)'})
    for attempt in range(2):
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                return response.read(8_000_000).decode('utf-8')
        except Exception:
            if attempt: raise
            time.sleep(1)

def canonical(url):
    u = urllib.parse.urlsplit(html.unescape(url))
    return urllib.parse.urlunsplit((u.scheme, u.netloc.lower(), u.path.rstrip('/'), '', ''))

def valid(url, source):
    u = urllib.parse.urlsplit(url)
    return u.scheme == 'https' and bool({
        'agora': u.hostname == 'agora-web.jp' and re.fullmatch(r'/archives/\d+\.html', u.path),
        'note': u.hostname == 'note.com' and re.fullmatch(r'/g_kujo_ir/n/n[0-9a-f]+', u.path),
        'yahoo': u.hostname == 'news.yahoo.co.jp' and re.fullmatch(r'/articles/[0-9a-f]+', u.path),
    }.get(source))

def date(value):
    try:
        parsed = email.utils.parsedate_to_datetime(value)
    except (ValueError, TypeError):
        parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if not parsed.tzinfo: parsed = parsed.replace(tzinfo=dt.timezone(dt.timedelta(hours=9)))
    return parsed.astimezone(dt.timezone.utc).isoformat().replace('+00:00', 'Z')

def article(url, title, source, published):
    url = canonical(url)
    if not valid(url, source): raise ValueError('Unexpected article URL')
    title = re.sub(r'\s+', ' ', html.unescape(title)).strip()
    if not title: raise ValueError('Empty article title')
    return dict(url=url, title=title, source=source, published=date(published))

def parse_rss(body, source):
    root = ET.fromstring(body)
    if root.tag != 'rss' or root.find('channel') is None: raise ValueError('Not an RSS feed')
    rows = []
    for item in root.findall('./channel/item'):
        rows.append(article(item.findtext('link', ''), item.findtext('title', ''), source, item.findtext('pubDate', '')))
    return rows

class Links(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links, self.current, self.text, self.heading, self.heading_depth = [], None, '', '', 0
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('h2', 'h3'): self.heading_depth += 1
        if tag == 'a': self.current = {'url': attrs.get('href', ''), 'title': '', 'before': self.text[-200:], 'heading': bool(self.heading_depth)}
    def handle_endtag(self, tag):
        if tag == 'a' and self.current:
            self.links.append(self.current)
            self.current = None
        if tag in ('h2', 'h3'): self.heading_depth = max(0, self.heading_depth-1)
    def handle_data(self, data):
        self.text += data
        if self.current: self.current['title'] += data

def parse_agora(body):
    rows = []
    for block in re.findall(r'<article\b[^>]*>(.*?)</article>',body,re.S):
        parser = Links(); parser.feed(block)
        if not any('/archives/author/george_kujo' in x['url'] and re.search(r'九条\s*丈二',x['title']) for x in parser.links): continue
        for link in parser.links:
            url = canonical(urllib.parse.urljoin(SOURCES['agora'], link['url']))
            if not link['heading'] or not valid(url, 'agora'): continue
            dates = re.findall(r'(\d{4})年(\d{1,2})月(\d{1,2})日', link['before'])
            if not dates: raise ValueError('Article publication date missing')
            y,m,d = dates[-1]
            rows.append(article(url,link['title'],'agora',f'{y}-{int(m):02}-{int(d):02}T00:00:00+09:00'))
    if not rows: raise ValueError('Author page yielded no articles')
    return rows

class Collected(list):
    def __init__(self, rows, pages, warning=None):
        super().__init__(rows)
        self.pages, self.warning = pages, warning

def collect_agora():
    rows, pages = [], 0
    for number in range(1, 11):
        url = SOURCES['agora'] if number == 1 else SOURCES['agora'] + f'page/{number}'
        try:
            body = fetch(url)
            batch = parse_agora(body)
            if rows and not ({x['url'] for x in batch} - {x['url'] for x in rows}):
                raise ValueError('Pagination repeated an earlier page')
        except Exception as error:
            if not rows: raise
            return Collected(rows, pages, str(error)[:250])
        rows.extend(batch); pages += 1
        parser = Links(); parser.feed(body)
        expected = canonical(SOURCES['agora'] + f'page/{number+1}')
        if not any(canonical(urllib.parse.urljoin(url,x['url'])) == expected for x in parser.links):
            return Collected(rows, pages)
        time.sleep(0.5)
    return Collected(rows, pages, 'Reached the 10-page safety limit; older pages remain')

def collect_yahoo():
    parser = Links(); parser.feed(fetch(SOURCES['yahoo']))
    urls = sorted({canonical(x['url']) for x in parser.links if valid(canonical(x['url']), 'yahoo')})[:40]
    rows = []
    for url in urls:
        body = fetch(url)
        # Search results alone are not evidence of authorship.
        if not re.search(r'九条[\s\u3000]*丈二', re.sub('<[^>]+>', ' ', body)): continue
        for payload in re.findall(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',body,re.S):
            data = json.loads(payload)
            objects = data if isinstance(data,list) else data.get('@graph',[data])
            for obj in objects:
                identity = (obj.get('headline','')+' '+json.dumps(obj.get('author',{}),ensure_ascii=False)) if isinstance(obj,dict) else ''
                if isinstance(obj,dict) and obj.get('headline') and obj.get('datePublished') and re.search(r'九条\s*丈二',identity):
                    rows.append(article(url,obj['headline'],'yahoo',obj['datePublished']))
    # An empty response can also mean a changed layout or access restriction.
    if not urls: raise ValueError('No article links returned; access or search format must be checked')
    return rows

def collect(source):
    if source == 'yahoo': return collect_yahoo()
    if source == 'agora': return collect_agora()
    body = fetch(SOURCES[source])
    rows = parse_agora(body) if source == 'agora' else parse_rss(body, source)
    if not rows: raise ValueError('Empty feed')
    return rows

def merge(old, incoming):
    merged = {}
    for row in old + incoming:
        try:
            clean = article(row['url'],row['title'],row['source'],row['published'])
            merged[clean['url']] = clean
        except (ValueError, KeyError, TypeError): continue
    rows = sorted(merged.values(),key=lambda x:(x['published'],x['url']),reverse=True)
    groups = {}
    for row in rows:
        key = title_key(row['title'])
        if len(key) >= 16: groups.setdefault(key,[]).append(row)
    for group in groups.values():
        if len({x['source'] for x in group}) < 2: continue
        for row in group:
            row['relatedUrls'] = [x['url'] for x in group if x['source'] != row['source']]
    return rows

def title_key(title):
    title = unicodedata.normalize('NFKC', title)
    # Remove only known Yahoo headline suffixes, never fuzzy-match different titles.
    title = re.sub(r'\s*\([^()]*九条\s*丈二[^()]*\)\s*(\([^()]+\))?\s*$', '', title)
    title = re.sub(r'\s*\((?:アゴラ|アゴラ 言論プラットフォーム|シェアーズカフェ・オンライン)\)\s*$', '', title)
    return re.sub(r'[\s\W_]+', '', title).casefold()

def main():
    old = json.loads(OUTPUT.read_text(encoding='utf-8')) if OUTPUT.exists() else {}
    now = dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00','Z')
    incoming, statuses = [], {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(collect,s):s for s in SOURCES}
        for future in concurrent.futures.as_completed(futures):
            source = futures[future]
            previous = old.get('sources',{}).get(source,{})
            try:
                rows = future.result(); incoming.extend(rows)
                warning = getattr(rows, 'warning', None)
                statuses[source] = dict(status='partial' if warning else 'ok',count=len(rows),lastSuccess=previous.get('lastSuccess') if warning else now,url=SOURCES[source])
                if hasattr(rows,'pages'): statuses[source]['pages'] = rows.pages
                if warning:
                    statuses[source]['error'] = warning
                    print(f'::warning::{source}: {warning}')
            except Exception as error:
                statuses[source] = dict(status='error',count=0,lastSuccess=previous.get('lastSuccess'),url=SOURCES[source],error=str(error)[:250])
                print(f'::warning::{source}: {error}')
    result = dict(schemaVersion=1,updatedAt=now,sources=statuses,articles=merge(old.get('articles',[]),incoming))
    OUTPUT.parent.mkdir(exist_ok=True)
    temp = OUTPUT.with_suffix('.tmp'); temp.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); temp.replace(OUTPUT)
    print(json.dumps({s:v['status'] for s,v in statuses.items()}),len(result['articles']),'articles')
    if all(s['status']=='error' for s in statuses.values()): raise SystemExit('All sources failed; previous articles retained')

if __name__ == '__main__': main()

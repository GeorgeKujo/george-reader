import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import tempfile
import json

spec=importlib.util.spec_from_file_location('collect',Path(__file__).parents[1]/'scripts/collect.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)

class CollectTests(unittest.TestCase):
    def test_rss_entity_and_canonical(self):
        rows=c.parse_rss('<rss><channel><item><title>A &amp; B</title><link>https://note.com/g_kujo_ir/n/nabc?x=1</link><pubDate>Mon, 02 Nov 2026 09:00:00 +0900</pubDate></item></channel></rss>','note')
        self.assertEqual(rows[0]['title'],'A & B')
        self.assertEqual(rows[0]['published'],'2026-11-02T00:00:00Z')
        self.assertEqual(rows[0]['url'],'https://note.com/g_kujo_ir/n/nabc')
    def test_author_html(self):
        rows=c.parse_agora('<article><span>2026年10月24日</span><a href="/archives/author/george_kujo">九条 丈二</a><h2><a href="/archives/261024123456.html">記事</a></h2></article><article><h2><a href="/archives/261025123456.html">別の著者</a></h2></article>')
        self.assertEqual(len(rows),1)
        with self.assertRaises(ValueError): c.parse_agora('<h1>別の著者</h1>')
    def test_merge_keeps_history_and_deduplicates(self):
        a=c.article('https://note.com/g_kujo_ir/n/nabc','old','note','2026-10-01')
        b={**a,'title':'updated','url':a['url']+'?utm_source=x'}
        rows=c.merge([a],[b,{'url':'javascript:alert(1)'}])
        self.assertEqual(len(rows),1);self.assertEqual(rows[0]['title'],'updated')
    def test_reject_other_author_and_domain(self):
        self.assertFalse(c.valid('https://note.com/other/n/nabc','note'))
        self.assertFalse(c.valid('https://news.yahoo.co.jp.evil.com/articles/abc','yahoo'))
        with self.assertRaises(ValueError):c.parse_rss('<html/>','note')
    def test_all_failures_retain_catalog(self):
        with tempfile.TemporaryDirectory() as folder:
            output=Path(folder)/'articles.json'
            row=c.article('https://note.com/g_kujo_ir/n/nabc','kept','note','2026-10-01')
            output.write_text(json.dumps({'articles':[row]}),encoding='utf-8')
            with patch.object(c,'OUTPUT',output),patch.object(c,'collect',side_effect=ValueError('unavailable')):
                with self.assertRaises(SystemExit):c.main()
            result=json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual(result['articles'],[row])
            self.assertTrue(all(s['status']=='error' for s in result['sources'].values()))

if __name__=='__main__':unittest.main()

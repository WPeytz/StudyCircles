import json, re, time
from collections import OrderedDict
from urllib.parse import urlencode, urljoin
import requests
from bs4 import BeautifulSoup

BASE = "https://kurser.dtu.dk/"
SEARCH_PATH = "search"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
)
HEADERS = {
    "User-Agent": USER_AGENT,
    "Referer": BASE,
    "Accept-Language": "en-US,en;q=0.9,da;q=0.8",
}

# We'll query by SearchKeyword (since blank searches are not allowed)
QUERY_CHARS = list("abcdefghijklmnopqrstuvwxyz0123456789")
CODE_RE = re.compile(r"\b\d{5}\b")


def build_url(params: dict) -> str:
    return urljoin(BASE, SEARCH_PATH) + "?" + urlencode(params)


def parse_results(html: str):
    """Return a list of {code, title} from the search result HTML."""
    soup = BeautifulSoup(html, "html.parser")
    items = []

    # 1) Table rows pattern
    for tr in soup.select("table tbody tr, table tr"):
        tds = tr.find_all("td")
        if len(tds) >= 2:
            c = tds[0].get_text(strip=True)
            t = tds[1].get_text(strip=True)
            m = CODE_RE.search(c)
            if m and t:
                items.append({"code": m.group(0), "title": t})

    # 2) Anchor fallback (links that contain course code)
    if not items:
        for a in soup.select("a[href*='/course']"):
            txt = a.get_text(strip=True)
            m = CODE_RE.search(txt)
            if m:
                code = m.group(0)
                title = txt[m.end():].strip(" -–—:") or (a.get("title") or "").strip()
                if title:
                    items.append({"code": code, "title": title})

    return items


def find_next_page_url(html: str):
    """Try to locate a 'next' pagination URL, if any."""
    soup = BeautifulSoup(html, "html.parser")
    # Look for rel=next
    link = soup.select_one("a[rel='next']")
    if link and link.get("href"):
        return urljoin(BASE, link["href"])
    # Or a link/button with text Next or '>'
    for sel in ["a:contains('Next')", "a:contains('›')", "a:contains('>')"]:
        # BeautifulSoup doesn't support :contains natively; fallback to text scan
        for a in soup.find_all("a"):
            if a.get_text(strip=True).lower() in {"next", ">", "›"} and a.get("href"):
                return urljoin(BASE, a["href"])
    return None


def scrape_all(volume="2025/2026"):
    session = requests.Session()
    session.headers.update(HEADERS)

    all_items = OrderedDict()  # code -> {code, title}

    for q in QUERY_CHARS:
        params = {
            "CourseCode": "",
            "SearchKeyword": q,
            "CourseType": "",
            "TeachingLanguage": "",
            "Volume": volume,
        }
        url = build_url(params)
        while url:
            r = session.get(url, timeout=30)
            if r.status_code != 200:
                print(f"WARN: {r.status_code} on {url}")
                break
            items = parse_results(r.text)
            for it in items:
                code = it["code"]
                if code not in all_items:
                    all_items[code] = it
            # Try pagination
            next_url = find_next_page_url(r.text)
            url = next_url
            time.sleep(0.4)  # be polite

    return list(all_items.values())


if __name__ == "__main__":
    courses = scrape_all(volume="2025/2026")
    if not courses:
        with open("debug_course_page.html", "w", encoding="utf-8") as f:
            f.write("No results parsed. Check if the HTML structure changed or requires JS.")
        print("No courses parsed; wrote debug_course_page.html")
    else:
        with open("dtu_courses.json", "w", encoding="utf-8") as f:
            json.dump(courses, f, ensure_ascii=False, indent=2)
        print(f"Saved {len(courses)} unique courses to dtu_courses.json")
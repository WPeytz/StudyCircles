import json, os, itertools
from supabase import create_client
import argparse
from pathlib import Path
try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

# Load .env if available (so SUPABASE_URL / SUPABASE_SERVICE_ROLE can be read from it)
if load_dotenv:
    # Try project root .env
    env_path = Path(__file__).resolve().parent / '.env'
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
    else:
        load_dotenv()

parser = argparse.ArgumentParser(description="Upload DTU courses to Supabase")
parser.add_argument('--url', default=None, help='Supabase project URL (overrides env)')
parser.add_argument('--key', default=None, help='Supabase service role key (overrides env)')
parser.add_argument('--file', default='dtu_courses.json', help='Path to courses JSON')
args = parser.parse_args()

url = args.url or os.getenv('SUPABASE_URL') or os.getenv('VITE_SUPABASE_URL')
key = args.key or os.getenv('SUPABASE_SERVICE_ROLE') or os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not url or not key:
    raise SystemExit(
        "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE in your environment or .env, "
        "or pass --url and --key on the command line.\n"
        "Example:\n  export SUPABASE_URL=https://<project>.supabase.co\n  export SUPABASE_SERVICE_ROLE=<service_role_key>\n  python upload_courses.py --file dtu_courses.json"
    )

sb = create_client(url, key)
print("Connecting to:", url)

with open(args.file, "r", encoding="utf-8") as f:
    items = json.load(f)

items = [{"code": str(x["code"]), "title": x["title"], "university": "DTU"} for x in items]

def chunks(seq, n=1000):
    it = iter(seq)
    while True:
        batch = list(itertools.islice(it, n))
        if not batch: break
        yield batch

# track total rows touched (best-effort)
rows_total = 0
for batch in chunks(items):
    try:
        resp = sb.table("courses").upsert(batch, on_conflict="code").execute()
    except Exception as e:
        print("Upsert exception:", e)
        raise SystemExit(1)

    # supabase-py v2 returns an object with `.data` and optionally `.error`
    if hasattr(resp, "error") and resp.error:
        print("Upsert error:", resp.error)
        raise SystemExit(1)

    if hasattr(resp, "data") and resp.data is not None:
        try:
            rows_total += len(resp.data)
        except TypeError:
            pass

print(f"Done. Uploaded/updated approximately {rows_total or len(items)} rows.")
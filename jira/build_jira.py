import re, csv, json, collections
t = open('BRD.md').read()
sec = t.split('## 4. Requirements by epic')[1].split('## 5.')[0]
epics = {}
for m in re.finditer(r'^\| (EP-\d\d) \| ([^|]+) \|', t.split('## 3.')[1].split('## 4.')[0], re.M):
    epics[m.group(1)] = m.group(2).strip()
# epic code -> EP id from headings
heads = re.findall(r'^### (EP-\d\d) (.+)$', sec, re.M)
epic_title = {a: b.strip() for a, b in heads}
ST = {'S': 'Shipped', 'Q': 'Planned quick win', 'P': 'Parked', 'B': 'Blocked', 'N': 'Not built', 'X': 'Excluded'}
stat_map = {'S': 'done', 'Q': 'todo', 'P': 'backlog', 'B': 'backlog', 'N': 'backlog', 'X': 'backlog'}
prio_map = {'S': 'medium', 'Q': 'medium', 'P': 'low', 'B': 'high', 'N': 'low', 'X': 'low'}

def expand(cell):
    cell = re.sub(r'\([^)]*\)', '', cell)
    out = []
    for tok in re.split(r'[,\s]+', cell):
        tok = tok.strip().rstrip('.')
        m = re.match(r'^([A-Z]+)-(\d+)\.\.(\d+)$', tok)
        if m:
            w = len(m.group(2))
            out += [f'{m.group(1)}-{i:02d}' if w == 2 else f'{m.group(1)}-{i}' for i in range(int(m.group(2)), int(m.group(3)) + 1)]
        elif re.match(r'^[A-Z]+-\d+$', tok):
            out.append(tok)
    return out

reqs = []  # dicts
cur = None
for line in sec.splitlines():
    h = re.match(r'^### (EP-\d\d) ', line)
    if h: cur = h.group(1); continue
    cells = [c.strip() for c in line.strip().strip('|').split('|')]
    if cells and re.match(r'^REQ-', cells[0]):
        r = dict(id=cells[0], text=cells[1], st=cells[2], epic=cur)
        if cells[0].startswith(('REQ-GRO', 'REQ-FUND')):
            r['tests'] = ''; r['bugs'] = ''; r['src'] = cells[3] if len(cells) > 3 else ''
        else:
            r['tests'] = cells[3]; r['bugs'] = cells[4]; r['src'] = cells[5] if len(cells) > 5 else ''
        reqs.append(r)

# test -> reqs map
tmap = collections.defaultdict(list)
for r in reqs:
    for tid in expand(r['tests']):
        tmap[tid].append(r['id'])
json.dump(tmap, open('jira/test_req_map.json', 'w'), indent=0)

defs = []
dsec = t.split('## 6. Defect register')[1].split('## 7.')[0]
for line in dsec.splitlines():
    cells = [c.strip() for c in line.strip().strip('|').split('|')]
    if cells and re.match(r'^DEF-', cells[0]):
        defs.append(dict(id=cells[0], req=cells[1], test=cells[2], summary=cells[3], fix=cells[4], status=cells[5]))

rows = []
for ep, title in epic_title.items():
    n = sum(1 for r in reqs if r['epic'] == ep)
    rows.append(dict(title=f'[{ep}] {title}', description=f'Epic {ep}. {n} requirements. Source: BRD.md section 4.', type='epic', priority='medium', status='todo', assignee_email=''))
for r in reqs:
    d = [f"Epic: {r['epic']} {epic_title[r['epic']]}", f"Status: {ST[r['st']]}", f"Requirement: {r['text']}"]
    if r['tests']: d.append('Test cases: ' + r['tests'])
    if r['bugs']: d.append('Bugs: ' + r['bugs'])
    if r['src']: d.append('Source: ' + r['src'])
    rows.append(dict(title=f"[{r['id']}] {r['text'][:110]}", description='\n'.join(d), type='story', priority=prio_map[r['st']], status=stat_map[r['st']], assignee_email=''))
for b in defs:
    s = b['status'].lower()
    st = 'done' if s.startswith('fixed') or 'see appendix' in s else 'in_progress' if s.startswith('partial') else 'todo'
    pr = 'high' if s.startswith(('open', 'partial')) and b['id'] in ('DEF-025', 'DEF-026', 'DEF-028', 'DEF-030') else ('low' if 'nit' in s or 'minor' in s else 'medium')
    d = [f"Requirement: {b['req']}", f"Found by test: {b['test']}", f"Fix: {b['fix']}", f"Status: {b['status']}"]
    rows.append(dict(title=f"[{b['id']}] {b['summary'][:110]}", description='\n'.join(d), type='bug', priority=pr, status=st, assignee_email=''))

with open('jira/SE-jira-import.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=['title', 'description', 'type', 'priority', 'status', 'assignee_email'])
    w.writeheader(); w.writerows(rows)
print(len(epic_title), 'epics', len(reqs), 'stories', len(defs), 'bugs', len(rows), 'rows', len(tmap), 'tests mapped')
